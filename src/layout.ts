import { modelDisplayFrame, type Point, type SlideObject } from './types';
import { isLine, lineEndpoints } from './shapeGeometry';

export type Arrange = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal' | 'vertical';
export const editable = (object: SlideObject) => !object.locked && object.kind !== 'unsupported';

export type Bounds = { x: number; y: number; width: number; height: number };

export function objectBounds(object: SlideObject): Bounds {
  if (isLine(object)) {
    const [a, b] = lineEndpoints(object);
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
  }
  const o = modelDisplayFrame(object);
  const angle = (o.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle)),
    sin = Math.abs(Math.sin(angle));
  const width = cos * o.w + sin * o.h,
    height = sin * o.w + cos * o.h;
  return { x: o.x + (o.w - width) / 2, y: o.y + (o.h - height) / 2, width, height };
}

export function combinedBounds(items: Bounds[]): Bounds {
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const item of items) {
    x = Math.min(x, item.x);
    y = Math.min(y, item.y);
    right = Math.max(right, item.x + item.width);
    bottom = Math.max(bottom, item.y + item.height);
  }
  return { x, y, width: right - x, height: bottom - y };
}

export type Axis = keyof Point;
export type SmartGuide = { axis: Axis; at: number; from: number; to: number; main: boolean };
export type SpacingGuide = { axis: Axis; at: number; from: number; to: number };
const axes = ['x', 'y'] as const;
const fractions = [0, 0.5, 1];

function measuredSpacings(moving: Bounds, targets: Bounds[], axis: Axis, tolerance: number) {
  const span = axis === 'x' ? 'width' : 'height';
  const across = axis === 'x' ? 'y' : 'x';
  const depth = axis === 'x' ? 'height' : 'width';
  const end = (item: Bounds) => item[axis] + item[span];
  const candidates = targets.filter(
    (item) => item[across] <= moving[across] + moving[depth] && item[across] + item[depth] >= moving[across],
  );
  const closestBefore = (item: Bounds) =>
    candidates.reduce<Bounds | undefined>(
      (best, other) =>
        other !== item && end(other) <= item[axis] + tolerance && (!best || end(other) > end(best))
          ? other
          : best,
      undefined,
    );
  const closestAfter = (item: Bounds) =>
    candidates.reduce<Bounds | undefined>(
      (best, other) =>
        other !== item && other[axis] >= end(item) - tolerance && (!best || other[axis] < best[axis])
          ? other
          : best,
      undefined,
    );
  const before = closestBefore(moving);
  const after = closestAfter(moving);
  const earlier = before && closestBefore(before);
  const later = after && closestAfter(after);
  const matches: { offset: number; group: [Bounds, Bounds, Bounds] }[] = [];
  if (before && after && after[axis] - end(before) >= moving[span]) {
    matches.push({
      offset: (after[axis] - end(moving) - (moving[axis] - end(before))) / 2,
      group: [before, moving, after],
    });
  }
  if (earlier && before && before[axis] >= end(earlier)) {
    matches.push({
      offset: before[axis] - end(earlier) - (moving[axis] - end(before)),
      group: [earlier, before, moving],
    });
  }
  if (after && later && later[axis] >= end(after)) {
    matches.push({
      offset: after[axis] - end(moving) - (later[axis] - end(after)),
      group: [moving, after, later],
    });
  }
  return matches;
}

export function dragAlignment(
  moving: Bounds,
  targets: Bounds[],
  tolerance: number,
  slide: Bounds,
  lock?: Axis,
) {
  const delta = { x: 0, y: 0 };
  const alignTargets = [...targets, slide];
  const guides = new Map<string, SmartGuide>();
  const spacing = new Map<string, SpacingGuide>();
  function matches(
    axis: Axis,
    bounds: Bounds,
    visit: (offset: number, target: Bounds, at: number, main: boolean) => void,
  ) {
    const span = axis === 'x' ? 'width' : 'height';
    for (const target of alignTargets) {
      for (const edge of fractions) {
        for (const reference of fractions) {
          const at = target[axis] + target[span] * reference;
          visit(
            at - bounds[axis] - bounds[span] * edge,
            target,
            at,
            target === slide || (edge === 0.5 && reference === 0.5),
          );
        }
      }
    }
  }
  for (const axis of axes) {
    if (lock && lock !== axis) continue;
    let best = tolerance;
    const consider = (offset: number) => {
      if (Math.abs(offset) >= best) return;
      best = Math.abs(offset);
      delta[axis] = offset;
    };
    matches(axis, moving, consider);
    for (const { offset } of measuredSpacings(moving, targets, axis, tolerance)) consider(offset);
  }
  const snapped = { ...moving, x: moving.x + delta.x, y: moving.y + delta.y };
  for (const axis of axes) {
    const across = axis === 'x' ? 'y' : 'x';
    const depth = axis === 'x' ? 'height' : 'width';
    const span = axis === 'x' ? 'width' : 'height';
    matches(axis, snapped, (offset, target, at, main) => {
      if (Math.abs(offset) > 0.025) return;
      const key = `${axis}:${Math.round(at * 100)}`;
      const existing = guides.get(key);
      guides.set(key, {
        axis,
        at,
        main: main || !!existing?.main,
        from: Math.min(snapped[across], target[across], existing?.from ?? Infinity),
        to: Math.max(
          snapped[across] + snapped[depth],
          target[across] + target[depth],
          existing?.to ?? -Infinity,
        ),
      });
    });
    for (const { offset, group } of measuredSpacings(snapped, targets, axis, 0.025)) {
      if (Math.abs(offset) > 0.025) continue;
      const at = Math.max(...group.map((item) => item[across] + item[depth])) + tolerance * 2;
      for (const [left, right] of [
        [group[0], group[1]],
        [group[1], group[2]],
      ]) {
        const from = left[axis] + left[span],
          to = right[axis];
        if (to - from > 0.025) spacing.set(`${axis}:${from}:${to}`, { axis, at, from, to });
      }
    }
  }
  return { delta, guides: [...guides.values()], spacing: [...spacing.values()] };
}

export function selectedGaps(objects: SlideObject[], axis: Axis) {
  const items = orderedBounds(objects, axis);
  const size = axis === 'x' ? 'width' : 'height';
  return items.slice(1).map(({ b }, i) => b[axis] - items[i].b[axis] - items[i].b[size]);
}

function orderedBounds(objects: SlideObject[], axis: Axis) {
  const span = axis === 'x' ? 'width' : 'height';
  return objects
    .filter(editable)
    .map((o) => ({ o, b: objectBounds(o) }))
    .sort((a, b) => a.b[axis] + a.b[span] / 2 - (b.b[axis] + b.b[span] / 2));
}

export function arrangeObjects(
  objects: SlideObject[],
  width: number,
  height: number,
  action: Arrange,
  alignToSlide = false,
  exactGap?: number,
) {
  const positions: Record<string, Point> = {};
  const items = objects.filter(editable).map((o) => ({ o, b: objectBounds(o) }));
  if (!items.length) return positions;
  const horizontal = ['left', 'center', 'right', 'horizontal'].includes(action);
  const pos = horizontal ? 'x' : 'y';
  const size = horizontal ? 'width' : 'height';
  if (action === 'horizontal' || action === 'vertical') {
    if (items.length < (exactGap === undefined ? 3 : 2)) return positions;
    const ordered = orderedBounds(objects, pos);
    const start = alignToSlide ? 0 : ordered[0].b[pos];
    const last = ordered[ordered.length - 1];
    const end = alignToSlide ? (horizontal ? width : height) : last.b[pos] + last.b[size];
    const gap =
      exactGap ?? (end - start - ordered.reduce((sum, item) => sum + item.b[size], 0)) / (ordered.length - 1);
    let cursor = start;
    for (const { o, b } of ordered) {
      positions[o.id] = { x: o.x, y: o.y, [pos]: o[pos] + cursor - b[pos] };
      cursor += b[size] + gap;
    }
    return positions;
  }
  const againstSlide = alignToSlide || items.length === 1;
  const low = againstSlide ? 0 : Math.min(...items.map(({ b }) => b[pos]));
  const high = againstSlide
    ? horizontal
      ? width
      : height
    : Math.max(...items.map(({ b }) => b[pos] + b[size]));
  const factor =
    action === 'right' || action === 'bottom' ? 1 : action === 'center' || action === 'middle' ? 0.5 : 0;
  for (const { o, b } of items) {
    positions[o.id] = { x: o.x, y: o.y, [pos]: o[pos] + low + factor * (high - low - b[size]) - b[pos] };
  }
  return positions;
}
