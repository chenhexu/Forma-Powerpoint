import type { Asset } from './types';

const contentTypes: Record<string, string> = {
  png: 'image/png',
  apng: 'image/apng',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  heic: 'image/heic',
  heif: 'image/heif',
  jxl: 'image/jxl',
};
const extensions = {
  ...Object.fromEntries(Object.entries(contentTypes).map(([ext, mime]) => [mime, ext])),
  'image/jpeg': 'jpeg',
} as Record<string, string>;
const nativeTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/tiff']);
export const pictureAccept = ['image/*', ...Object.keys(contentTypes).map((ext) => `.${ext}`)].join(',');
export const pictureExtension = (mime: string) => extensions[mime] ?? 'img';
export const pictureType = (file: File) =>
  contentTypes[file.name.split('.').at(-1)?.toLowerCase() ?? ''] ||
  (file.type.startsWith('image/') ? file.type : '');
export const pictureFormats = [
  ['PNG', 'image/png'],
  ['JPEG', 'image/jpeg'],
  ['WebP', 'image/webp'],
  ['BMP', 'image/bmp'],
  ['ICO', 'image/x-icon'],
] as const;
export type PictureDownload = (typeof pictureFormats)[number][1];
export const pictureFormatName = (mime: string) =>
  pictureFormats.find(([, type]) => type === mime)?.[0] ??
  (extensions[mime] ?? mime.replace(/^image\//, '')).toUpperCase();

async function withPicture<T>(
  blob: Blob,
  use: (source: CanvasImageSource, width: number, height: number) => T | Promise<T>,
) {
  const bitmap = await createImageBitmap(blob).catch(() => undefined);
  if (bitmap) {
    try {
      return await use(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return await use(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function encodePicture(
  source: CanvasImageSource,
  width: number,
  height: number,
  mime: PictureDownload,
) {
  const canvas = document.createElement('canvas');
  const iconScale = mime === 'image/x-icon' ? Math.min(1, 256 / Math.max(width, height)) : 1;
  canvas.width = Math.max(1, Math.round(width * iconScale));
  canvas.height = Math.max(1, Math.round(height * iconScale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This picture could not be converted.');
  if (mime === 'image/jpeg' || mime === 'image/bmp') {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (mime === 'image/bmp') return encodeBitmap(context.getImageData(0, 0, width, height));
  const canvasMime = mime === 'image/x-icon' ? 'image/png' : mime;
  const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, canvasMime, 0.94));
  if (!encoded || encoded.type !== canvasMime)
    throw new Error(`This browser could not save the picture as ${pictureFormatName(mime)}.`);
  if (mime === 'image/x-icon') return encodeIcon(encoded, canvas.width, canvas.height);
  return encoded;
}

function encodeBitmap({ width, height, data }: ImageData) {
  const offset = 54;
  const stride = Math.ceil((width * 3) / 4) * 4;
  const bytes = new Uint8Array(offset + stride * height);
  const header = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d]);
  header.setUint32(2, bytes.length, true);
  header.setUint32(10, offset, true);
  header.setUint32(14, 40, true);
  header.setInt32(18, width, true);
  header.setInt32(22, height, true);
  header.setUint16(26, 1, true);
  header.setUint16(28, 24, true);
  header.setUint32(34, stride * height, true);
  for (let y = 0; y < height; y++) {
    let source = (height - 1 - y) * width * 4;
    let target = offset + y * stride;
    for (let x = 0; x < width; x++, source += 4, target += 3) {
      bytes[target] = data[source + 2];
      bytes[target + 1] = data[source + 1];
      bytes[target + 2] = data[source];
    }
  }
  return new Blob([bytes], { type: 'image/bmp' });
}

function encodeIcon(png: Blob, width: number, height: number) {
  const header = new DataView(new ArrayBuffer(22));
  header.setUint16(2, 1, true);
  header.setUint16(4, 1, true);
  header.setUint8(6, width % 256);
  header.setUint8(7, height % 256);
  header.setUint16(10, 1, true);
  header.setUint16(12, 32, true);
  header.setUint32(14, png.size, true);
  header.setUint32(18, header.byteLength, true);
  return new Blob([header.buffer, png], { type: 'image/x-icon' });
}

export async function preparePicture(file: File) {
  const mime = pictureType(file);
  if (!mime) throw new Error('Choose an image file.');
  const original = new Blob([file], { type: mime });
  return withPicture(original, async (image, width, height) => {
    const compatible = nativeTypes.has(mime)
      ? original
      : await encodePicture(image, width, height, 'image/png');
    return { width, height, original, compatible };
  }).catch(() => {
    throw new Error(`This browser could not open “${file.name}” as a picture.`);
  });
}

export async function downloadPicture(asset: Asset, name: string, format?: PictureDownload) {
  const original = new Blob([asset.bytes as BlobPart], { type: asset.mime });
  const blob =
    format && format !== original.type
      ? await withPicture(original, (image, w, h) => encodePicture(image, w, h, format))
      : original;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const suffix = pictureExtension(blob.type);
  const extension = name.split('.').at(-1)?.toLowerCase();
  const matching = extension && contentTypes[extension] === blob.type;
  link.download = !format && matching ? name : `${name.replace(/\.[^.]+$/, '') || 'Picture'}.${suffix}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pictureCropShapes = [
  ['rect', 'Rectangle'],
  ['roundRect', 'Rounded Rectangle'],
  ['ellipse', 'Oval'],
  ['triangle', 'Triangle'],
] as const;

export async function removeEdgeBackground(asset: Asset, tolerance = 40): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([asset.bytes as BlobPart], { type: asset.mime }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || canvas.width * canvas.height > 20000000) {
    bitmap.close();
    throw new Error('Background removal supports pictures up to 20 megapixels.');
  }
  const w = canvas.width,
    h = canvas.height;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = context.getImageData(0, 0, w, h);
  const colors = [0, w - 1, w * (h - 1), w * h - 1].map((index) =>
    pixels.data.slice(index * 4, index * 4 + 3),
  );
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let end = 0;
  const limit = tolerance ** 2;
  function visit(index: number) {
    if (visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    if (
      pixels.data[offset + 3] &&
      !colors.some(
        ([r, g, b]) =>
          (pixels.data[offset] - r) ** 2 +
            (pixels.data[offset + 1] - g) ** 2 +
            (pixels.data[offset + 2] - b) ** 2 <=
          limit,
      )
    )
      return;
    pixels.data[offset + 3] = 0;
    queue[end++] = index;
  }
  for (let x = 0; x < w; x++) {
    visit(x);
    visit(w * (h - 1) + x);
  }
  for (let y = 1; y < h - 1; y++) {
    visit(y * w);
    visit(y * w + w - 1);
  }
  if (!end || end === w * h)
    throw new Error('No separate edge background was found. Try a different tolerance.');
  for (let i = 0; i < end; i++) {
    const pixel = queue[i];
    if (pixel % w > 0) visit(pixel - 1);
    if (pixel % w < w - 1) visit(pixel + 1);
    if (pixel >= w) visit(pixel - w);
    if (pixel < w * (h - 1)) visit(pixel + w);
  }
  if (end === w * h) throw new Error('This tolerance removes the whole picture. Try a lower value.');
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The transparent picture could not be created.');
  return new Uint8Array(await blob.arrayBuffer());
}
