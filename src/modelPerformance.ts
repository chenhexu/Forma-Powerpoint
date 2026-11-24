import type { Asset, Deck } from './types';

const MIB = 1024 ** 2;
export const EXPORT_TEXTURE_LIMIT = 1024;

type BufferView = {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  extensions?: object;
  target?: number;
  byteStride?: number;
};
type Image = { bufferView?: number; mimeType?: string; extensions?: object };
type Gltf = {
  buffers?: { byteLength: number; uri?: string; extensions?: object }[];
  bufferViews?: BufferView[];
  images?: Image[];
  textures?: unknown[];
  accessors?: {
    count: number;
    bufferView?: number;
    sparse?: { indices: { bufferView: number }; values: { bufferView: number } };
  }[];
  meshes?: { primitives: { mode?: number; indices?: number; attributes: { POSITION?: number } }[] }[];
  nodes?: {
    mesh?: number;
    children?: number[];
    extensions?: { EXT_mesh_gpu_instancing?: { attributes: Record<string, number> } };
  }[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
  extensionsUsed?: string[];
};

function readGlb(bytes: Uint8Array) {
  if (bytes.length < 20) return;
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    header.getUint32(0, true) !== 0x46546c67 ||
    header.getUint32(4, true) !== 2 ||
    header.getUint32(8, true) !== bytes.length ||
    header.getUint32(16, true) !== 0x4e4f534a
  )
    return;
  const jsonEnd = 20 + header.getUint32(12, true);
  if (jsonEnd > bytes.length) return;
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, jsonEnd))) as Gltf;
  const binEnd = jsonEnd + 8 <= bytes.length ? jsonEnd + 8 + header.getUint32(jsonEnd, true) : 0;
  const bin =
    binEnd >= jsonEnd + 8 &&
    binEnd <= bytes.length &&
    header.getUint32(jsonEnd + 4, true) === 0x004e4942 &&
    !gltf.buffers?.[0]?.uri
      ? bytes.subarray(jsonEnd + 8, binEnd)
      : undefined;
  return { gltf, bin, binEnd };
}

function imageSize(bytes: Uint8Array, mime?: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  if (
    mime === 'image/png' &&
    bytes.length >= 24 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(12) === 0x49484452
  )
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (mime !== 'image/jpeg' || bytes.length < 2 || view.getUint16(0) !== 0xffd8) return;
  // JPEG dimensions are in a Start of Frame segment before the scan data.
  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset++] !== 0xff) return;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) return;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) return;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 7)
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    offset += length;
  }
}

function embeddedImages(gltf: Gltf, bin?: Uint8Array) {
  if (!bin) return [];
  return (gltf.images || []).flatMap((image) => {
    const index = image.bufferView;
    if (index === undefined) return [];
    const view = gltf.bufferViews?.[index];
    const start = view?.byteOffset ?? 0;
    if (!view || view.buffer !== 0 || start < 0 || start + view.byteLength > bin.length) return [];
    const bytes = bin.subarray(start, start + view.byteLength);
    const size = imageSize(bytes, image.mimeType);
    return size ? [{ index, image, bytes, ...size }] : [];
  });
}

export type ModelStats = {
  bytes: number;
  triangles: number;
  drawCalls: number;
  textures: number;
  textureBytes: number;
  maxTexture: number;
  canShrinkTextures: boolean;
};

const modelStats = new WeakMap<Uint8Array, ModelStats>();

export function inspectModel(bytes: Uint8Array): ModelStats {
  const cached = modelStats.get(bytes);
  if (cached) return cached;
  const stats: ModelStats = {
    bytes: bytes.length,
    triangles: 0,
    drawCalls: 0,
    textures: 0,
    textureBytes: 0,
    maxTexture: 0,
    canShrinkTextures: false,
  };
  try {
    const parsed = readGlb(bytes);
    if (parsed) {
      const { gltf, bin } = parsed;
      const nodes = gltf.nodes || [];
      const visited = new Set<number>();
      const queue = [...(gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? nodes.map((_, index) => index))];
      while (queue.length) {
        const index = queue.pop()!;
        const node = nodes[index];
        if (!node || visited.has(index)) continue;
        visited.add(index);
        for (const child of node.children || []) queue.push(child);
        if (node.mesh === undefined) continue;
        const attributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
        const instanceAccessor = attributes && Object.values(attributes)[0];
        const instances =
          instanceAccessor === undefined ? 1 : (gltf.accessors?.[instanceAccessor]?.count ?? 1);
        for (const primitive of gltf.meshes?.[node.mesh]?.primitives || []) {
          stats.drawCalls++;
          const accessor = primitive.indices ?? primitive.attributes.POSITION;
          const count = accessor === undefined ? 0 : (gltf.accessors?.[accessor]?.count ?? 0);
          const mode = primitive.mode ?? 4;
          if (mode === 4) stats.triangles += Math.floor(count / 3) * instances;
          if (mode === 5 || mode === 6) stats.triangles += Math.max(0, count - 2) * instances;
        }
      }
      stats.textures = gltf.textures?.length || gltf.images?.length || 0;
      for (const { width, height } of embeddedImages(gltf, bin)) {
        stats.maxTexture = Math.max(stats.maxTexture, width, height);
        stats.textureBytes += width * height * 4;
      }
      stats.canShrinkTextures =
        stats.maxTexture > EXPORT_TEXTURE_LIMIT &&
        Boolean(optimizableViews(gltf, bin, parsed.binEnd, bytes.length));
    }
  } catch {
    // Office may preserve assets Forma cannot decode. The byte size still applies.
  }
  modelStats.set(bytes, stats);
  return stats;
}

// Advisory targets informed by Microsoft's 3D Content Guidelines for Office.
export function modelPerformanceWarnings(stats: ModelStats) {
  const warnings: string[] = [];
  if (stats.triangles > 40_000) warnings.push('dense geometry');
  if (stats.drawCalls > 6) warnings.push('many mesh parts');
  if (stats.bytes >= 50_000_000) warnings.push('large embedded file');
  if (stats.textures > 9 || stats.maxTexture > 2048 || stats.textureBytes > 40 * MIB)
    warnings.push('heavy textures');
  return warnings;
}

export function modelSizeLabel(bytes: number) {
  return bytes < MIB ? `${Math.max(1, Math.round(bytes / 1024))} KiB` : `${(bytes / MIB).toFixed(1)} MiB`;
}

export function exportModelWarnings(deck: Deck, assets: Record<string, Asset>) {
  const models = new Map<string, { key: string; name: string; stats: ModelStats; slides: number[] }>();
  const crowdedSlides: number[] = [];
  for (const [index, slide] of deck.slides.entries()) {
    let triangles = 0;
    let drawCalls = 0;
    let modelCount = 0;
    for (const object of slide.objects) {
      const key = object.asset;
      if (object.kind !== 'model' || !key || !assets[key]) continue;
      const stats = inspectModel(assets[key].bytes);
      triangles += stats.triangles;
      drawCalls += stats.drawCalls;
      modelCount++;
      let model = models.get(key);
      if (!model) {
        model = { key, name: object.name, stats, slides: [] };
        models.set(key, model);
      }
      if (model.slides.at(-1) !== index + 1) model.slides.push(index + 1);
    }
    if (modelCount > 1 && (triangles > 40_000 || drawCalls > 6)) crowdedSlides.push(index + 1);
  }
  return {
    models: [...models.values()].flatMap((model) => {
      const warnings = modelPerformanceWarnings(model.stats);
      return warnings.length ? [{ ...model, warnings }] : [];
    }),
    crowdedSlides,
  };
}

function optimizableViews(gltf: Gltf, bin: Uint8Array | undefined, binEnd: number, fileLength: number) {
  const views = gltf.bufferViews;
  const buffer = gltf.buffers?.[0];
  if (
    !bin ||
    binEnd !== fileLength ||
    !views ||
    !buffer ||
    gltf.buffers?.length !== 1 ||
    buffer.extensions ||
    buffer.byteLength > bin.length ||
    // These encodings can address geometry data outside the standard bufferView byte range.
    gltf.extensionsUsed?.some((extension) => /draco|meshopt/i.test(extension))
  )
    return;
  const ordered = views
    .map((view, index) => ({ view, index, offset: view.byteOffset ?? 0 }))
    .sort((a, b) => a.offset - b.offset);
  let end = 0;
  for (const { view, offset } of ordered) {
    if (
      view.buffer !== 0 ||
      view.extensions ||
      !Number.isInteger(offset) ||
      !Number.isInteger(view.byteLength) ||
      view.byteLength <= 0 ||
      offset < end ||
      offset + view.byteLength > buffer.byteLength
    )
      return;
    end = offset + view.byteLength;
  }
  return ordered;
}

export async function shrinkModelTextures(bytes: Uint8Array) {
  if (!inspectModel(bytes).canShrinkTextures) return bytes;
  const parsed = readGlb(bytes);
  if (!parsed?.bin) return bytes;
  const { gltf, bin } = parsed;
  const views = optimizableViews(gltf, bin, parsed.binEnd, bytes.length);
  if (!views) return bytes;
  const geometryViews = new Set(
    gltf.accessors?.flatMap((a) => [a.bufferView, a.sparse?.indices.bufferView, a.sparse?.values.bufferView]),
  );
  const replacements = new Map<number, Uint8Array>();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return bytes;
  try {
    for (const entry of embeddedImages(gltf, bin)) {
      const { index, image, width, height } = entry;
      const view = gltf.bufferViews![index];
      const scale = EXPORT_TEXTURE_LIMIT / Math.max(width, height);
      if (scale >= 1 || geometryViews.has(index) || view.target || view.byteStride || image.extensions)
        continue;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      try {
        const mime = image.mimeType!;
        const bitmap = await createImageBitmap(new Blob([entry.bytes as BlobPart], { type: mime }), {
          colorSpaceConversion: 'none',
          imageOrientation: 'none',
          resizeWidth: canvas.width,
          resizeHeight: canvas.height,
          resizeQuality: 'high',
        });
        try {
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        } finally {
          bitmap.close();
        }
        const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.85));
        if (encoded && encoded.type === mime && encoded.size < entry.bytes.length)
          replacements.set(index, new Uint8Array(await encoded.arrayBuffer()));
      } catch {
        // Keep the original image if the browser can't resize or encode it.
      }
    }
  } finally {
    canvas.width = canvas.height = 0;
  }
  if (!replacements.size) return bytes;
  const align = (size: number) => Math.ceil(size / 4) * 4;
  const chunks: { offset: number; data: Uint8Array }[] = [];
  let originalEnd = 0;
  let length = 0;
  for (const { view, index, offset } of views) {
    // Keep gaps and any trailing data. Only the image data is replaced.
    chunks.push({ offset: length, data: bin.subarray(originalEnd, offset) });
    length = align(length + offset - originalEnd);
    originalEnd = offset + view.byteLength;
    const data = replacements.get(index) ?? bin.subarray(offset, originalEnd);
    view.byteOffset = length;
    view.byteLength = data.length;
    chunks.push({ offset: length, data });
    length += data.length;
  }
  const buffer = gltf.buffers![0];
  const tail = bin.subarray(originalEnd, buffer.byteLength);
  chunks.push({ offset: length, data: tail });
  buffer.byteLength = length + tail.length;
  const binLength = align(buffer.byteLength);
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = align(json.length);
  const binStart = 28 + jsonLength;
  if (binStart + binLength >= bytes.length) return bytes;
  const output = new Uint8Array(binStart + binLength);
  const header = new DataView(output.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, output.length, true);
  header.setUint32(12, jsonLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20 + json.length, binStart - 8);
  output.set(json, 20);
  header.setUint32(binStart - 8, binLength, true);
  header.setUint32(binStart - 4, 0x004e4942, true);
  for (const { offset, data } of chunks) output.set(data, binStart + offset);
  return output;
}
