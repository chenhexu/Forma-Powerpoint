import polygon from 'polygon-clipping';
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping';
import { rotatePoint } from './pictureGeometry';
import { shapeRings } from './shapeGeometry';
import { uid, type SlideObject } from './types';

export const mergeCommands = [
  ['union', 'Union'],
  ['xor', 'Combine'],
  ['fragment', 'Fragment'],
  ['intersection', 'Intersect'],
  ['difference', 'Subtract'],
] as const;
export type MergeCommand = (typeof mergeCommands)[number][0];

export function mergeShapes(objects: SlideObject[], command: MergeCommand): SlideObject[] {
  const rings = objects.map((object): Polygon =>
    shapeRings(object).map((ring) =>
      ring.map(({ x, y }): Pair => {
        const offset = rotatePoint(
          {
            x: ((object.flipH ? 1 - x : x) - 0.5) * object.w,
            y: ((object.flipV ? 1 - y : y) - 0.5) * object.h,
          },
          object.rotation,
        );
        return [object.x + object.w / 2 + offset.x, object.y + object.h / 2 + offset.y];
      }),
    ),
  );
  const inputs = rings.map(([outer, ...rest]) =>
    rest.length ? polygon.xor([outer], ...rest.map((ring) => [ring])) : [[outer]],
  );
  const [first, ...rest] = inputs;
  let result: MultiPolygon;
  if (command === 'fragment') {
    result = first;
    for (const input of rest) {
      const remainder = polygon.difference(input, polygon.union(result));
      result = [
        ...result.flatMap((part) => [
          ...polygon.difference(part, input),
          ...polygon.intersection(part, input),
        ]),
        ...remainder,
      ];
    }
  } else result = polygon[command](first, ...rest);
  const pieces = command === 'fragment' ? result.map((part) => [part]) : [result];
  return pieces
    .filter((piece) => piece.length)
    .map((piece): SlideObject => {
      const rings = piece.flat();
      const points = rings.flat();
      const x = Math.min(...points.map(([x]) => x)),
        y = Math.min(...points.map(([, y]) => y));
      const w = Math.max(0.01, ...points.map(([value]) => value - x));
      const h = Math.max(0.01, ...points.map(([, value]) => value - y));
      return {
        id: uid(),
        name: 'Freeform shape',
        kind: 'shape',
        x,
        y,
        w,
        h,
        rotation: 0,
        fill: objects[0].fill,
        outline: objects[0].outline,
        changed: [],
        customPaths: rings.map((ring) =>
          ring.slice(0, -1).map(([px, py]) => ({ x: (px - x) / w, y: (py - y) / h })),
        ),
      };
    });
}
