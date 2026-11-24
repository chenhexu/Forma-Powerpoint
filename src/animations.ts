import type { Point } from './types';

export type AnimationClass = 'entr' | 'emph' | 'exit' | 'path';
export type AnimationStart = 'click' | 'with' | 'after';
export type AnimationDirection = 'bottom' | 'top' | 'left' | 'right';
export type SlideAnimation = {
  id: string;
  target: string;
  effect: string;
  start: AnimationStart;
  duration: number;
  delay: number;
  trigger?: string;
  repeat?: number;
  rewind?: boolean;
  smoothStart?: number;
  smoothEnd?: number;
  after?: 'hide' | 'dim';
  direction?: AnimationDirection;
  path?: Point[];
  nativePath?: string;
  paragraphs?: [number, number];
  imported?: boolean;
};

export const animationLength = (animation: SlideAnimation) => animation.duration * (animation.repeat ?? 1);

export function animationSchedule(animations: SlideAnimation[], clicks = true) {
  let group = 0;
  let previousStart = 0;
  let previousEnd = 0;
  const lengths = [0];
  const entries = animations
    .filter((animation) => !animation.trigger)
    .map((animation) => {
      if (clicks && animation.start === 'click') {
        group++;
        previousStart = previousEnd = 0;
      }
      const base =
        animation.start === 'after' || (!clicks && animation.start === 'click') ? previousEnd : previousStart;
      const start = base + animation.delay;
      const end = start + animationLength(animation);
      lengths[group] = Math.max(lengths[group] ?? 0, end);
      previousStart = start;
      previousEnd = end;
      return { animation, group, start, end };
    });
  return { entries, lengths };
}

export function timedAnimationProgress(animation: SlideAnimation, elapsed: number) {
  if (elapsed < 0) return -1;
  if (elapsed >= animationLength(animation)) return 1;
  const t = (elapsed % animation.duration) / animation.duration;
  const start = Math.min(1, (animation.smoothStart ?? 0) / animation.duration);
  const end = Math.min(1 - start, (animation.smoothEnd ?? 0) / animation.duration);
  const speed = 1 / (1 - (start + end) / 2);
  if (t < start) return (speed * t * t) / (2 * start);
  if (t > 1 - end) return 1 - (speed * (1 - t) ** 2) / (2 * end);
  return speed * (t - start / 2);
}
export type AnimationEffect = {
  id: string;
  preset: number;
  group: AnimationClass;
  label: string;
  style: string;
  directional?: boolean;
  path?: string;
};

export const animationGroups: Record<AnimationClass, string> = {
  entr: 'Entrance',
  emph: 'Emphasis',
  exit: 'Exit',
  path: 'Motion Paths',
};
export const animationStarts = [
  ['click', 'On Click'],
  ['with', 'With Previous'],
  ['after', 'After Previous'],
] as const;
export const directions = [
  ['bottom', 'Bottom'],
  ['top', 'Top'],
  ['left', 'Left'],
  ['right', 'Right'],
] as const;
export const directionCodes = { top: 1, right: 2, bottom: 4, left: 8 } as const;

const entrances = [
  [1, 'Appear', 'instant', 'Disappear'],
  [10, 'Fade', 'fade'],
  [2, 'Fly In', 'fly', 'Fly Out', true],
  [30, 'Float In', 'float', 'Float Out', true],
  [16, 'Split', 'split'],
  [22, 'Wipe', 'wipe', 'Wipe', true],
  [6, 'Shape', 'circle'],
  [21, 'Wheel', 'wheel'],
  [14, 'Random Bars', 'bars'],
  [31, 'Grow & Turn', 'growTurn', 'Shrink & Turn'],
  [23, 'Zoom', 'zoom'],
  [19, 'Swivel', 'swivel'],
  [26, 'Bounce', 'bounce'],
  [3, 'Blinds', 'blinds'],
  [4, 'Box', 'box'],
  [5, 'Checkerboard', 'checker'],
  [7, 'Crawl In', 'crawl', 'Crawl Out', true],
  [8, 'Diamond', 'diamond'],
  [9, 'Dissolve In', 'dissolve', 'Dissolve Out'],
  [11, 'Flash Once', 'flash'],
  [12, 'Peek In', 'peek', 'Peek Out', true],
  [13, 'Plus', 'plus'],
  [15, 'Spiral In', 'spiral', 'Spiral Out'],
  [17, 'Stretch', 'stretch', 'Collapse'],
  [18, 'Diagonal Squares', 'strips'],
  [20, 'Wedge', 'wedge'],
  [24, 'Random Effects', 'random'],
  [25, 'Boomerang', 'boomerang'],
  [27, 'Color Typewriter', 'typewriter'],
  [28, 'Credits', 'credits'],
  [29, 'Ease In', 'ease', 'Ease Out', true],
  [34, 'Breaks', 'breaks'],
  [35, 'Pinwheel', 'pinwheel'],
  [37, 'Rise Up', 'rise', 'Sink Down'],
  [38, 'Falling In', 'fall', 'Swish'],
  [39, 'Thread', 'thread'],
  [40, 'Unfold', 'unfold'],
  [41, 'Whip', 'whip'],
  [42, 'Ascend', 'ascend', 'Descend'],
  [43, 'Center Revolve', 'revolve'],
  [45, 'Faded Swivel', 'fadedSwivel'],
  [47, 'Descend', 'descend', 'Ascend'],
  [48, 'Sling', 'sling'],
  [49, 'Spinner', 'spinner'],
  [50, 'Compress', 'compress', 'Stretchy'],
  [51, 'Magnify', 'magnify'],
  [52, 'Curve Up', 'curve', 'Curve Down'],
  [53, 'Faded Zoom', 'fadedZoom'],
  [54, 'Glide', 'glide'],
  [55, 'Expand', 'expand', 'Contract'],
  [56, 'Flip', 'flip'],
  [58, 'Fold', 'fold'],
] as const satisfies ReadonlyArray<readonly [number, string, string, string?, boolean?]>;

const emphasis = [
  [37, 'Pulse', 'pulse'],
  [38, 'Color Pulse', 'colorPulse'],
  [32, 'Teeter', 'teeter'],
  [8, 'Spin', 'spin'],
  [6, 'Grow/Shrink', 'grow'],
  [25, 'Desaturate', 'desaturate'],
  [24, 'Darken', 'darken'],
  [30, 'Lighten', 'lighten'],
  [9, 'Transparency', 'transparency'],
  [23, 'Object Color', 'objectColor'],
  [21, 'Complementary Color', 'complement'],
  [7, 'Line Color', 'lineColor'],
  [1, 'Fill Color', 'fillColor'],
  [16, 'Brush Color', 'brushColor'],
  [3, 'Font Color', 'fontColor'],
  [18, 'Underline', 'underline'],
  [10, 'Bold Flash', 'boldFlash'],
  [15, 'Bold Reveal', 'boldReveal'],
  [34, 'Wave', 'wave'],
  [2, 'Change Font', 'font'],
  [4, 'Change Font Size', 'fontSize'],
  [5, 'Change Font Style', 'fontStyle'],
  [14, 'Blast', 'blast'],
  [19, 'Color Blend', 'colorBlend'],
  [20, 'Color Wave', 'colorWave'],
  [22, 'Complementary Color 2', 'complement2'],
  [26, 'Flash Bulb', 'flash'],
  [27, 'Flicker', 'flicker'],
  [28, 'Grow with Color', 'growColor'],
  [31, 'Style Emphasis', 'fontStyle'],
  [33, 'Vertical Highlight', 'highlight'],
  [35, 'Blink', 'blink'],
  [36, 'Shimmer', 'shimmer'],
] as const;

const line = (x: number, y: number) => `M 0 0 L ${x} ${y}`;
const polygon = (count: number, inner = 1) => {
  const size = inner === 1 ? count : count * 2;
  return (
    'M 0 0 ' +
    Array.from({ length: size }, (_, i) => {
      const angle = (2 * Math.PI * (i + 1)) / size;
      const r = i % 2 === 0 ? inner : 1;
      return `L ${(0.17 * r * Math.sin(angle)).toFixed(4)} ${(0.2 * (1 - r * Math.cos(angle))).toFixed(4)}`;
    }).join(' ')
  );
};
const circle = 'M 0 0 C .25 0 .25 .36 0 .36 C -.25 .36 -.25 0 0 0';
const loop =
  'M 0 0 C .12 -.24 .3 -.24 .3 0 C .3 .24 .12 .24 0 0 C -.12 -.24 -.3 -.24 -.3 0 C -.3 .24 -.12 .24 0 0';
const paths = [
  [42, 'Lines', line(0, 0.24)],
  [44, 'Arcs', 'M 0 0 C .07 -.26 .24 -.26 .32 0'],
  [36, 'Turns', 'M 0 0 L .26 0 L .26 .22'],
  [1, 'Shapes', circle],
  [26, 'Loops', loop],
  [0, 'Custom Path', ''],
  [35, 'Left', line(-0.3, 0)],
  [63, 'Right', line(0.3, 0)],
  [64, 'Up', line(0, -0.24)],
  [49, 'Diagonal Down Right', line(0.26, 0.24)],
  [56, 'Diagonal Up Right', line(0.26, -0.24)],
  [37, 'Arc Down', 'M 0 0 C .07 .26 .24 .26 .32 0'],
  [51, 'Arc Left', 'M 0 0 C -.24 .04 -.24 .21 0 .28'],
  [58, 'Arc Right', 'M 0 0 C .24 .04 .24 .21 0 .28'],
  [43, 'Turn Up', 'M 0 0 L .26 0 L .26 -.22'],
  [50, 'Turn Down', 'M 0 0 L -.26 0 L -.26 .22'],
  [57, 'Turn Up Right', 'M 0 0 L 0 -.22 L .26 -.22'],
  [2, 'Right Triangle', 'M 0 0 L .27 0 L .27 .28 L 0 0'],
  [3, 'Diamond', polygon(4)],
  [4, 'Hexagon', polygon(6)],
  [5, '5-Point Star', polygon(5, 0.43)],
  [6, 'Crescent Moon', 'M 0 0 C -.34 .02 -.19 .42 .08 .32 C -.10 .33 -.14 .12 0 0'],
  [7, 'Square', 'M 0 0 L .2 0 L .2 .32 L 0 .32 L 0 0'],
  [8, 'Trapezoid', 'M 0 0 L .15 0 L .24 .28 L -.08 .28 L 0 0'],
  [9, 'Heart', 'M 0 0 C -.13 -.18 -.37 .05 0 .28 C .37 .05 .13 -.18 0 0'],
  [10, 'Octagon', polygon(8)],
  [11, '6-Point Star', polygon(6, 0.54)],
  [12, 'Oval', 'M 0 0 C .29 0 .29 .23 0 .23 C -.29 .23 -.29 0 0 0'],
  [13, 'Equilateral Triangle', polygon(3)],
  [14, 'Parallelogram', 'M 0 0 L .23 0 L .13 .27 L -.10 .27 L 0 0'],
  [15, 'Pentagon', polygon(5)],
  [16, '4-Point Star', polygon(4, 0.35)],
  [17, '8-Point Star', polygon(8, 0.52)],
  [18, 'Teardrop', 'M 0 0 C .11 .16 .23 .37 0 .37 C -.23 .37 -.11 .16 0 0'],
  [19, 'Pointy Star', polygon(5, 0.19)],
  [
    20,
    'Curved Square',
    'M 0 0 C .12 -.07 .23 -.06 .23 .05 C .29 .15 .27 .25 .18 .26 C .08 .32 -.02 .28 -.02 .2 C -.07 .12 -.04 .02 0 0',
  ],
  [21, 'Curved X', 'M 0 0 C .18 -.1 .12 .16 .28 .22 M .28 0 C .15 -.1 .13 .2 0 .22'],
  [
    22,
    'Vertical Figure 8',
    'M 0 0 C -.16 -.13 -.16 -.24 0 -.24 C .16 -.24 .16 -.13 0 0 C -.16 .13 -.16 .24 0 .24 C .16 .24 .16 .13 0 0',
  ],
  [23, 'Curvy Star', polygon(5, 0.7)],
  [
    24,
    'Loop de Loop',
    'M 0 0 C .08 -.19 .24 -.26 .24 -.04 C .24 .14 .05 .15 .09 -.04 C .13 -.22 .28 -.23 .36 -.05',
  ],
  [25, 'Buzz Saw', polygon(12, 0.76)],
  [27, 'Peanut', 'M 0 0 C .17 -.12 .3 .03 .17 .15 C .04 .27 -.09 .14 -.23 .15 C -.33 .06 -.26 -.11 0 0'],
  [28, 'Figure 8 Four', loop + ' C .16 .12 .16 .24 0 .24 C -.16 .24 -.16 .12 0 0'],
  [29, 'Neutron', circle + ' C .2 -.27 .32 .24 0 0 C -.3 -.2 -.26 .28 0 0'],
  [30, 'Swoosh', 'M 0 0 C .04 .25 .21 .19 .38 -.08'],
  [31, 'Bean', 'M 0 0 C .28 -.09 .33 .22 .13 .24 C .17 .08 -.22 .24 -.18 .1 C -.17 -.01 -.08 0 0 0'],
  [
    32,
    'Clover',
    'M 0 0 C -.22 -.04 -.09 -.24 0 -.08 C .11 -.24 .22 -.04 0 0 C .22 .04 .09 .24 0 .08 C -.11 .24 -.22 .04 0 0',
  ],
  [33, 'Inverted Triangle', 'M 0 0 L .32 0 L .16 .3 L 0 0'],
  [34, 'Inverted Square', 'M 0 0 L .22 0 L .22 -.32 L 0 -.32 L 0 0'],
  [38, 'Zigzag', 'M 0 0 L .09 -.14 L .18 .12 L .27 -.14 L .36 .12'],
  [39, 'S Curve 2', 'M 0 0 C -.23 0 -.18 .16 0 .16 C .18 .16 .23 .32 0 .32'],
  [40, 'Sine Wave', 'M 0 0 C .10 -.25 .17 -.25 .22 0 C .27 .25 .36 .25 .42 0'],
  [
    41,
    'Bounce Left',
    'M 0 0 C -.08 -.19 -.16 -.19 -.24 0 C -.27 -.09 -.31 -.09 -.34 0 C -.36 -.04 -.38 -.04 -.4 0',
  ],
  [45, 'Heartbeat', 'M 0 0 L .11 0 L .16 -.14 L .21 .19 L .25 -.045 L .32 0 L .4 0'],
  [
    46,
    'Spiral Right',
    'M 0 0 C .33 -.23 .43 .24 .17 .3 C -.06 .36 -.06 .01 .13 .03 C .32 .05 .26 .26 .14 .19',
  ],
  [47, 'Wave', 'M 0 0 C .05 -.18 .13 -.18 .19 0 C .25 .18 .33 .18 .39 0'],
  [48, 'Curvy Left', 'M 0 0 C -.21 -.19 -.22 .23 -.4 .07'],
  [52, 'Funnel', 'M 0 0 C .36 -.01 .36 .09 .09 .12 C -.19 .15 -.11 .23 .16 .2 C .25 .23 .15 .31 .05 .32'],
  [
    53,
    'Spring',
    'M 0 0 C .12 -.07 .15 .13 .06 .12 C -.04 .11 .06 -.03 .15 .02 C .24 .09 .23 .2 .15 .17 C .06 .13 .17 .05 .26 .11 C .35 .15 .35 .23 .27 .24',
  ],
  [54, 'Bounce Right', 'M 0 0 C .08 -.19 .16 -.19 .24 0 C .27 -.09 .31 -.09 .34 0 C .36 -.04 .38 -.04 .4 0'],
  [
    55,
    'Spiral Left',
    'M 0 0 C -.33 -.23 -.43 .24 -.17 .3 C .06 .36 .06 .01 -.13 .03 C -.32 .05 -.26 .26 -.14 .19',
  ],
  [59, 'S Curve 1', 'M 0 0 C .02 -.28 .19 -.24 .19 -.12 C .19 .07 .38 .04 .4 -.2'],
  [60, 'Decaying Wave', 'M 0 0 C .05 -.22 .12 -.22 .18 0 C .22 .13 .26 .13 .3 0 C .33 -.06 .36 -.06 .4 0'],
  [61, 'Curvy Right', 'M 0 0 C .21 -.19 .22 .23 .4 .07'],
  [62, 'Stairs Down', 'M 0 0 L .1 0 L .1 .08 L .2 .08 L .2 .16 L .3 .16 L .3 .24'],
] as const;

export const animationEffects: AnimationEffect[] = [
  ...(['entr', 'exit'] as const).flatMap((group) =>
    Array.from(entrances, ([preset, entry, style, exit, directional]) => ({
      id: group + ':' + preset,
      preset,
      group,
      label: group === 'exit' ? (exit ?? entry) : entry,
      style,
      directional,
    })),
  ),
  ...emphasis.map(([preset, label, style]): AnimationEffect => ({
    id: 'emph:' + preset,
    preset: preset === 37 ? 26 : preset === 38 ? 27 : preset,
    group: 'emph',
    label,
    style,
  })),
  ...paths.map(([preset, label, path]): AnimationEffect => ({
    id: 'path:' + preset,
    preset,
    group: 'path',
    label,
    path,
    style: 'path',
    directional: preset === 42,
  })),
];

export const animationEffect = (id: string) => effectById.get(id);
const effectById = new Map(animationEffects.map((effect) => [effect.id, effect]));
export const animationLabel = (id: string) => animationEffect(id)?.label ?? 'PowerPoint effect';
export const animationDirection = (animation: SlideAnimation) => animation.direction ?? 'bottom';

export function animationPath(animation: SlideAnimation) {
  if (animation.nativePath) return animation.nativePath;
  if (animation.path?.length)
    return animation.path.map(({ x, y }, i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
  if (animation.effect === 'path:42') {
    const dir = animationDirection(animation);
    return line(
      dir === 'left' ? -0.3 : dir === 'right' ? 0.3 : 0,
      dir === 'top' ? -0.24 : dir === 'bottom' ? 0.24 : 0,
    );
  }
  return animationEffect(animation.effect)?.path || '';
}
