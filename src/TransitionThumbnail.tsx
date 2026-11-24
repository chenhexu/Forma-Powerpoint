import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CircleHelp,
  Clock3,
  Maximize,
  MoveHorizontal,
  RotateCw,
  Sparkle,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Effect } from './transitions';

const light = '#e8def8';
const mid = '#b39adc';
const purple = '#7752b7';
const dark = '#493168';
const paper = '#faf6ff';

type Thumbnail = {
  background?: string;
  layers?: CSSProperties[];
  icon?: LucideIcon;
  ink?: string;
};

const shape = (background: string, points: string): CSSProperties => ({
  background,
  clipPath: `polygon(${points})`,
});
const panel = (background: string, inset: string, transform?: string): CSSProperties => ({
  background,
  inset,
  transform,
  borderRadius: '2px',
});
const hexagon = (background: string, inset: string): CSSProperties => ({
  ...panel(background, inset),
  clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
});

// These illustrations use the same proportions at ribbon and gallery sizes.
const thumbnails: Record<Effect, Thumbnail> = {
  none: { layers: [panel(mid, '18% 22%'), panel(paper, '33% 39% 58% 32%')] },
  morph: {
    layers: [
      panel(mid, '24% 46% 23% 14%', 'rotate(-10deg)'),
      panel(purple, '20% 16% 26% 43%', 'rotate(13deg)'),
    ],
  },
  fade: {
    layers: [
      panel(mid, '19% 35% 31% 12%'),
      panel('linear-gradient(100deg, #7752b770, #7752b7)', '32% 12% 18% 35%'),
    ],
  },
  push: {
    background: `linear-gradient(${mid} 47%, ${dark} 47% 51%, ${purple} 51%)`,
    icon: ArrowUp,
    ink: paper,
  },
  wipe: {
    background: `linear-gradient(90deg, ${light} 36%, ${mid} 45%, ${purple} 61%)`,
    icon: ArrowLeft,
  },
  split: {
    background: `linear-gradient(90deg, ${mid} 28%, ${light} 28% 72%, ${mid} 72%)`,
    icon: MoveHorizontal,
  },
  reveal: {
    layers: [panel(purple, '12% 12% 24% 42%'), panel('#b39adcac', '28% 38% 12% 12%')],
  },
  cut: {
    layers: [panel(mid, '33% 12% 13% 42%'), panel(purple, '13% 42% 33% 12%')],
  },
  randomBars: {
    background: `linear-gradient(90deg, ${purple} 7%, ${light} 7% 12%, ${mid} 12% 23%, ${light} 23% 30%, ${purple} 30% 45%, ${light} 45% 50%, ${purple} 50% 54%, ${light} 54% 63%, ${mid} 63% 76%, ${light} 76% 80%, ${purple} 80% 88%, ${light} 88% 93%, ${mid} 93%)`,
  },
  shape: { background: `radial-gradient(circle, ${purple} 38%, ${light} 40%)` },
  uncover: {
    background: purple,
    layers: [panel(mid, '10% 28% 4% -10%'), panel(light, '7% 31% 10% -10%')],
    icon: ArrowLeft,
  },
  cover: {
    layers: [panel(mid, '10% -10% 4% 24%'), panel(purple, '7% -10% 10% 27%')],
    icon: ArrowLeft,
    ink: paper,
  },
  flash: { background: `radial-gradient(circle, ${mid}, ${purple})`, icon: Sparkle, ink: paper },
  fallOver: {
    layers: [
      shape(mid, '15% 26%, 85% 26%, 95% 82%, 5% 82%'),
      shape(purple, '15% 26%, 85% 26%, 74% 66%, 26% 66%'),
    ],
    icon: ArrowDown,
    ink: paper,
  },
  drape: {
    background: `linear-gradient(105deg, ${mid}, ${light})`,
    layers: [shape(purple, '0 0, 100% 0, 100% 32%, 77% 52%, 43% 63%, 0 90%')],
  },
  curtains: {
    background: dark,
    layers: [
      shape(
        `linear-gradient(90deg, ${purple}, ${mid} 15%, ${purple} 33%, ${mid} 67%, ${purple} 85%, ${mid})`,
        '0 0, 36% 0, 31% 45%, 23% 100%, 0 100%',
      ),
      shape(
        `linear-gradient(90deg, ${purple}, ${mid} 65%, ${purple} 80%, ${mid})`,
        '64% 0, 100% 0, 100% 100%, 77% 100%, 69% 45%',
      ),
    ],
  },
  wind: {
    layers: [
      shape(purple, '0 24%, 76% 5%, 86% 20%, 11% 42%'),
      shape(mid, '13% 54%, 92% 27%, 100% 41%, 22% 70%'),
      shape(purple, '24% 83%, 88% 60%, 95% 73%, 36% 95%'),
    ],
  },
  prestige: {
    background: dark,
    layers: [
      shape(
        `linear-gradient(110deg, ${mid}, ${purple} 52%, ${mid})`,
        '0 0, 100% 0, 100% 44%, 83% 33%, 72% 59%, 52% 74%, 32% 54%, 20% 33%, 0 44%',
      ),
    ],
  },
  fracture: {
    background: purple,
    layers: [
      shape(
        light,
        '0 16%, 44% 42%, 31% 0, 56% 37%, 78% 0, 68% 45%, 100% 32%, 73% 58%, 97% 90%, 60% 70%, 49% 100%, 47% 68%, 9% 100%, 37% 57%',
      ),
    ],
  },
  crush: {
    layers: [
      shape(
        mid,
        '22% 31%, 45% 14%, 69% 24%, 65% 36%, 81% 53%, 69% 70%, 68% 82%, 47% 88%, 36% 73%, 22% 65%, 27% 54%',
      ),
      shape(
        purple,
        '22% 31%, 47% 46%, 69% 24%, 65% 36%, 58% 62%, 81% 53%, 68% 82%, 47% 88%, 48% 64%, 22% 65%, 27% 54%',
      ),
    ],
  },
  peelOff: {
    layers: [
      shape(purple, '0 0, 100% 0, 100% 46%, 64% 100%, 0 100%'),
      shape(mid, '64% 100%, 69% 53%, 100% 46%'),
    ],
  },
  pageCurl: {
    layers: [
      panel(purple, '0 39% 0 0'),
      panel(`linear-gradient(90deg, ${purple}, ${paper} 62%, ${mid})`, '0 31% 0 46%', 'skewX(-11deg)'),
    ],
  },
  airplane: {
    layers: [
      shape(purple, '14% 43%, 87% 14%, 69% 85%, 47% 63%, 34% 79%, 35% 57%'),
      shape(mid, '35% 57%, 87% 14%, 47% 63%, 34% 79%'),
    ],
  },
  origami: {
    layers: [
      shape(purple, '10% 45%, 37% 44%, 51% 12%, 78% 57%, 92% 47%, 81% 76%, 53% 87%, 30% 66%'),
      shape(mid, '37% 44%, 51% 12%, 58% 58%, 53% 87%, 30% 66%'),
      shape(light, '37% 44%, 51% 12%, 50% 46%'),
    ],
  },
  dissolve: {
    layers: [
      panel(purple, '0 65% 0 0'),
      ...[
        '9% 54% 73% 38%',
        '40% 44% 40% 45%',
        '73% 53% 9% 38%',
        '15% 29% 69% 62%',
        '56% 29% 29% 61%',
        '41% 13% 48% 78%',
        '77% 16% 11% 77%',
      ].map((inset, index) => panel(index < 3 ? purple : mid, inset)),
    ],
  },
  checkerboard: {
    layers: [
      {
        background: `conic-gradient(${purple} 25%, ${light} 0 50%, ${purple} 0 75%, ${light} 0) 0 0 / 25% 50%`,
      },
    ],
  },
  blinds: {
    background: `repeating-linear-gradient(90deg, ${purple} 0 8%, ${mid} 8% 10%, ${light} 10% 16.67%)`,
  },
  clock: {
    background: `conic-gradient(${mid} 31%, ${light} 31%)`,
    icon: Clock3,
  },
  ripple: {
    background: `repeating-radial-gradient(circle, ${purple} 0 11%, ${mid} 13% 19%, ${light} 22% 31%)`,
  },
  honeycomb: {
    layers: [
      hexagon(purple, '14% 72% 51% 0'),
      hexagon(mid, '49% 72% 16% 0'),
      hexagon(mid, '32% 50% 33% 22%'),
      hexagon(purple, '-3% 50% 68% 22%'),
      hexagon(purple, '14% 28% 51% 44%'),
      hexagon(purple, '49% 28% 16% 44%'),
      hexagon(mid, '32% 6% 33% 66%'),
      hexagon(mid, '14% -16% 51% 88%'),
    ],
  },
  glitter: {
    background: `linear-gradient(110deg, ${purple}, ${mid} 70%, ${light})`,
    icon: Sparkles,
    ink: paper,
  },
  vortex: {
    background: dark,
    layers: [
      shape(purple, '10% 10%, 82% 10%, 64% 33%, 30% 32%, 32% 85%, 8% 67%'),
      shape(mid, '87% 19%, 90% 85%, 40% 85%, 41% 62%, 70% 62%, 69% 35%'),
    ],
    icon: RotateCw,
    ink: paper,
  },
  shred: {
    background: dark,
    layers: [
      ...[
        '2% 82% 11% 7%',
        '18% 67% 3% 22%',
        '4% 52% 26% 37%',
        '20% 37% 10% 52%',
        '33% 22% 7% 67%',
        '10% 7% 37% 82%',
      ].map((inset, index) => panel(index % 2 ? mid : paper, inset, `rotate(${index * 4 - 12}deg)`)),
    ],
  },
  switch: {
    background: dark,
    layers: [
      shape(mid, '6% 23%, 57% 10%, 57% 76%, 6% 68%'),
      shape(purple, '36% 34%, 94% 20%, 94% 86%, 36% 75%'),
    ],
  },
  flip: {
    background: dark,
    layers: [
      shape(mid, '18% 13%, 45% 27%, 45% 74%, 18% 87%'),
      shape(purple, '55% 27%, 82% 13%, 82% 87%, 55% 74%'),
    ],
    icon: MoveHorizontal,
    ink: paper,
  },
  gallery: {
    background: dark,
    layers: [
      shape(mid, '6% 29%, 37% 19%, 37% 81%, 6% 71%'),
      shape(purple, '45% 22%, 94% 11%, 94% 89%, 45% 78%'),
    ],
  },
  cube: {
    layers: [
      shape(mid, '18% 24%, 50% 10%, 50% 90%, 18% 76%'),
      shape(purple, '50% 10%, 82% 24%, 82% 76%, 50% 90%'),
    ],
  },
  doors: {
    background: dark,
    layers: [
      shape(mid, '0 0, 33% 18%, 33% 82%, 0 100%'),
      shape(purple, '100% 0, 67% 18%, 67% 82%, 100% 100%'),
    ],
  },
  box: {
    background: dark,
    layers: [
      shape(purple, '0 0, 30% 23%, 30% 77%, 0 100%'),
      shape(mid, '100% 0, 70% 23%, 70% 77%, 100% 100%'),
      panel(light, '23% 30%'),
    ],
  },
  comb: {
    layers: [
      { background: `repeating-linear-gradient(${purple} 0 12.5%, transparent 12.5% 25%)`, right: '36%' },
      { background: `repeating-linear-gradient(transparent 0 12.5%, ${mid} 12.5% 25%)`, left: '36%' },
    ],
  },
  zoom: { layers: [panel(mid, '25% 28%')], icon: Maximize },
  random: { background: purple, icon: CircleHelp, ink: paper },
  pan: {
    layers: [panel(mid, '0 17% 0 64%'), panel(purple, '0 64% 0 17%')],
    icon: ArrowUp,
  },
  ferris: {
    layers: [
      panel(purple, '40% 52% 13% 14%', 'rotate(24deg)'),
      panel(mid, '13% 14% 40% 52%', 'rotate(-24deg)'),
    ],
    icon: RotateCw,
    ink: dark,
  },
  conveyor: {
    layers: [
      panel(mid, '19% 66% 19% -10%'),
      panel(purple, '19% 13% 19% 36%'),
      panel(mid, '19% -13% 19% 88%'),
    ],
    icon: ArrowLeft,
    ink: paper,
  },
  rotate: {
    layers: [
      shape(mid, '18% 24%, 50% 10%, 50% 90%, 18% 76%'),
      shape(purple, '50% 10%, 82% 24%, 82% 76%, 50% 90%'),
    ],
    icon: RotateCw,
    ink: paper,
  },
  window: {
    layers: [
      panel(purple, '15% 20%'),
      shape(mid, '0 0, 23% 18%, 23% 82%, 0 100%'),
      shape(mid, '100% 0, 77% 18%, 77% 82%, 100% 100%'),
    ],
  },
  orbit: {
    background: dark,
    layers: [
      shape(mid, '10% 14%, 53% 29%, 53% 71%, 10% 86%'),
      shape(purple, '53% 29%, 90% 20%, 90% 80%, 53% 71%'),
    ],
    icon: RotateCw,
    ink: paper,
  },
  flyThrough: {
    background: dark,
    layers: [panel(purple, '13% 14%'), panel(mid, '24% 23%'), panel(light, '35% 34%')],
    icon: Maximize,
    ink: paper,
  },
};

export function TransitionThumbnail({ effect }: { effect: Effect }) {
  const { background, layers, icon: Icon, ink } = thumbnails[effect];
  return (
    <span className="transition-thumbnail" aria-hidden="true" style={{ background, color: ink }}>
      {layers?.map((style, index) => (
        <span className="transition-thumbnail-layer" key={index} style={style} />
      ))}
      {Icon && <Icon className="transition-thumbnail-icon" />}
    </span>
  );
}
