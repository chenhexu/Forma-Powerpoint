import { cloudClient } from './authClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeAsset } from './pptx';
import { uid, type Deck, type ModelSourceFile, type Project } from './types';

const manifestColumns = 'id,title,updated_at,trashed_at,revision,last_save_id';
const partSize = 5 * 1024 * 1024;
const partId = /^[0-9a-f]{64}$/;
const binaryType = 'application/octet-stream';

type PartList = { parts: string[]; size: number };
type MediaFile = PartList & { mime: string };
type ModelFile = MediaFile & { path: string };
export type Snapshot = {
  version: 1;
  deck: Deck;
  original: PartList;
  assets: Record<string, MediaFile>;
  modelSources?: Record<string, ModelFile[]>;
};

export type CloudDeckInfo = {
  id: string;
  title: string;
  updated_at: string;
  trashed_at: string | null;
  revision: number;
  last_save_id: string;
};
export type CloudDeckRow = CloudDeckInfo & { snapshot: unknown };

function client() {
  if (!cloudClient) throw new Error('Cloud storage is unavailable on this server.');
  return cloudClient;
}

function failed(error: { message: string }): never {
  throw new Error(error.message);
}

export async function listCloudDecks() {
  const { data, error } = await client()
    .from('presentations')
    .select(manifestColumns)
    .order('updated_at', { ascending: false })
    .returns<CloudDeckInfo[]>();
  if (error) failed(error);
  return data ?? [];
}

export async function getCloudDeck(id: string) {
  const { data, error } = await client()
    .from('presentations')
    .select(manifestColumns + ',snapshot')
    .eq('id', id)
    .maybeSingle<CloudDeckRow>();
  if (error) failed(error);
  return data;
}

export async function moveCloudDeck(deck: CloudDeckInfo, trash: boolean) {
  const { data, error } = await client()
    .from('presentations')
    .update({ trashed_at: trash ? new Date().toISOString() : null })
    .eq('id', deck.id)
    .eq('revision', deck.revision)
    .select(manifestColumns)
    .maybeSingle<CloudDeckInfo>();
  if (error) failed(error);
  if (!data) throw new Error('This deck changed in another session. Refresh the library and try again.');
  return data;
}

function readSnapshot(value: unknown): Snapshot {
  const snapshot = value as Partial<Snapshot> | null;
  if (
    snapshot?.version !== 1 ||
    !snapshot.deck ||
    !Array.isArray(snapshot.deck.slides) ||
    !snapshot.deck.slides.length ||
    !snapshot.original ||
    !snapshot.assets
  ) {
    throw new Error('This cloud deck uses a presentation format that Forma cannot open.');
  }
  return snapshot as Snapshot;
}

async function mapRecord<T, U>(record: Record<string, T>, map: (item: T) => Promise<U>) {
  const input = Object.entries(record);
  const result: [string, U][] = [];
  for (let offset = 0; offset < input.length; offset += 4) {
    const batch = await Promise.all(
      input.slice(offset, offset + 4).map(async ([id, item]): Promise<[string, U]> => [id, await map(item)]),
    );
    result.push(...batch);
  }
  return Object.fromEntries(result);
}

const samePartList = (a: PartList, b?: PartList) =>
  a.size === b?.size && a.parts.join(',') === b.parts.join(',');

export class ProjectFiles {
  private knownParts = new Set<string>();
  private uploaded = new WeakMap<Uint8Array | Blob, Promise<PartList>>();

  constructor(
    private connection: SupabaseClient,
    private bucketName: string,
    private directory: string,
  ) {}

  private partPath(part: string) {
    return this.directory + '/' + part;
  }

  private bucket() {
    return this.connection.storage.from(this.bucketName);
  }

  private put(source: Uint8Array | Blob) {
    const prior = this.uploaded.get(source);
    if (prior) return prior;
    const upload = this.uploadParts(source).catch((error) => {
      this.uploaded.delete(source);
      throw error;
    });
    this.uploaded.set(source, upload);
    return upload;
  }

  private async uploadParts(source: Uint8Array | Blob): Promise<PartList> {
    const size = source instanceof Blob ? source.size : source.byteLength;
    const parts: string[] = [];
    for (let offset = 0; offset < size; offset += partSize) {
      const slice = source.slice(offset, offset + partSize);
      const bytes = slice instanceof Blob ? await slice.arrayBuffer() : new Uint8Array(slice).buffer;
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (!this.knownParts.has(hash)) {
        const { error } = await this.bucket().upload(
          this.partPath(hash),
          new Blob([bytes], { type: binaryType }),
          {
            contentType: binaryType,
            upsert: false,
          },
        );
        if (error) {
          const status = 'statusCode' in error ? String(error.statusCode) : '';
          if (status !== '409' && !/already exists|duplicate/i.test(error.message)) failed(error);
        }
        this.knownParts.add(hash);
      }
      parts.push(hash);
    }
    return { parts, size };
  }

  private async get(ref: PartList, mime = binaryType) {
    if (
      !Number.isSafeInteger(ref?.size) ||
      ref.size < 0 ||
      !Array.isArray(ref.parts) ||
      ref.parts.length !== Math.ceil(ref.size / partSize) ||
      ref.parts.some((part) => typeof part !== 'string' || !partId.test(part))
    )
      throw new Error('This cloud deck contains an invalid file reference.');

    const blobs: Blob[] = [];
    for (const part of ref.parts) {
      const { data, error } = await this.bucket().download(this.partPath(part));
      if (error) failed(error);
      this.knownParts.add(part);
      blobs.push(data);
    }
    const blob = new Blob(blobs, { type: mime });
    if (blob.size !== ref.size) throw new Error('A cloud deck file did not download completely.');
    this.uploaded.set(blob, Promise.resolve(ref));
    return blob;
  }

  private async bytes(ref: PartList) {
    const bytes = new Uint8Array(await (await this.get(ref)).arrayBuffer());
    this.uploaded.set(bytes, Promise.resolve(ref));
    return bytes;
  }

  async read(value: unknown, previous?: { snapshot: Snapshot; project: Project }): Promise<Project> {
    const snapshot = readSnapshot(value);
    const original = previous && samePartList(snapshot.original, previous.snapshot.original)
      ? previous.project.original
      : await this.bytes(snapshot.original);
    const assets = await mapRecord(Object.fromEntries(
      Object.entries(snapshot.assets).map(([id, ref]) => [id, { id, ref }]),
    ), async ({ id, ref }) => {
      const prior = previous?.snapshot.assets[id];
      const loaded = previous?.project.assets[id];
      return loaded && ref.mime === prior?.mime && samePartList(ref, prior)
        ? loaded
        : makeAsset(await this.bytes(ref), ref.mime);
    });
    const modelSources = snapshot.modelSources
      ? await mapRecord(Object.fromEntries(
        Object.entries(snapshot.modelSources).map(([id, files]) => [id, { id, files }]),
      ), async ({ id, files }) => {
          const result: ModelSourceFile[] = [];
          const prior = previous?.snapshot.modelSources?.[id];
          const loaded = previous?.project.modelSources?.[id];
          for (const [index, { mime, path, ...ref }] of files.entries()) {
            const before = prior?.[index];
            const source = loaded?.[index];
            result.push(source && path === before?.path && mime === before.mime && samePartList(ref, before)
              ? source : { path, file: await this.get(ref, mime) });
          }
          return result;
        })
      : undefined;
    return { deck: snapshot.deck, original, assets, modelSources };
  }

  async snapshot(project: Project): Promise<Snapshot> {
    const original = await this.put(project.original);
    const assets = await mapRecord(project.assets, async ({ bytes, mime }) => ({
      ...(await this.put(bytes)),
      mime,
    }));
    const modelSources = project.modelSources
      ? await mapRecord(project.modelSources, async (files) => {
          const result: ModelFile[] = [];
          for (const { file, path } of files)
            result.push({ ...(await this.put(file)), mime: file.type, path });
          return result;
        })
      : undefined;
    return { version: 1, deck: project.deck, original, assets, modelSources };
  }
}

export class CloudDeckFiles extends ProjectFiles {
  constructor(private ownerId: string, private deckId: string) {
    super(client(), 'forma-parts', [ownerId, deckId].join('/'));
  }

  async save(project: Project, saveId: string, revision?: number) {
    const values = {
      title: project.deck.name.trim().slice(0, 1000) || 'Untitled presentation',
      snapshot: await this.snapshot(project),
      last_save_id: saveId,
    };
    if (revision === undefined) {
      const { data, error } = await client()
        .from('presentations')
        .insert({ id: this.deckId, owner_id: this.ownerId, ...values })
        .select(manifestColumns)
        .single<CloudDeckInfo>();
      if (error) failed(error);
      return data;
    }

    const { data, error } = await client()
      .from('presentations')
      .update(values)
      .eq('id', this.deckId)
      .eq('owner_id', this.ownerId)
      .eq('revision', revision)
      .is('trashed_at', null)
      .select(manifestColumns)
      .maybeSingle<CloudDeckInfo>();
    if (error) failed(error);
    if (data) return data;
    // A previous response may have been lost after the row was committed.
    const remote = await getCloudDeck(this.deckId);
    if (remote && !remote.trashed_at && remote.last_save_id === saveId) return remote;
    throw new CloudConflict();
  }
}

export class CloudConflict extends Error {
  constructor() {
    super('This deck changed in another session.');
  }
}

export async function createCloudDeck(ownerId: string, project: Project) {
  const id = uid();
  return new CloudDeckFiles(ownerId, id).save(project, uid());
}
