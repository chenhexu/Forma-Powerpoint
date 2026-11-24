import type { CSSProperties } from 'react';
import type { Effect } from './transitions';

type Frame = {
  outgoing?: CSSProperties;
  incoming?: CSSProperties;
  overlay?: CSSProperties;
  contentOnly?: boolean;
};
const translate = (x: number, y: number) => `translate(${x}%, ${y}%)`;
const inset = (top: number, right: number, bottom: number, left: number) =>
  `inset(${top}% ${right}% ${bottom}% ${left}%)`;
const rectangle = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}Z`;
const path = (parts: string[]) => `path("${parts.join(' ')}")`;
const random = (n: number) =>
  ((Math.imul(n + 1, 2654435761) ^ Math.imul(n + 347, 2246822519)) >>> 0) / 4294967296;
const clamp = (number: number) => Math.min(1, Math.max(0, number));

function bars(
  t: number,
  w: number,
  h: number,
  vertical: boolean,
  pattern: 'blinds' | 'randomBars' | 'comb' | 'shred',
) {
  const count = pattern === 'randomBars' ? 38 : pattern === 'shred' ? 24 : 10;
  const span = (vertical ? w : h) / count;
  return path(
    Array.from({ length: count }, (_, i) => {
      const time = pattern === 'randomBars' || pattern === 'shred' ? clamp(t * 2 - random(i)) : t;
      const offset = i * span;
      if (pattern === 'comb') {
        const start = i % 2 ? 1 - time : 0;
        return vertical
          ? rectangle(offset, h * start, span + 0.25, h * time)
          : rectangle(w * start, offset, w * time, span + 0.25);
      }
      return vertical ? rectangle(offset, 0, span * time, h) : rectangle(0, offset, w, span * time);
    }),
  );
}

function tileReveal(effect: Effect, t: number, w: number, h: number, backwards: boolean) {
  const columns = effect === 'dissolve' ? 16 : effect === 'honeycomb' ? 9 : 10;
  const rows = effect === 'dissolve' ? 11 : 7;
  const dx = w / columns,
    dy = h / rows;
  const shape = effect === 'honeycomb' || effect === 'glitter';
  return path(
    Array.from({ length: columns * rows }, (_, index) => {
      const x = index % columns,
        y = Math.floor(index / columns);
      const wave = backwards ? 1 - x / columns : x / columns;
      const start =
        effect === 'checkerboard'
          ? ((x + y) % 2) * 0.62 + wave * 0.38
          : effect === 'glitter'
            ? 0.72 * wave + 0.28 * random(index)
            : random(index);
      const amount = effect === 'dissolve' ? Number(t > start) : clamp(t * 2.8 - start * 1.8);
      const left = x * dx,
        top = y * dy;
      const width = dx * amount + 0.2,
        height = dy * amount + 0.2;
      const cx = left + dx / 2,
        cy = top + dy / 2;
      if (!shape || amount === 1) return rectangle(cx - width / 2, cy - height / 2, width, height);
      const rx = width / 2,
        ry = height / 2;
      return `M${cx - rx} ${cy}l${rx / 2} ${-ry}h${rx}l${rx / 2} ${ry}l${-rx / 2} ${ry}h${-rx}Z`;
    }),
  );
}

function clock(t: number, w: number, h: number, reverse: boolean) {
  const cx = w / 2,
    cy = h / 2,
    r = Math.hypot(cx, cy) + 1;
  const points = Array.from({ length: Math.ceil(t * 32) + 1 }, (_, i) => {
    const angle = Math.min(i / 32, t) * Math.PI * 2 * (reverse ? -1 : 1) - Math.PI / 2;
    return `L${cx + Math.cos(angle) * r} ${cy + Math.sin(angle) * r}`;
  });
  return path([`M${cx} ${cy}${points.join('')}Z`]);
}

export function transitionFrame(
  effect: Effect,
  option: string | undefined,
  t: number,
  w: number,
  h: number,
  backwards: boolean,
): Frame {
  const left = option === 'r' ? -1 : 1;
  const reversed = backwards ? -1 : 1;
  const direction = left * reversed;
  const vertical = option === 'u' || option === 'd';
  const signed = (option === 'd' ? -1 : 1) * reversed;
  const travel = (p: number) => translate(vertical ? 0 : direction * p, vertical ? signed * p : 0);
  const p = t * 100,
    rest = 100 - p;
  const horizontal = option !== 'vert';
  const contentOnly = ['pan', 'ferris', 'conveyor', 'rotate', 'window', 'orbit', 'flyThrough'].includes(
    effect,
  );
  switch (effect) {
    case 'none':
      return {};
    case 'morph':
      return {};
    case 'cut':
      return option === 'black'
        ? {
            outgoing: { visibility: t < 0.35 ? 'visible' : 'hidden' },
            incoming: { visibility: t > 0.65 ? 'visible' : 'hidden' },
          }
        : {};
    case 'fade':
      return option === 'black'
        ? { outgoing: { opacity: clamp(1 - t * 2) }, incoming: { opacity: clamp(t * 2 - 1) } }
        : { incoming: { opacity: t } };
    case 'push':
    case 'pan':
      return { outgoing: { transform: travel(-p) }, incoming: { transform: travel(rest) }, contentOnly };
    case 'cover':
      return { incoming: { transform: travel(rest) } };
    case 'uncover':
      return { outgoing: { transform: travel(-p), zIndex: 1 } };
    case 'reveal':
      return {
        outgoing: { transform: travel(-p * 0.24), opacity: 1 - t },
        incoming: { transform: travel(rest * 0.16), opacity: t },
      };
    case 'wipe':
      return {
        incoming: {
          clipPath: vertical
            ? signed > 0
              ? inset(rest, 0, 0, 0)
              : inset(0, 0, rest, 0)
            : direction > 0
              ? inset(0, 0, 0, rest)
              : inset(0, rest, 0, 0),
        },
      };
    case 'split': {
      const vert = option?.startsWith('vert');
      const inside = option?.endsWith('-in');
      const half = (inside ? p : rest) / 2;
      const clipPath = vert ? inset(0, half, 0, half) : inset(half, 0, half, 0);
      return inside ? { outgoing: { clipPath, zIndex: 1 } } : { incoming: { clipPath } };
    }
    case 'shape':
      return {
        incoming: {
          clipPath:
            option === 'diamond'
              ? `polygon(50% ${50 - p}%, ${50 + p}% 50%, 50% ${50 + p}%, ${50 - p}% 50%)`
              : option === 'plus'
                ? path([rectangle((w * (1 - t)) / 2, 0, w * t, h), rectangle(0, (h * (1 - t)) / 2, w, h * t)])
                : `circle(${p * 0.74}% at 50% 50%)`,
        },
      };
    case 'flash':
      return {
        incoming: { opacity: t },
        overlay: { background: 'white', opacity: Math.sin(Math.PI * t) ** 5 * 0.92 },
      };
    case 'randomBars':
    case 'blinds':
    case 'comb':
      return { incoming: { clipPath: bars(t, w, h, !horizontal, effect) } };
    case 'shred':
      return option === 'out'
        ? {
            outgoing: {
              clipPath: bars(1 - t, w, h, true, 'shred'),
              transform: translate(0, p * 0.12),
              zIndex: 1,
            },
          }
        : { incoming: { clipPath: bars(t, w, h, true, 'shred'), transform: translate(0, -rest * 0.15) } };
    case 'dissolve':
    case 'checkerboard':
    case 'honeycomb':
    case 'glitter':
      return {
        incoming: { clipPath: tileReveal(effect, t, w, h, backwards) },
        overlay:
          effect === 'glitter'
            ? {
                opacity: 0.24 * Math.sin(Math.PI * t),
                background: 'linear-gradient(110deg, transparent 35%, white 52%, transparent 64%)',
              }
            : undefined,
      };
    case 'clock':
      return { incoming: { clipPath: clock(t, w, h, (option === 'counterclockwise') !== backwards) } };
    case 'ripple':
      return {
        incoming: {
          maskImage: `radial-gradient(circle, black ${Math.max(0, p - 10)}%, transparent ${p + 9}%)`,
          transform: `scale(${1 + Math.sin(p / 10) * t * (1 - t) * 0.16})`,
        },
      };
    case 'fallOver':
      return {
        outgoing: {
          zIndex: 1,
          transformOrigin: '50% 100%',
          transform: `perspective(1200px) rotateX(${p * 0.87}deg)`,
          opacity: 1 - t * t,
        },
      };
    case 'drape':
      return {
        outgoing: {
          zIndex: 1,
          clipPath: `polygon(0 0, 100% 0, 100% ${rest}%, 70% ${rest * 0.56}%, 32% ${rest * 0.8}%, 0 ${rest}%)`,
          filter: `brightness(${1 - t * 0.32})`,
        },
      };
    case 'wind':
      return {
        outgoing: {
          zIndex: 1,
          transform: `${translate(direction * -p * 0.9, -p * 0.12)} skewX(${-direction * p * 0.31}deg)`,
          opacity: 1 - t,
        },
      };
    case 'prestige':
      return {
        outgoing: {
          zIndex: 1,
          clipPath: `polygon(0 0,100% 0,100% ${rest}%, 76% ${rest * 0.56}%, 53% ${rest}%, 27% ${rest * 0.56}%, 0 ${rest}%)`,
          transform: `perspective(1100px) rotateX(${-p * 0.42}deg)`,
          transformOrigin: '50% 0%',
        },
      };
    case 'peelOff':
    case 'pageCurl': {
      const span = effect === 'peelOff' ? p * 1.6 : p;
      const double = option === 'double';
      return {
        outgoing: {
          zIndex: 1,
          clipPath: `polygon(0 0, ${100 - span * 0.55}% 0, ${100 - span}% ${double ? 48 : 78}%, ${Math.max(0, 100 - span * 1.24)}% 100%, 0 100%)`,
          transform: `perspective(1800px) rotateY(${-direction * p * (double ? 0.52 : 0.32)}deg)`,
          transformOrigin: '0 50%',
          opacity: 1 - t ** 4,
        },
      };
    }
    case 'fracture':
      return {
        incoming: {
          clipPath: tileReveal(effect, t, w, h, backwards),
          transform: `scale(${1.14 - t * 0.14})`,
        },
        outgoing: { filter: `contrast(${1 + t * 0.45})` },
      };
    case 'crush':
      return {
        outgoing: {
          zIndex: 1,
          opacity: 1 - t,
          transform: `rotate(${direction * p * 0.18}deg) scale(${1 - t * 0.94}, ${1 - t * 0.88})`,
        },
      };
    case 'vortex':
      return {
        incoming: {
          clipPath: tileReveal(effect, t, w, h, backwards),
          transform: `rotate(${direction * rest * 0.9}deg) scale(${0.5 + t * 0.5})`,
        },
      };
    case 'airplane':
      return {
        outgoing: {
          zIndex: 1,
          opacity: 1 - t,
          transform: `${translate(p * direction * 0.65, -p * 0.9)} rotate(${-p * 0.34}deg) scale(${1 - t * 0.76})`,
          clipPath: `polygon(${p * 0.12}% 0,100% ${p * 0.4}%,${100 - p * 0.52}% 100%,0 ${100 - p * 0.38}%)`,
        },
      };
    case 'origami':
      return {
        outgoing: {
          zIndex: 1,
          opacity: 1 - t,
          transform: `perspective(900px) rotateZ(${direction * p * 0.2}deg) rotateX(${p * 0.8}deg) scale(${1 - t * 0.7})`,
          clipPath: `polygon(0 ${p * 0.3}%, 100% 0, ${100 - p * 0.25}% 100%, ${p * 0.35}% ${100 - p * 0.21}%)`,
        },
      };
    case 'doors':
    case 'curtains':
    case 'window': {
      const side = effect === 'curtains' || option !== 'hor';
      const opening = (t * (side ? w : h)) / 2;
      const clipPath = side
        ? path([rectangle(0, 0, w / 2 - opening, h), rectangle(w / 2 + opening, 0, w / 2 - opening, h)])
        : path([rectangle(0, 0, w, h / 2 - opening), rectangle(0, h / 2 + opening, w, h / 2 - opening)]);
      return {
        outgoing: { zIndex: 1, clipPath, filter: `brightness(${1 - t * 0.28})` },
        incoming: {
          transform: `scale(${(effect === 'window' ? 0.82 : 0.96) + t * (effect === 'window' ? 0.18 : 0.04)})`,
        },
        contentOnly,
      };
    }
    case 'flip': {
      const rotate = (a: number) => `perspective(1250px) rotateY(${direction * a}deg)`;
      return {
        outgoing: { transform: rotate(-180 * t), backfaceVisibility: 'hidden' },
        incoming: { transform: rotate(180 * (1 - t)), backfaceVisibility: 'hidden' },
      };
    }
    case 'cube':
    case 'box':
    case 'rotate':
    case 'orbit': {
      const insetBox = effect === 'box' || effect === 'orbit';
      const axis = vertical ? 'X' : 'Y';
      const sign = vertical ? -signed : direction;
      const depth = insetBox ? 1 - Math.sin(t * Math.PI) * 0.26 : 1;
      const edge = (along: number) =>
        vertical ? (along > 0 ? '50% 0%' : '50% 100%') : along > 0 ? '0% 50%' : '100% 50%';
      return {
        outgoing: {
          transform: `${travel(-p * 0.68)} perspective(1450px) rotate${axis}(${-sign * p * 0.88}deg) scale(${depth})`,
          transformOrigin: edge(-sign),
        },
        incoming: {
          transform: `${travel(rest * 0.68)} perspective(1450px) rotate${axis}(${sign * rest * 0.88}deg) scale(${depth})`,
          transformOrigin: edge(sign),
        },
        contentOnly,
      };
    }
    case 'switch':
    case 'gallery':
    case 'conveyor':
    case 'ferris': {
      const angle = effect === 'ferris' ? 82 : effect === 'switch' ? 14 : 35;
      const turn = effect === 'ferris' ? 'Z' : 'Y';
      const distance = effect === 'switch' ? 57 : 104;
      const drift = effect === 'ferris' ? -24 * Math.sin(Math.PI * t) : 0;
      const depth = effect === 'gallery' ? 0.6 : 0.78;
      return {
        outgoing: {
          transform: `${translate(-direction * t * distance, drift)} perspective(1350px) rotate${turn}(${-direction * t * angle}deg) scale(${1 - (1 - depth) * t})`,
          opacity: 1 - t ** 2,
        },
        incoming: {
          transform: `${translate(direction * (1 - t) * distance, drift)} perspective(1350px) rotate${turn}(${direction * (1 - t) * angle}deg) scale(${depth + (1 - depth) * t})`,
          zIndex: effect === 'switch' && t >= 0.5 ? 1 : undefined,
        },
        contentOnly,
      };
    }
    case 'zoom':
    case 'flyThrough': {
      const out = option === 'out';
      const small = effect === 'flyThrough' ? 0.12 : 0.42;
      return {
        outgoing: { transform: `scale(${out ? 1 - t * (1 - small) : 1 + t * 1.3})`, opacity: 1 - t },
        incoming: { transform: `scale(${out ? 1 + (1 - t) * 1.3 : small + t * (1 - small)})`, opacity: t },
        contentOnly,
      };
    }
    case 'random':
      return { incoming: { opacity: t } };
  }
}
