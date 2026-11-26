import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudClient, collaborationGuestClient, deckIdPattern } from './authClient';
import { ProjectFiles, type Snapshot } from './cloudStore';
import type { RoomVersion } from './collaboration';
import { applyDeckPatch, diffDeck } from './deckPatch.mjs';
import { uid, type Project } from './types';

export type ShareRole = 'viewer' | 'commenter' | 'editor';
export type RoomParticipant = { id: string; name?: string; email?: string | null; role: ShareRole | 'owner' };
export type RoomInvite = { email: string; role: ShareRole; joined: boolean };
export type SharedRoomInfo = {
  self: RoomParticipant;
  participants: RoomParticipant[];
  linkRole: ShareRole | null;
  token: string | null;
  versions: RoomVersion[];
  invites: RoomInvite[] | null;
};
type ReadResponse = SharedRoomInfo & {
  revision: number;
  snapshot: Snapshot | null;
  lastSaveId: string | null;
};
export type SharedRoomState = { info: SharedRoomInfo; project: Project; saving?: boolean; error?: string; retrying?: boolean; revoked?: boolean };
type Change = { id: string; project: Project };

const shapes = ['Circle', 'Triangle', 'Square', 'Diamond', 'Pentagon', 'Hexagon', 'Star', 'Crescent'];
export const guestShape = (id: string) => parseInt(id.slice(0, 2), 16) % shapes.length;
export const participantName = (person: RoomParticipant) => person.name || 'Guest ' + shapes[guestShape(person.id)];
export const sharePath = (id: string, token?: string | null) => '/share/' + id + (token ? '#' + token : '');
export const isRoomToken = (token: string) => /^[\da-f]{64}$/.test(token);

export function parseShareCode(value: string) {
  const input = value.trim();
  const code = input.match(/^([\da-f-]+)\.([\da-f]+)$/);
  if (code && deckIdPattern.test(code[1]) && isRoomToken(code[2])) return sharePath(code[1], code[2]);
  try {
    const url = new URL(input, location.origin);
    const id = url.pathname.match(/^\/share\/([^/]+)$/)?.[1];
    if (url.origin === location.origin && id && deckIdPattern.test(id)) {
      const token = url.hash.slice(1);
      if (!token || isRoomToken(token)) return sharePath(id, token);
    }
  } catch {}
}

function accountClient() {
  if (!cloudClient) throw new Error('Cloud collaboration is unavailable on this server.');
  return cloudClient;
}
async function rpc<T>(client: SupabaseClient, procedure: string, args?: Record<string, unknown>) {
  const { data, error } = await client.rpc('forma_room_' + procedure, args);
  if (error) {
    const message = error.code === 'PGRST202'
      ? 'Cloud collaboration needs the Forma collaboration migration in Supabase.'
      : error.message;
    throw Object.assign(new Error(message), { code: error.code });
  }
  return data as T;
}

let guestSignIn: Promise<SupabaseClient> | undefined;
function getGuestClient() {
  return guestSignIn ??= (async () => {
    const client = collaborationGuestClient();
    const session = await client.auth.getSession();
    if (!session.data.session) {
      const { error } = await client.auth.signInAnonymously();
      if (error) throw error;
    }
    return client;
  })().finally(() => { guestSignIn = undefined; });
}

export async function listSharedRooms() {
  return rpc<{ id: string; title: string; role: RoomParticipant['role'] }[]>(accountClient(), 'list');
}

export async function createSharedRoom(project: Project, linkRole: ShareRole | null) {
  const client = accountClient();
  const id = await rpc<string>(client, 'create', { p_title: project.deck.name, p_link_role: linkRole });
  const p_snapshot = await new ProjectFiles(client, 'forma-room-parts', id).snapshot(project);
  await rpc<number>(client, 'save', { p_id: id, p_revision: 0, p_snapshot, p_save_id: uid() });
  return id;
}

export class SharedRoom {
  private readonly connection = uid();
  private readonly files: ProjectFiles;
  private readonly observers = new Set<() => void>();
  private readonly assetUrls = new Set<string>();
  private remote!: { snapshot: Snapshot; project: Project };
  private revision = -1;
  private changeToSave?: Change;
  private working?: Promise<void>;
  private timer?: number;
  private closed = false;
  private stopped = false;
  private state!: SharedRoomState;

  private constructor(readonly id: string, private client: SupabaseClient) {
    this.files = new ProjectFiles(client, 'forma-room-parts', id);
  }

  static async open(id: string, token: string | null, signedIn: boolean) {
    const client = signedIn ? accountClient() : await getGuestClient();
    const room = new SharedRoom(id, client);
    try {
      await room.call('join', { p_token: token });
      await room.read();
      return room;
    } catch (error) {
      room.close();
      throw error;
    }
  }

  private call<T>(operation: string, args: Record<string, unknown> = {}) {
    return rpc<T>(this.client, operation, { p_id: this.id, ...args });
  }

  getState = () => this.state;

  subscribe = (listener: () => void) => {
    this.observers.add(listener);
    return () => { this.observers.delete(listener); };
  };

  private publish(state: SharedRoomState) {
    if (this.closed) return;
    this.state = state;
    for (const notify of this.observers) notify();
  }

  start() {
    this.schedule(1200);
  }

  private schedule(delay: number) {
    if (this.closed || this.stopped) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.sync(); }, delay);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    window.clearTimeout(this.timer);
    for (const url of this.assetUrls) URL.revokeObjectURL(url);
    this.assetUrls.clear();
    // Wait for the last heartbeat so it cannot add this connection back after leaving.
    void Promise.resolve(this.working).finally(() =>
      this.call('leave', { p_connection: this.connection }).catch(() => {}),
    );
  }

  get pending() { return !!this.changeToSave; }

  change(project: Project) {
    if (this.closed || this.stopped || project === this.state.project ||
        !['owner', 'editor'].includes(this.state.info.self.role)) return;
    this.trackAssets(project);
    this.changeToSave = { id: uid(), project };
    this.publish({ ...this.state, project, saving: true });
    this.schedule(180);
  }

  private trackAssets(project: Project) {
    for (const asset of Object.values(project.assets)) this.assetUrls.add(asset.url);
  }

  private async read() {
    const { snapshot, revision, lastSaveId, ...info } = await this.call<ReadResponse>('read', {
      p_revision: this.revision, p_connection: this.connection,
    });
    if (this.closed) return;
    let project = this.state?.project;
    if (snapshot) {
      const pending = this.changeToSave;
      const remote = await this.files.read(snapshot, this.remote);
      if (this.closed) {
        for (const asset of Object.values(remote.assets)) URL.revokeObjectURL(asset.url);
        return;
      }
      this.trackAssets(remote);
      project = remote;
      // Changes can arrive from the editor while the new revision's files are downloading.
      const change = this.changeToSave;
      if (change && ['owner', 'editor'].includes(info.self.role)) {
        const base = pending && pending.id === lastSaveId ? pending.project : this.remote.project;
        if (change.id === lastSaveId) {
          this.changeToSave = undefined;
        } else {
          const local = change.project;
          const added = Object.fromEntries(Object.entries(local.assets).filter(([id, asset]) => base.assets[id] !== asset));
          project = {
            deck: applyDeckPatch(remote.deck, diffDeck(base.deck, local.deck)),
            original: base.original === local.original ? remote.original : local.original,
            assets: { ...remote.assets, ...added },
            modelSources: base.modelSources === local.modelSources ? remote.modelSources : local.modelSources,
          };
          this.changeToSave = { ...change, project };
        }
      }
      this.remote = { snapshot, project: remote };
      this.revision = revision;
    }
    if (!['owner', 'editor'].includes(info.self.role)) {
      this.changeToSave = undefined;
      project = this.remote.project;
    }
    const saving = this.pending;
    if (!this.state || project !== this.state.project || this.state.error || saving !== this.state.saving ||
        JSON.stringify(info) !== JSON.stringify(this.state.info)) this.publish({ info, project, saving });
  }

  sync() {
    if (this.working) return this.working;
    if (this.closed || this.stopped) return Promise.resolve();
    this.working = this.synchronize().catch((error: Error & { code?: string }) => {
      if (error.code === '42501') {
        this.stopped = true;
        this.publish({ ...this.state, revoked: true, error: error.message });
      } else {
        this.publish({ ...this.state, error: error.message, retrying: true });
      }
    }).finally(() => {
      this.working = undefined;
      this.schedule(this.state.retrying ? 2500 : this.changeToSave ? 180 : 1200);
    });
    return this.working;
  }

  private async synchronize() {
    await this.read();
    const change = this.changeToSave;
    if (!change || this.closed) return;
    const p_snapshot = await this.files.snapshot(change.project);
    if (this.closed) return;
    const next = await this.call<number | null>('save', {
      p_revision: this.revision, p_snapshot, p_save_id: change.id,
    });
    if (next === null || this.closed) return;
    this.revision = next;
    this.remote = { snapshot: p_snapshot, project: change.project };
    if (change === this.changeToSave) this.changeToSave = undefined;
    // Refresh if another save was applied after our request committed but before we got its response.
    await this.read();
  }

  async finishEditing() {
    while (this.changeToSave && !this.closed) {
      await this.sync();
      if (this.state.error) throw new Error(this.state.error);
    }
  }

  async access(role: ShareRole | null, rotate = false) {
    await this.call('access', { p_link_role: role, p_rotate: rotate });
    await this.sync();
  }

  async invite(email: string, role: ShareRole | null) {
    await this.call('invite', { p_email: email, p_role: role });
    await this.sync();
  }

  async sendEmail(email: string) {
    const { data } = await this.client.auth.getSession();
    if (!data.session) throw new Error('Sign in to send an invitation.');
    const response = await fetch('/api/room-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
      body: JSON.stringify({ roomId: this.id, email }),
    });
    if (response.status === 404 || response.status === 503 || !response.headers.get('content-type')?.includes('application/json')) return false;
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The email could not be sent.');
    return true;
  }

  async checkpoint(name: string | null, restore: string | null = null) {
    await this.finishEditing();
    await this.call('checkpoint', { p_name: name, p_restore: restore });
    await this.sync();
  }

  async comment(slide: string, input: { id: string; text?: string; replyTo?: string; resolved?: boolean }) {
    await this.call('comment', {
      p_slide: slide, p_comment: input.id, p_text: input.text ?? null,
      p_reply: input.replyTo ?? null, p_resolved: input.resolved ?? null,
    });
    await this.sync();
  }
}
