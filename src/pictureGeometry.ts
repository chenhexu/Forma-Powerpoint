import type { Point, SlideObject } from './types';

type Crop = NonNullable<SlideObject['crop']>;
export type PictureRect = Pick<SlideObject, 'x' | 'y' | 'w' | 'h'>;
export type CropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export type PictureHandle = 'ne' | 'se' | 'sw' | 'nw';
export type CropDrag = CropHandle | 'move' | `picture-${PictureHandle}`;
export type CropDraft = { frame: PictureRect; source: PictureRect };

function pictureSides(o: SlideObject, crop: Crop): Crop {
  const [l, t, r, b] = crop;
  return [o.flipH ? r : l, o.flipV ? b : t, o.flipH ? l : r, o.flipV ? t : b];
}

export function pictureSourceRect(o: SlideObject): PictureRect {
  const [l, t, r, b] = pictureSides(o, o.crop ?? [0, 0, 0, 0]);
  const precision = 1 / 100000;
  const w = o.w / Math.max(precision, 1 - l - r);
  const h = o.h / Math.max(precision, 1 - t - b);
  return { x: -l * w, y: -t * h, w, h };
}

export function rotatePoint(point: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

export function adjustPictureCrop(before: CropDraft, handle: CropDrag, delta: Point): CropDraft {
  const { frame, source } = before;
  if (handle === 'move') {
    return {
      frame,
      source: { ...source, x: source.x + delta.x, y: source.y + delta.y },
    };
  }
  if (handle.startsWith('picture-')) {
    const corner = handle.slice('picture-'.length);
    const w = source.w * (corner.includes('w') ? -1 : 1);
    const h = source.h * (corner.includes('n') ? -1 : 1);
    const size = Math.max(
      Math.min(1, 8 / Math.min(source.w, source.h)),
      1 + (w * delta.x + h * delta.y) / (w * w + h * h),
    );
    return {
      frame,
      source: {
        x: source.x + (w < 0 ? source.w * (1 - size) : 0),
        y: source.y + (h < 0 ? source.h * (1 - size) : 0),
        w: source.w * size,
        h: source.h * size,
      },
    };
  }

  const minWidth = Math.min(8, frame.w);
  const minHeight = Math.min(8, frame.h);
  const originalRight = frame.x + frame.w;
  const originalBottom = frame.y + frame.h;
  const x = handle.includes('w') ? Math.min(frame.x + delta.x, originalRight - minWidth) : frame.x;
  const y = handle.includes('n') ? Math.min(frame.y + delta.y, originalBottom - minHeight) : frame.y;
  const right = handle.includes('e') ? Math.max(originalRight + delta.x, frame.x + minWidth) : originalRight;
  const bottom = handle.includes('s')
    ? Math.max(originalBottom + delta.y, frame.y + minHeight)
    : originalBottom;
  return { frame: { x, y, w: right - x, h: bottom - y }, source };
}

export function pictureCropPatch(o: SlideObject, { frame, source }: CropDraft) {
  const shift = rotatePoint(
    { x: frame.x + (frame.w - o.w) / 2, y: frame.y + (frame.h - o.h) / 2 },
    o.rotation,
  );
  const crop = pictureSides(o, [
    (frame.x - source.x) / source.w,
    (frame.y - source.y) / source.h,
    (source.x + source.w - frame.x - frame.w) / source.w,
    (source.y + source.h - frame.y - frame.h) / source.h,
  ]).map((side) => Math.round(side * 100000) / 100000) as Crop;
  return {
    x: o.x + shift.x + (o.w - frame.w) / 2,
    y: o.y + shift.y + (o.h - frame.h) / 2,
    w: frame.w,
    h: frame.h,
    crop,
  };
}
