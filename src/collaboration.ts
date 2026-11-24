import { applyDeckPatch, diffDeck, type DeckPatch } from './deckPatch.mjs';
import { makeAsset } from './pptx';
import { uid, type Deck, type Project } from './types';

type EncodedAsset = { bytes: string; mime: string };
type WireProject = { deck: Deck; original: string; assets: Record<string, EncodedAsset> };
type ProjectPatch = { deck?: DeckPatch; original?: string; assets?: Record<string, EncodedAsset> };
type Pending = { sequence: number; originalVersion: number; patch: ProjectPatch; decoded: Partial<Project> };
export type RoomVersion = { id: string; name: string; date: number };
export type RoomStatus = {
  state: 'idle' | 'connecting' | 'connected' | 'reconnecting';
  code?: string;
  people: number;
  versions: RoomVersion[];
  error?: string;
};
type RoomMessage =
  | { type: 'error'; message: string }
  | { type: 'members'; count: number }
  | { type: 'versions'; versions: RoomVersion[] }
  | {
      type: 'welcome' | 'state';
      code?: string;
      state: WireProject;
      ack: number;
      originalVersion: number;
      versions: RoomVersion[];
    }
  | { type: 'edit'; client: string; sequence: number; patch: ProjectPatch; originalVersion: number };

export const emptyRoom: RoomStatus = { state: 'idle', people: 0, versions: [] };
export const hasRoomCode = (value: string) => /^[\w-]{32}$/.test(value.trim());

function encode(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 24576)
    parts.push(String.fromCharCode(...bytes.subarray(i, i + 24576)));
  return btoa(parts.join(''));
}
const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
function binarySize(project: Project) {
  return (
    project.original.byteLength +
    Object.values(project.assets).reduce((size, a) => size + a.bytes.byteLength, 0)
  );
}
function encodeProject(project: Project): WireProject {
  if (binarySize(project) > 65 * 1024 * 1024)
    throw new Error('This presentation is too large for a live room.');
  return {
    deck: project.deck,
    original: encode(project.original),
    assets: Object.fromEntries(
      Object.entries(project.assets).map(([id, item]) => [
        id,
        { bytes: encode(item.bytes), mime: item.mime },
      ]),
    ),
  };
}

function projectPatch(
  before: Project,
  after: Project,
): { wire: ProjectPatch; decoded: Partial<Project> } | undefined {
  const deck = diffDeck(before.deck, after.deck);
  const original = before.original !== after.original ? after.original : undefined;
  const changed = Object.entries(after.assets).filter(([id, asset]) => before.assets[id] !== asset);
  if (!deck && !original && !changed.length) return;
  if ((original || changed.length) && binarySize(after) > 65 * 1024 * 1024)
    throw new Error('This presentation is too large for a live room.');
  const assets = changed.length ? Object.fromEntries(changed) : undefined;
  return {
    wire: {
      deck,
      original: original && encode(original),
      assets:
        assets &&
        Object.fromEntries(changed.map(([id, item]) => [id, { mime: item.mime, bytes: encode(item.bytes) }])),
    },
    decoded: { original, assets },
  };
}

function apply(project: Project, patch: ProjectPatch, reuse?: Partial<Project>): Project {
  const incoming =
    reuse?.assets ??
    Object.fromEntries(
      Object.entries(patch.assets ?? {}).map(([id, { bytes, mime }]) => [id, makeAsset(decode(bytes), mime)]),
    );
  return {
    ...project,
    original: reuse?.original ?? (patch.original ? decode(patch.original) : project.original),
    deck: applyDeckPatch(project.deck, patch.deck),
    assets: patch.assets ? { ...project.assets, ...incoming } : project.assets,
  };
}

export class RoomClient {
  private socket?: WebSocket;
  private reconnect?: number;
  private retryCount = 0;
  private client = uid();
  private sequence = 0;
  private originalVersion = 0;
  private status = emptyRoom;
  private optimistic?: Project;
  private confirmed?: Project;
  private latest?: Project;
  private flushScheduled = false;
  private encodedBase?: string;
  private pending: Pending[] = [];
  private source?: Project;

  constructor(
    private callbacks: {
      onStatus: (status: RoomStatus) => void;
      onProject: (project: Project, kind: 'join' | 'restore' | 'edit', patch?: DeckPatch) => void;
    },
  ) {}

  private publish(change: Partial<RoomStatus>) {
    this.status = { ...this.status, ...change };
    this.callbacks.onStatus(this.status);
  }

  open(type: 'create' | 'join', project: Project, code?: string) {
    this.close();
    this.client = uid();
    this.source = project;
    try {
      this.connect(
        type === 'create' ? { type, state: encodeProject(project) } : { type, code: code?.trim() },
      );
    } catch (error) {
      this.publish({ error: error instanceof Error ? error.message : 'The room could not be opened.' });
    }
  }

  private connect(request: { type: 'join'; code?: string } | { type: 'create'; state: WireProject }) {
    const url = new URL('/forma-rooms', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    this.socket = socket;
    this.publish({ state: this.status.code ? 'reconnecting' : 'connecting', error: undefined });
    socket.onopen = () => this.send({ ...request, client: this.client });
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      try {
        this.receive(JSON.parse(event.data) as RoomMessage, request.type);
      } catch {
        this.fail('The shared presentation could not be updated. Your local copy is still open.');
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      const code = this.status.code;
      if (!code) {
        this.publish({ state: 'idle', error: 'The collaboration relay is unavailable at this address.' });
        return;
      }
      this.publish({ state: 'reconnecting', people: 0 });
      const delay = Math.min(5000, 400 * 2 ** this.retryCount++);
      this.reconnect = window.setTimeout(() => this.connect({ type: 'join', code }), delay);
    };
  }

  private send(message: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private fail(error: string) {
    this.close();
    this.publish({ error });
  }

  private decodeState(state: WireProject, preferred?: Project): Project {
    const previous = preferred ?? this.confirmed;
    const assets = Object.fromEntries(
      Object.entries(state.assets).map(([id, asset]) => [
        id,
        previous?.assets[id] ?? makeAsset(decode(asset.bytes), asset.mime),
      ]),
    );
    const original =
      this.encodedBase === state.original && previous
        ? previous.original
        : preferred
          ? preferred.original
          : decode(state.original);
    this.encodedBase = state.original;
    return { deck: state.deck, original, assets, modelSources: previous?.modelSources };
  }

  private receive(message: RoomMessage, request: 'join' | 'create') {
    if (message.type === 'error') {
      this.fail(message.message);
      return;
    }
    if (message.type === 'members') {
      this.publish({ people: message.count });
      return;
    }
    if (message.type === 'versions') {
      this.publish({ versions: message.versions });
      return;
    }
    this.flush();
    if (message.type === 'welcome' || message.type === 'state') {
      const joining = !this.status.code;
      const own = joining && request === 'create' ? this.source : undefined;
      this.confirmed = this.decodeState(message.state, own);
      this.originalVersion = message.originalVersion;
      this.pending = this.pending.filter(({ sequence }) => sequence > message.ack);
      this.publish({
        state: 'connected',
        code: message.code ?? this.status.code,
        versions: message.versions,
      });
      this.retryCount = 0;
      this.update(joining ? 'join' : 'restore', undefined, own);
      if (message.type === 'welcome')
        for (const { sequence, patch, originalVersion } of this.pending)
          this.send({ type: 'edit', sequence, patch, originalVersion });
      return;
    }
    if (message.type !== 'edit' || !this.confirmed) return;
    const local = message.client === this.client;
    const acknowledged = local && this.pending.find(({ sequence }) => sequence === message.sequence);
    this.confirmed = apply(this.confirmed, message.patch, acknowledged ? acknowledged.decoded : undefined);
    this.originalVersion = message.originalVersion;
    if (message.patch.original) this.encodedBase = message.patch.original;
    if (local) this.pending = this.pending.filter(({ sequence }) => sequence > message.sequence);
    // Local acknowledgements rarely change the optimistic view. A remote edit is applied to local undo history.
    this.update('edit', local ? undefined : message.patch.deck);
  }

  private update(kind: 'join' | 'restore' | 'edit', patch?: DeckPatch, own?: Project) {
    if (!this.confirmed) return;
    const desired = this.pending.reduce(
      (project, item) => apply(project, item.patch, item.decoded),
      this.confirmed,
    );
    const previous = this.optimistic ?? own;
    const changed =
      !previous ||
      !!diffDeck(previous.deck, desired.deck) ||
      previous.original !== desired.original ||
      Object.keys(previous.assets).length !== Object.keys(desired.assets).length ||
      Object.entries(desired.assets).some(([id, item]) => previous.assets[id] !== item);
    if (kind !== 'edit' || changed) {
      this.optimistic = desired;
      this.callbacks.onProject(desired, kind, patch);
    }
  }

  change(project: Project) {
    if (!this.optimistic) return;
    this.latest = project;
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => this.flush());
  }

  private flush() {
    this.flushScheduled = false;
    const next = this.latest;
    this.latest = undefined;
    if (!next || !this.optimistic || next === this.optimistic) return;
    try {
      const patch = projectPatch(this.optimistic, next);
      this.optimistic = next;
      if (!patch) return;
      const sequence = ++this.sequence;
      const originalVersion =
        this.originalVersion + this.pending.filter((item) => item.patch.original).length;
      this.pending.push({ sequence, originalVersion, patch: patch.wire, decoded: patch.decoded });
      if (this.status.state === 'connected')
        this.send({ type: 'edit', sequence, originalVersion, patch: patch.wire });
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'The change could not be shared.');
    }
  }

  checkpoint(name: string) {
    this.flush();
    this.send({ type: 'checkpoint', name });
  }

  restore(id: string) {
    this.flush();
    this.send({ type: 'restore', id });
  }

  close() {
    window.clearTimeout(this.reconnect);
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.sequence = 0;
    this.originalVersion = 0;
    this.retryCount = 0;
    this.source = this.confirmed = this.optimistic = this.latest = undefined;
    this.encodedBase = undefined;
    this.pending = [];
    this.publish(emptyRoom);
  }
}
