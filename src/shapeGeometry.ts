import { rotatePoint } from './pictureGeometry';
import type { Geometry, Point, SlideObject } from './types';

export const frameHandles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type FrameHandle = (typeof frameHandles)[number];

export function resizeFrame(
  o: SlideObject,
  handle: FrameHandle,
  delta: Point,
  centered: boolean,
  proportional: boolean,
) {
  const x = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0;
  const y = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0;
  const local = rotatePoint(delta, -o.rotation);
  const factor = centered ? 2 : 1;
  const minW = Math.min(o.w, 24);
  const minH = Math.min(o.h, 24);
  let w = Math.max(minW, o.w + x * local.x * factor);
  let h = Math.max(minH, o.h + y * local.y * factor);
  if (proportional && x && y && o.w && o.h) {
    const ratio = 1 + (factor * (x * local.x * o.w + y * local.y * o.h)) / (o.w ** 2 + o.h ** 2);
    const fit = Math.max(minW / o.w, minH / o.h, ratio);
    w = o.w * fit;
    h = o.h * fit;
  }
  const offset = centered
    ? { x: 0, y: 0 }
    : rotatePoint({ x: (x * (w - o.w)) / 2, y: (y * (h - o.h)) / 2 }, o.rotation);
  return { w, h, x: o.x + (o.w - w) / 2 + offset.x, y: o.y + (o.h - h) / 2 + offset.y };
}

export const isLine = (o: SlideObject) => o.kind === 'shape' && o.geometry === 'line' && !o.stroke;
export function linePoints(o: SlideObject): [Point, Point] {
  return [
    { x: o.flipH ? o.w : 0, y: o.flipV ? o.h : 0 },
    { x: o.flipH ? 0 : o.w, y: o.flipV ? 0 : o.h },
  ];
}

export function lineEndpoints(o: SlideObject) {
  return linePoints(o).map((point) => {
    const rotated = rotatePoint({ x: point.x - o.w / 2, y: point.y - o.h / 2 }, o.rotation);
    return { x: o.x + o.w / 2 + rotated.x, y: o.y + o.h / 2 + rotated.y };
  });
}

export function resizeLine(
  o: SlideObject,
  endpoint: number,
  delta: Point,
  centered: boolean,
  snapped: boolean,
) {
  const points = lineEndpoints(o);
  const from = points[endpoint];
  const other = points[1 - endpoint];
  const anchor = centered ? { x: (from.x + other.x) / 2, y: (from.y + other.y) / 2 } : other;
  const offset = { x: from.x + delta.x - anchor.x, y: from.y + delta.y - anchor.y };
  if (snapped) {
    const length = Math.hypot(offset.x, offset.y);
    const angle = (Math.round(Math.atan2(offset.y, offset.x) / (Math.PI / 4)) * Math.PI) / 4;
    offset.x = length * Math.cos(angle);
    offset.y = length * Math.sin(angle);
  }
  // Keep overlapping endpoints selectable even when the dragged endpoint meets the anchor.
  if (Math.hypot(offset.x, offset.y) < 1) {
    const angle = Math.atan2(from.y - anchor.y, from.x - anchor.x);
    offset.x = Math.cos(angle);
    offset.y = Math.sin(angle);
  }
  points[endpoint] = { x: anchor.x + offset.x, y: anchor.y + offset.y };
  if (centered) points[1 - endpoint] = { x: anchor.x - offset.x, y: anchor.y - offset.y };
  return lineFrame(points[0], points[1]);
}

export function lineFrame(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
    flipH: b.x < a.x,
    flipV: b.y < a.y,
    rotation: 0,
  };
}

export type ShapeAdjustment = {
  guide: string;
  label: string;
  point: Point;
  axis: keyof Point;
  rate: number;
  max: number;
  value: number;
};
const shortest = (o: SlideObject) => Math.max(1, Math.min(o.w, o.h));
const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

export function cornerRadius(o: SlideObject) {
  return (shortest(o) * clamp(o.adjustments?.adj ?? 16667, 50000)) / 100000;
}

export function adjustmentHandles(o: SlideObject): ShapeAdjustment[] {
  if (o.kind !== 'shape') return [];
  const size = shortest(o);
  const create = (
    guide: string,
    label: string,
    point: Point,
    axis: keyof Point,
    rate: number,
    max: number,
    fallback: number,
  ) => ({ guide, label, point, axis, rate, max, value: clamp(o.adjustments?.[guide] ?? fallback, max) });
  if (o.geometry === 'roundRect')
    return [create('adj', 'Corner radius', { x: cornerRadius(o), y: 0 }, 'x', 100000 / size, 50000, 16667)];
  if (o.geometry === 'chevron') {
    const depth = (clamp(o.adjustments?.adj ?? 50000, (o.w * 100000) / size) * size) / 100000;
    return [
      create(
        'adj',
        'Chevron depth',
        { x: o.w - depth, y: 0 },
        'x',
        -100000 / size,
        (o.w * 100000) / size,
        50000,
      ),
    ];
  }
  if (o.geometry !== 'rightArrow' && o.geometry !== 'downArrow') return [];
  const down = o.geometry === 'downArrow';
  const length = down ? o.h : o.w,
    breadth = down ? o.w : o.h;
  const head = length - (size * clamp(o.adjustments?.adj2 ?? 50000, (length * 100000) / size)) / 100000;
  const shaft = (breadth * (1 - clamp(o.adjustments?.adj1 ?? 50000, 100000) / 100000)) / 2;
  return [
    create(
      'adj1',
      'Arrow shaft width',
      down ? { x: shaft, y: 0 } : { x: 0, y: shaft },
      down ? 'x' : 'y',
      -200000 / Math.max(1, breadth),
      100000,
      50000,
    ),
    create(
      'adj2',
      'Arrowhead length',
      down ? { x: 0, y: head } : { x: head, y: 0 },
      down ? 'y' : 'x',
      -100000 / size,
      (length * 100000) / size,
      50000,
    ),
  ];
}

export function adjustShape(o: SlideObject, handle: ShapeAdjustment, delta: Point) {
  const local = rotatePoint(delta, -o.rotation);
  const flipped = handle.axis === 'x' ? o.flipH : o.flipV;
  const value = clamp(
    Math.round(handle.value + (flipped ? -1 : 1) * local[handle.axis] * handle.rate),
    handle.max,
  );
  return { ...o.adjustments, [handle.guide]: Math.round(value) };
}

const diamond = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
];
const polygons: Partial<Record<Geometry, number[][]>> = {
  triangle: [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
  diamond,
  flowChartDecision: diamond,
  hexagon: [
    [0.25, 0],
    [0.75, 0],
    [1, 0.5],
    [0.75, 1],
    [0.25, 1],
    [0, 0.5],
  ],
  parallelogram: [
    [0.25, 0],
    [1, 0],
    [0.75, 1],
    [0, 1],
  ],
  star5: [
    [0.5, 0],
    [0.625, 0.35],
    [1, 0.38],
    [0.7, 0.62],
    [0.81, 1],
    [0.5, 0.77],
    [0.19, 1],
    [0.3, 0.62],
    [0, 0.38],
    [0.375, 0.35],
  ],
};

export const isPolygon = (o: SlideObject) =>
  o.kind === 'shape' &&
  !!o.geometry &&
  (o.geometry in polygons || ['rightArrow', 'downArrow', 'chevron'].includes(o.geometry));

export function polygonPoints(o: SlideObject) {
  if (!isPolygon(o)) return;
  const handles = adjustmentHandles(o);
  if (o.geometry === 'chevron') {
    const x = handles[0].point.x;
    return [
      [0, 0],
      [x, 0],
      [o.w, o.h / 2],
      [x, o.h],
      [0, o.h],
      [o.w - x, o.h / 2],
    ];
  }
  if (handles.length === 2) {
    const down = o.geometry === 'downArrow';
    const length = down ? o.h : o.w,
      breadth = down ? o.w : o.h;
    const head = handles[1].point[down ? 'y' : 'x'],
      shaft = handles[0].point[down ? 'x' : 'y'];
    const points = [
      [0, shaft],
      [head, shaft],
      [head, 0],
      [length, breadth / 2],
      [head, breadth],
      [head, breadth - shaft],
      [0, breadth - shaft],
    ];
    return down ? points.map(([x, y]) => [y, x]) : points;
  }
  return polygons[o.geometry!]?.map(([x, y]) => [x * o.w, y * o.h]);
}

export function shapeRings(o: SlideObject): Point[][] {
  if (o.customPaths) return o.customPaths;
  const polygon = polygonPoints(o);
  if (polygon) return [polygon.map(([x, y]) => ({ x: x / o.w, y: y / o.h }))];
  if (o.geometry === 'ellipse')
    return [
      Array.from({ length: 48 }, (_, i) => {
        const t = (2 * Math.PI * i) / 48;
        return { x: (1 + Math.cos(t)) / 2, y: (1 + Math.sin(t)) / 2 };
      }),
    ];
  if (o.geometry === 'roundRect') {
    const r = cornerRadius(o),
      rx = r / o.w,
      ry = r / o.h;
    return [
      [
        { x: 1 - rx, y: ry },
        { x: 1 - rx, y: 1 - ry },
        { x: rx, y: 1 - ry },
        { x: rx, y: ry },
      ].flatMap((center, corner) =>
        Array.from({ length: 10 }, (_, point) => {
          const angle = ((corner - 1 + point / 9) * Math.PI) / 2;
          return { x: center.x + rx * Math.cos(angle), y: center.y + ry * Math.sin(angle) };
        }),
      ),
    ];
  }
  return [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  ];
}

export function connectorFrame(a: SlideObject, b: SlideObject) {
  const center = (o: SlideObject) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
  const site = (object: SlideObject, other: SlideObject) => {
    const c = center(object),
      t = center(other);
    const { x, y } = rotatePoint({ x: t.x - c.x, y: t.y - c.y }, -object.rotation);
    const vertical = Math.abs(x / object.w) < Math.abs(y / object.h);
    const offset = rotatePoint(
      vertical ? { x: 0, y: (Math.sign(y) * object.h) / 2 } : { x: ((x < 0 ? -1 : 1) * object.w) / 2, y: 0 },
      object.rotation,
    );
    return {
      point: { x: c.x + offset.x, y: c.y + offset.y },
      index: vertical ? (y < 0 ? 0 : 2) : x < 0 ? 1 : 3,
    };
  };
  const from = site(a, b),
    to = site(b, a);
  return { frame: lineFrame(from.point, to.point), from: from.index, to: to.index };
}

export function refreshConnectors(objects: SlideObject[], previous: SlideObject[] = []) {
  if (!objects.some((object) => object.connector)) return objects;
  const byId = new Map(objects.map((object) => [object.id, object]));
  const before = new Map(previous.map((object) => [object.id, object]));
  const frameChanged = (object: SlideObject) => {
    const old = before.get(object.id);
    return (
      !old ||
      (['x', 'y', 'w', 'h', 'rotation', 'flipH', 'flipV'] as const).some((key) => old[key] !== object[key])
    );
  };
  return objects.map((object) => {
    if (!object.connector) return object;
    const from = byId.get(object.connector.from),
      to = byId.get(object.connector.to);
    if (!from || !to)
      return { ...object, connector: undefined, changed: [...new Set([...object.changed, 'connector'])] };
    if (before.has(object.id) && !frameChanged(from) && !frameChanged(to)) return object;
    const frame = connectorFrame(from, to).frame;
    if (Object.entries(frame).every(([key, value]) => object[key as keyof SlideObject] === value))
      return object;
    return {
      ...object,
      ...frame,
      changed: [...new Set([...object.changed, ...Object.keys(frame), 'connector'])],
    };
  });
}
