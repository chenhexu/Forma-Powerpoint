import { lineFrame } from './shapeGeometry';
import type { Point, SlideObject } from './types';

export type DrawTool = 'select' | 'pen' | 'eraser' | 'lasso';
export type Ink = NonNullable<SlideObject['stroke']>;
export type InkStyle = Omit<Ink, 'points'>;
export type PenKind = 'pen' | 'pencil' | 'highlighter';
export type InkPen = InkStyle & { id: string; name: string; kind: PenKind };
export type EraserMode = 'stroke' | 'small' | 'large';
export const eraserRadius: Record<EraserMode, number> = { stroke: 5, small: 9, large: 21 };
export const penDefaults: Record<PenKind, InkStyle> = {
  pen: { color: '#222136', width: 4 },
  pencil: { color: '#495b6c', width: 2 },
  highlighter: { color: '#ffe159', width: 21, opacity: 0.38 },
};
export const initialPens: InkPen[] = [
  { id: 'pen', kind: 'pen', name: 'Pen', ...penDefaults.pen },
  { id: 'red', kind: 'pen', name: 'Red pen', ...penDefaults.pen, color: '#db3d58' },
  { id: 'pencil', kind: 'pencil', name: 'Pencil', ...penDefaults.pencil },
  { id: 'highlighter', kind: 'highlighter', name: 'Highlighter', ...penDefaults.highlighter },
];
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + t * (b.x - a.x),
  y: a.y + t * (b.y - a.y),
});

export function smoothInk(points: Point[]) {
  return points.map((point, i) =>
    i === 0 || i === points.length - 1 ? point : mix(point, mix(points[i - 1], points[i + 1], 0.5), 0.35),
  );
}

export function inkFrame(
  points: Point[],
  style: InkStyle,
): Pick<SlideObject, 'x' | 'y' | 'w' | 'h' | 'stroke'> {
  const left = Math.min(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  const width = Math.max(1, Math.max(...points.map((p) => p.x)) - left);
  const height = Math.max(1, Math.max(...points.map((p) => p.y)) - top);
  return {
    x: left,
    y: top,
    w: width,
    h: height,
    stroke: { ...style, points: points.map((p) => ({ x: (p.x - left) / width, y: (p.y - top) / height })) },
  };
}

export function localInkPoints(o: SlideObject & { stroke: Ink }) {
  return o.stroke.points.map(({ x, y }) => ({
    x: (o.flipH ? 1 - x : x) * o.w,
    y: (o.flipV ? 1 - y : y) * o.h,
  }));
}

export function slideInkPoints(o: SlideObject & { stroke: Ink }) {
  const angle = (o.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return localInkPoints(o).map(({ x, y }) => {
    x -= o.w / 2;
    y -= o.h / 2;
    return { x: o.x + o.w / 2 + x * cos - y * sin, y: o.y + o.h / 2 + x * sin + y * cos };
  });
}

export function lassoContains(points: Point[], lasso: Point[]) {
  return (
    lasso.length > 2 &&
    points.every((point) => {
      let inside = false;
      for (let i = 0, j = lasso.length - 1; i < lasso.length; j = i++) {
        const a = lasso[i],
          b = lasso[j];
        if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
      }
      return inside;
    })
  );
}

export function eraserSamples(points: Point[], radius: number) {
  const samples = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const steps = Math.ceil(distance(points[i - 1], points[i]) / (radius * 0.65));
    for (let j = 1; j <= steps; j++) samples.push(mix(points[i - 1], points[i], j / steps));
  }
  return samples;
}

// Clip the stroke centerline against the swept eraser. Include half the ink width so the cut has room for round ends.
export function eraseInk(points: Point[], centers: Point[], radius: number, whole: boolean) {
  const fragments: Point[][] = [];
  let fragment: Point[] = [];
  function finish() {
    if (fragment.length > 1) fragments.push(fragment);
    fragment = [];
  }
  let hit = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const squared = dx * dx + dy * dy;
    if (squared < 1e-10) continue;
    const cuts: [number, number][] = [];
    for (const c of centers) {
      if (
        c.x < Math.min(a.x, b.x) - radius ||
        c.x > Math.max(a.x, b.x) + radius ||
        c.y < Math.min(a.y, b.y) - radius ||
        c.y > Math.max(a.y, b.y) + radius
      )
        continue;
      const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / squared;
      const across = distance(mix(a, b, t), c);
      if (across >= radius) continue;
      const half = Math.sqrt((radius * radius - across * across) / squared);
      if (t + half <= 0 || t - half >= 1) continue;
      if (whole) return [];
      cuts.push([Math.max(0, t - half), Math.min(1, t + half)]);
      hit = true;
    }
    let keptFrom = 0;
    for (const [from, to] of cuts.sort(([a], [b]) => a - b)) {
      if (from > keptFrom) {
        if (!fragment.length) fragment.push(mix(a, b, keptFrom));
        fragment.push(mix(a, b, from));
      }
      finish();
      keptFrom = Math.max(keptFrom, to);
    }
    if (keptFrom < 1) {
      if (!fragment.length) fragment.push(mix(a, b, keptFrom));
      fragment.push(b);
    }
  }
  finish();
  return hit ? fragments : undefined;
}

function offsetFromLine(p: Point, a: Point, b: Point) {
  const size = distance(a, b);
  return size ? Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / size : distance(a, p);
}

function corners(points: Point[], threshold: number): Point[] {
  const first = points[0],
    last = points.at(-1)!;
  let split = 0,
    max = threshold;
  for (let i = 1; i < points.length - 1; i++) {
    const offset = offsetFromLine(points[i], first, last);
    if (offset > max) {
      max = offset;
      split = i;
    }
  }
  return split
    ? [
        ...corners(points.slice(0, split + 1), threshold).slice(0, -1),
        ...corners(points.slice(split), threshold),
      ]
    : [first, last];
}

export function inkToShape(object: SlideObject & { stroke: Ink }): Partial<SlideObject> | undefined {
  const points = slideInkPoints(object);
  const { x, y, w, h } = inkFrame(points, object.stroke);
  const first = points[0],
    last = points.at(-1)!;
  const size = Math.hypot(w, h);
  if (size < 12) return;
  const outline = { color: object.stroke.color, width: object.stroke.width, dash: 'solid' as const };
  const style = { stroke: undefined, fill: 'transparent', outline, rotation: 0, flipH: false, flipV: false };
  if (
    distance(first, last) > size * 0.7 &&
    points.every((p) => offsetFromLine(p, first, last) <= Math.max(3, size * 0.04))
  ) {
    return { ...style, ...lineFrame(first, last), name: 'Ink line', geometry: 'line' };
  }
  if (distance(first, last) > size * 0.2 || Math.min(w, h) < 10) return;
  const poly = corners(points, Math.max(3, size * 0.063));
  const vertices = poly.length - 1;
  const count = vertices > 3 && distance(poly[0], poly.at(-2)!) < size * 0.13 ? vertices - 1 : vertices;
  const radial = points.map(({ x: px, y: py }) => Math.hypot((2 * (px - x)) / w - 1, (2 * (py - y)) / h - 1));
  const looksRound = radial.filter((r) => Math.abs(r - 1) < 0.2).length / points.length > 0.88;
  const geometry = looksRound ? 'ellipse' : count === 4 ? 'rect' : count === 3 ? 'triangle' : undefined;
  if (geometry) return { ...style, x, y, w, h, name: 'Ink ' + geometry, geometry };
}
