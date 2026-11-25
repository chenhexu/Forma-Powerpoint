import { del, get, keys, set, update } from 'idb-keyval';
import { CloudConflict, CloudDeckFiles, getCloudDeck } from './cloudStore';
import { restoreProjectData, storeProjectData, type StoredProject } from './storage';
import { uid, type Project } from './types';

type Change = { id: string; project: Project };
type Draft = {
  revision: number;
  updatedAt: number;
  changeId: string;
  project: StoredProject;
};
type PriorDraft = { key: string; draft: Draft };
export type CloudSaveStatus = {
  phase: 'saved' | 'pending' | 'saving' | 'offline' | 'error' | 'conflict';
  label: string;
  error?: string;
};

const draftPrefix = (ownerId: string, deckId: string) => ['forma-cloud', ownerId, deckId, ''].join(':');

async function findDraft(prefix: string, previous: string | null): Promise<PriorDraft | undefined> {
  if (previous) {
    const key = prefix + previous;
    const own = await get<Draft>(key);
    if (own) return { key, draft: own };
  }
  const candidates = (await keys()).filter(
    (key): key is string => typeof key === 'string' && key.startsWith(prefix),
  );
  let newest: PriorDraft | undefined;
  for (const candidate of candidates) {
    const draft = await get<Draft>(candidate);
    if (draft && (!newest || draft.updatedAt > newest.draft.updatedAt)) newest = { key: candidate, draft };
  }
  return newest;
}

function clearDraft({ key, draft }: PriorDraft) {
  return update<Draft | undefined>(key, (current) =>
    current?.changeId === draft.changeId ? undefined : current,
  );
}

function offlineError(error: unknown) {
  return !navigator.onLine || (error instanceof Error && /fetch|network|load failed/i.test(error.message));
}

export class CloudWorkspace {
  private localQueue = Promise.resolve();
  private pending?: Change;
  private saving?: Promise<void>;
  private remoteTimer?: number;
  private localTimer?: number;
  private listener?: (state: CloudSaveStatus) => void;
  private persisted?: string;
  private latest: Project;
  private closed = false;
  private conflict: boolean;
  status: CloudSaveStatus = { phase: 'saved', label: 'Saved to My Decks' };

  constructor(
    readonly id: string,
    readonly project: Project,
    private files: CloudDeckFiles,
    private key: string,
    private revision: number,
    private prior?: PriorDraft,
    conflict = false,
  ) {
    this.latest = project;
    this.conflict = conflict;
    if (prior) {
      this.pending = { id: prior.draft.changeId, project };
      this.persisted = this.pending.id;
      this.status = conflict
        ? { phase: 'conflict', label: 'Cloud save conflict' }
        : { phase: 'pending', label: 'Recovered unsynced edits' };
    }
  }

  private report(status: CloudSaveStatus) {
    this.status = status;
    this.listener?.(status);
  }

  watch(listener: (state: CloudSaveStatus) => void) {
    this.closed = false;
    this.listener = listener;
    listener(this.status);
    if (this.pending && !this.conflict) this.scheduleSave();
    return () => {
      if (this.needsLocalSave) void this.flushLocal().catch(() => {});
      this.closed = true;
      this.listener = undefined;
      window.clearTimeout(this.localTimer);
      window.clearTimeout(this.remoteTimer);
    };
  }

  get needsLocalSave() {
    return !!this.pending && this.pending.id !== this.persisted;
  }

  track(project: Project) {
    if (project === this.latest) return;
    this.latest = project;
    this.pending = { id: uid(), project };
    if (!this.conflict) this.report({ phase: 'pending', label: 'Waiting to save…' });
    window.clearTimeout(this.localTimer);
    this.localTimer = window.setTimeout(() => {
      void this.flushLocal().catch(() => this.localError());
    }, 250);
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.conflict || this.closed) return;
    window.clearTimeout(this.remoteTimer);
    this.remoteTimer = window.setTimeout(() => void this.sync(), 900);
  }

  private localError() {
    this.report({
      phase: this.conflict ? 'conflict' : 'error',
      label: 'Local draft unavailable',
      error: 'Forma could not store a recovery draft on this device.',
    });
  }

  flushLocal() {
    return this.enqueueLocal(async () => {
      const pending = this.pending;
      if (pending) {
        await set(this.key, {
          revision: this.revision,
          updatedAt: Date.now(),
          changeId: pending.id,
          project: storeProjectData(pending.project),
        } satisfies Draft);
        this.persisted = pending.id;
      } else {
        await del(this.key);
        this.persisted = undefined;
      }
    });
  }

  private enqueueLocal(work: () => Promise<void>) {
    this.localQueue = this.localQueue.catch(() => {}).then(work);
    return this.localQueue;
  }

  sync(): Promise<void> {
    if (this.saving) return this.saving;
    if (!this.pending || this.conflict || this.closed) return Promise.resolve();
    this.saving = this.save(this.pending).finally(() => {
      this.saving = undefined;
    });
    return this.saving;
  }

  async finishEditing() {
    while (this.pending) {
      const change = this.pending;
      await this.sync();
      if (change === this.pending) break;
    }
    if (this.needsLocalSave) await this.flushLocal();
  }

  private async save(change: Change) {
    await this.flushLocal().catch(() => this.localError());
    if (this.closed) return;
    if (change !== this.pending) {
      this.scheduleSave();
      return;
    }
    if (!navigator.onLine) {
      this.report({
        phase: 'offline',
        label: this.needsLocalSave ? 'Offline · unsaved edits' : 'Offline · draft on this device',
      });
      return;
    }

    this.report({ phase: 'saving', label: 'Saving to My Decks…' });
    try {
      const result = await this.files.save(change.project, change.id, this.revision);
      this.revision = result.revision;
    } catch (error) {
      this.conflict = error instanceof CloudConflict;
      const offline = offlineError(error);
      this.report({
        phase: this.conflict ? 'conflict' : offline ? 'offline' : 'error',
        label: this.conflict
          ? 'Cloud save conflict'
          : offline
            ? this.needsLocalSave
              ? 'Offline · unsaved edits'
              : 'Offline · draft on this device'
            : 'Cloud save failed',
        error: error instanceof Error ? error.message : 'The deck could not be saved.',
      });
      return;
    }

    if (this.pending === change) this.pending = undefined;
    await this.flushLocal().catch(() => {});
    if (this.prior && this.prior.key !== this.key) await clearDraft(this.prior).catch(() => {});
    this.prior = undefined;
    if (!this.pending) this.report({ phase: 'saved', label: 'Saved to My Decks' });
    else this.scheduleSave();
  }

  async discardDraft() {
    window.clearTimeout(this.remoteTimer);
    window.clearTimeout(this.localTimer);
    this.pending = undefined;
    const prior = this.prior;
    await this.enqueueLocal(async () => {
      await del(this.key);
      if (prior && prior.key !== this.key) await clearDraft(prior);
    });
  }
}

export async function openCloudWorkspace(ownerId: string, id: string) {
  const prefix = draftPrefix(ownerId, id);
  const previous = sessionStorage.getItem(prefix);
  const writer = uid();
  sessionStorage.setItem(prefix, writer);
  const key = prefix + writer;
  const prior = await findDraft(prefix, previous).catch(() => undefined);
  const files = new CloudDeckFiles(ownerId, id);
  const remote = await getCloudDeck(id).catch((error) => {
    if (prior && offlineError(error)) return undefined;
    throw error;
  });

  if (prior && remote && !remote.trashed_at && remote.last_save_id === prior.draft.changeId) {
    const project = restoreProjectData(prior.draft.project);
    await clearDraft(prior).catch(() => {});
    return new CloudWorkspace(id, project, files, key, remote.revision);
  }
  if (prior) {
    const conflict =
      remote !== undefined && (!remote || !!remote.trashed_at || remote.revision !== prior.draft.revision);
    return new CloudWorkspace(
      id,
      restoreProjectData(prior.draft.project),
      files,
      key,
      prior.draft.revision,
      prior,
      conflict,
    );
  }
  if (!remote || remote.trashed_at) throw new Error('This deck is unavailable or in Trash.');
  return new CloudWorkspace(id, await files.read(remote.snapshot), files, key, remote.revision);
}
