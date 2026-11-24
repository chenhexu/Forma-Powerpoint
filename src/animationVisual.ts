import type { CSSProperties } from 'react';
import { animationDirection, animationEffect, animationPath, type SlideAnimation } from './animations';
import { transitionFrame } from './transitionPreview';
import type { SlideObject } from './types';

export const animationColor = '#9864d3';
export const clampProgress = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (t: number) => t * t * (3 - 2 * t);

export function animationSample(animation: SlideAnimation, t: number, o: SlideObject, w: number, h: number) {
  const effect = animationEffect(animation.effect);
  let x = 0,
    y = 0,
    sx = 1,
    sy = 1,
    rotate = 0,
    opacity = 1;
  const t1 = effect?.group === 'exit' ? 1 - t : t;
  const p = animation.smoothStart || animation.smoothEnd ? t1 : smooth(t1);
  const rest = 1 - p;
  const pulse = Math.sin(Math.PI * t);
  const direction = animationDirection(animation);
  const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const dy = direction === 'top' ? -1 : direction === 'bottom' ? 1 : 0;
  switch (effect?.style) {
    case 'fly':
    case 'crawl':
      x = (dx < 0 ? -o.x - o.w : dx > 0 ? w - o.x : 0) * rest;
      y = (dy < 0 ? -o.y - o.h : dy > 0 ? h - o.y : 0) * rest;
      break;
    case 'float':
    case 'peek':
    case 'ease':
      x = dx * Math.min(w * 0.4, o.w) * rest;
      y = dy * Math.min(h * 0.4, o.h) * rest;
      opacity = effect.style === 'peek' ? 1 : p;
      break;
    case 'glide':
      x = -w * 0.32 * rest;
      y = h * 0.09 * rest;
      opacity = p;
      break;
    case 'boomerang':
      x = -w * 0.28 * Math.cos(p * 5.4) * rest;
      y = h * 0.34 * rest;
      rotate = -190 * rest;
      break;
    case 'bounce':
      y = -h * 0.5 * Math.abs(Math.cos(t1 * 9)) * rest;
      sx = 1 + 0.14 * rest * Math.sin(t1 * 17);
      break;
    case 'rise':
      y = h * 0.35 * rest;
      x = -w * 0.05 * pulse;
      opacity = p;
      break;
    case 'descend':
    case 'fall':
      y = -h * 0.38 * rest;
      rotate = effect.style === 'fall' ? -25 * rest : 0;
      opacity = p;
      break;
    case 'ascend':
    case 'credits':
      y = h * (effect.style === 'credits' ? 0.85 : 0.35) * rest;
      opacity = p;
      break;
    case 'curve':
    case 'sling':
      x = -w * 0.37 * rest;
      y = h * (effect.style === 'sling' ? -0.32 : 0.32) * rest * rest;
      rotate = 40 * rest;
      break;
    case 'whip':
      x = w * 0.3 * rest;
      sx = 1 + 0.58 * pulse;
      opacity = p;
      break;
    case 'thread':
      x = -w * 0.34 * rest;
      sy = 0.15 + p * 0.85;
      opacity = p;
      break;
    case 'spiral':
      x = w * 0.24 * rest * Math.cos(t1 * 9);
      y = h * 0.38 * rest * Math.sin(t1 * 9);
      sx = sy = 0.05 + p * 0.95;
      rotate = -270 * rest;
      break;
    case 'pinwheel':
    case 'growTurn':
    case 'spinner':
      sx = sy = 0.03 + p * 0.97;
      rotate = (effect.style === 'growTurn' ? -90 : -360) * rest;
      break;
    case 'swivel':
    case 'fadedSwivel':
    case 'revolve':
    case 'flip':
      sx = Math.max(0.01, Math.abs(Math.cos((effect.style === 'revolve' ? 4.5 : 2.5) * Math.PI * rest)));
      opacity = effect.style === 'fadedSwivel' ? p : 1;
      break;
    case 'fold':
    case 'unfold':
      sy = Math.max(0.02, p);
      sx = 0.45 + 0.55 * p;
      opacity = p;
      break;
    case 'compress':
      sx = 1 + rest * 0.9;
      sy = Math.max(0.04, p);
      opacity = p;
      break;
    case 'stretch':
      sx = Math.max(0.02, p);
      opacity = p;
      break;
    case 'expand':
      sx = sy = 0.65 + 0.35 * p;
      opacity = p;
      break;
    case 'zoom':
      sx = sy = 0.02 + 0.98 * p;
      break;
    case 'fadedZoom':
      sx = sy = 0.05 + 0.95 * p;
      opacity = p;
      break;
    case 'magnify':
      sx = sy = 0.15 + 0.85 * p + 0.32 * pulse;
      opacity = p;
      break;
    case 'fade':
    case 'random':
      opacity = p;
      break;
    case 'flash':
      opacity = effect.group === 'emph' ? 1 - pulse * 0.7 : Math.floor(t1 * 8) % 2 ? p : 1;
      break;
    case 'teeter':
      rotate = 10 * pulse * Math.sin(t * Math.PI * 6);
      break;
    case 'spin':
      rotate = 360 * p;
      break;
    case 'grow':
      sx = sy = 1 + 0.5 * p;
      break;
    case 'pulse':
      sx = sy = 1 + 0.16 * pulse;
      break;
    case 'growColor':
    case 'blast':
      sx = sy = 1 + 0.22 * pulse;
      break;
    case 'fontSize':
      sx = sy = 1 + 0.18 * p;
      break;
    case 'wave':
      y = -o.h * 0.1 * pulse;
      rotate = 7 * pulse * Math.sin(t * 10);
      break;
    case 'transparency':
      opacity = 1 - p * 0.55;
      break;
    case 'blink':
    case 'flicker':
      opacity = 1 - 0.86 * pulse * Math.abs(Math.sin(t * (effect.style === 'blink' ? 8 : 18)));
      break;
  }
  return { x, y, sx, sy, rotate, opacity };
}

const wipeDirections = { bottom: 'u', top: 'd', left: 'r', right: 'l' };
const clips = {
  split: ['split', 'vert-out'],
  circle: ['shape', 'circle'],
  wheel: ['clock', 'clockwise'],
  wedge: ['clock', 'counterclockwise'],
  bars: ['randomBars', 'vert'],
  blinds: ['blinds', 'hor'],
  checker: ['checkerboard', 'hor'],
  diamond: ['shape', 'diamond'],
  dissolve: ['dissolve', undefined],
  plus: ['shape', 'plus'],
  strips: ['checkerboard', 'vert'],
  breaks: ['dissolve', undefined],
} as const;

const pathCache = new Map<string, { path: SVGPathElement; length: number }>();
function pathPosition(path: string, t: number, w: number, h: number) {
  if (!path) return [0, 0];
  const svgPath = path.replace(/\bE\s*$/i, '').trim();
  if (!/^[MmLlCcZzQqTt\d,.+\-\sEe]+$/.test(svgPath)) return [0, 0];
  const scaled = svgPath.replace(
    /([MLCQT])\s*((?:[+\-]?(?:\d*\.)?\d+(?:e[+\-]?\d+)?[\s,]*)+)/gi,
    (_, command: string, points: string) =>
      command +
      ' ' +
      points
        .trim()
        .split(/[\s,]+/)
        .map((n, i) => Number(n) * (i % 2 === 0 ? w : h))
        .join(' '),
  );
  try {
    let cached = pathCache.get(scaled);
    if (!cached) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      node.setAttribute('d', scaled);
      cached = { path: node, length: node.getTotalLength() };
      if (pathCache.size >= 128) pathCache.clear();
      pathCache.set(scaled, cached);
    }
    const point = cached.path.getPointAtLength(cached.length * t);
    return [point.x, point.y];
  } catch {
    return [0, 0];
  }
}

export type AnimatedStyle = { frame: CSSProperties; object?: Partial<SlideObject>; text?: CSSProperties };

export function animatedStyle(
  animation: SlideAnimation,
  t: number,
  o: SlideObject,
  w: number,
  h: number,
): AnimatedStyle {
  const effect = animationEffect(animation.effect);
  const group = effect?.group;
  if (!effect) return { frame: {} };
  if (t < 0) return { frame: { visibility: group === 'entr' ? 'hidden' : undefined } };
  if (group === 'exit' && t >= 1) return { frame: { visibility: 'hidden' } };
  if (group === 'entr' && t >= 1) return { frame: {} };
  if (group === 'path') {
    const [x, y] = pathPosition(animationPath(animation), t, w, h);
    return { frame: { transform: `translate(${x}px, ${y}px)` } };
  }
  const { x, y, sx, sy, rotate, opacity } = animationSample(animation, t, o, w, h);
  const frame: CSSProperties = {
    transform:
      x || y || sx !== 1 || sy !== 1 || rotate
        ? `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${sx}, ${sy})`
        : undefined,
    opacity: opacity === 1 ? undefined : opacity,
  };
  const amount = group === 'exit' ? 1 - t : t;
  const effectStyle = effect.style;
  const mask = clips[effectStyle as keyof typeof clips];
  if (mask) frame.clipPath = transitionFrame(mask[0], mask[1], amount, o.w, o.h, false).incoming?.clipPath;
  if (['wipe', 'peek', 'typewriter'].includes(effectStyle))
    frame.clipPath = transitionFrame(
      'wipe',
      effectStyle === 'typewriter' ? 'r' : wipeDirections[animationDirection(animation)],
      amount,
      o.w,
      o.h,
      false,
    ).incoming?.clipPath;
  if (effectStyle === 'box') frame.clipPath = `inset(${50 * (1 - amount)}%)`;
  if (t === 0) return { frame };
  const pulse = Math.sin(Math.PI * t);
  switch (effectStyle) {
    case 'darken':
      frame.filter = `brightness(${1 - 0.48 * t})`;
      break;
    case 'lighten':
      frame.filter = `brightness(${1 + 0.68 * t})`;
      break;
    case 'desaturate':
      frame.filter = `grayscale(${t})`;
      break;
    case 'complement':
    case 'complement2':
      frame.filter = `hue-rotate(${(effectStyle === 'complement' ? 180 : -100) * t}deg)`;
      break;
    case 'objectColor':
    case 'colorBlend':
    case 'colorWave':
      frame.filter = `sepia(${0.65 * t}) saturate(${1 + 2 * t}) hue-rotate(${235 * t}deg)`;
      break;
    case 'shimmer':
      frame.filter = `brightness(${1 + 1.1 * pulse})`;
      break;
    case 'colorPulse':
      frame.filter = `hue-rotate(${135 * pulse}deg) saturate(${1 + 2 * pulse})`;
      break;
    case 'fillColor':
      return { frame, object: { fill: animationColor } };
    case 'lineColor':
      return {
        frame,
        object: {
          outline: {
            ...o.outline,
            color: animationColor,
            width: o.outline?.width ?? 2,
            dash: o.outline?.dash ?? 'solid',
          },
        },
      };
    case 'brushColor':
    case 'fontColor':
    case 'growColor':
      return { frame, text: { color: animationColor } };
    case 'font':
      return { frame, text: { fontFamily: 'Georgia, serif' } };
    case 'boldReveal':
    case 'fontStyle':
      return { frame, text: { fontWeight: 700 } };
    case 'boldFlash':
      return { frame, text: t < 1 ? { fontWeight: 700 } : undefined };
    case 'underline':
      return { frame, text: { textDecoration: 'underline' } };
    case 'highlight':
      return { frame, text: { backgroundColor: '#f1ddb4' } };
  }
  return { frame };
}
