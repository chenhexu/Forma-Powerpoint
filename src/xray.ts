import polygon, { type MultiPolygon, type Pair } from 'polygon-clipping';
import { combinedBounds, type Bounds } from './layout';
import { pictureSourceRect, rotatePoint } from './pictureGeometry';
import { isLine, lineEndpoints, shapeRings } from './shapeGeometry';
import { modelDisplayFrame, type SlideObject } from './types';

const boxRing = (x: number, y: number, w: number, h: number): Pair[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

function areaOf(parts: MultiPolygon) {
  const area = (ring: Pair[]) =>
    Math.abs(
      ring.reduce((sum, [x, y], i) => {
        const [nextX, nextY] = ring[(i + 1) % ring.length];
        return sum + x * nextY - nextX * y;
      }, 0),
    ) / 2;
  return parts.reduce(
    (sum, [outer, ...holes]) => sum + area(outer) - holes.reduce((a, ring) => a + area(ring), 0),
    0,
  );
}

function footprint(object: SlideObject) {
  const o = modelDisplayFrame(object);
  if (isLine(o)) {
    const [a, b] = lineEndpoints(o);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const radius = (o.outline?.width ?? 1) / 2;
    if (!length || !radius) return [];
    const x = ((a.y - b.y) / length) * radius;
    const y = ((b.x - a.x) / length) * radius;
    const stroke: Pair[] = [
      [a.x + x, a.y + y],
      [b.x + x, b.y + y],
      [b.x - x, b.y - y],
      [a.x - x, a.y - y],
    ];
    return [[stroke]];
  }
  if (!(o.w > 0 && o.h > 0)) return [];
  const geometry = o.kind === 'image' ? { ...o, geometry: o.pictureShape ?? 'rect' } : o;
  const rings = shapeRings(geometry)
    .map((ring) =>
      ring.map(({ x, y }): Pair => {
        const offset = rotatePoint(
          {
            x: ((o.flipH ? 1 - x : x) - 0.5) * o.w,
            y: ((o.flipV ? 1 - y : y) - 0.5) * o.h,
          },
          o.rotation,
        );
        return [o.x + o.w / 2 + offset.x, o.y + o.h / 2 + offset.y];
      }),
    )
    .filter((ring) => ring.length >= 3);
  const [outer, ...holes] = rings;
  if (!outer) return [];
  let region: MultiPolygon = holes.length ? polygon.xor([outer], ...holes.map((ring) => [ring])) : [[outer]];
  if (o.kind === 'image' && o.crop?.some((side) => side < 0)) {
    const { x, y, w, h } = pictureSourceRect(o);
    const image = boxRing(x, y, w, h).map(([x, y]): Pair => {
      const offset = rotatePoint({ x: x - o.w / 2, y: y - o.h / 2 }, o.rotation);
      return [o.x + o.w / 2 + offset.x, o.y + o.h / 2 + offset.y];
    });
    region = polygon.intersection(region, [image]);
  }
  return region;
}

function opacity(o: SlideObject) {
  if (o.kind === 'image') return o.pictureOpacity ?? 1;
  if (o.stroke) return 0;
  if (isLine(o)) return o.outline?.color === 'none' || o.outline?.color === 'transparent' ? 0 : 1;
  if ((o.kind === 'shape' || o.kind === 'text') && (!o.fill || o.fill === 'transparent' || o.fill === 'none'))
    return 0;
  return 1;
}

function boxOverlap(a: Bounds, b: Bounds) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}

export function xrayObjects(objects: SlideObject[], depth: number) {
  const visible = objects.flatMap((object) => {
    if (object.hidden) return [];
    try {
      const region = footprint(object);
      const area = areaOf(region);
      if (!(area > 0)) return [];
      const bounds = combinedBounds(region.flat(2).map(([x, y]) => ({ x, y, width: 0, height: 0 })));
      return [
        {
          id: object.id,
          region,
          area,
          bounds,
          opacity: opacity(object),
          covers: [] as number[],
          coveredBy: 0,
        },
      ];
    } catch {
      return [];
    }
  });
  for (const [i, front] of visible.entries()) {
    if (!front.opacity) continue;
    for (let j = 0; j < i; j++) {
      const back = visible[j];
      const threshold = back.area * 0.2;
      const bound = boxOverlap(front.bounds, back.bounds);
      if (bound * front.opacity + 1e-6 < threshold) continue;
      let overlap = bound;
      if (
        front.area !== front.bounds.width * front.bounds.height ||
        back.area !== back.bounds.width * back.bounds.height
      ) {
        try {
          overlap = areaOf(polygon.intersection(front.region, back.region));
        } catch {
          continue;
        }
      }
      if (overlap * front.opacity + 1e-6 < threshold) continue;
      front.covers.push(j);
      back.coveredBy++;
    }
  }
  const dimmed = new Set<string>();
  for (let layer = 0; layer < depth; layer++) {
    const exposed = visible.filter((item) => item.covers.length && !item.coveredBy && !dimmed.has(item.id));
    for (const item of exposed) {
      dimmed.add(item.id);
      for (const i of item.covers) visible[i].coveredBy--;
    }
  }
  return dimmed;
}
