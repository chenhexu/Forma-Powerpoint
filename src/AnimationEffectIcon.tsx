import {
  ArrowDownToLine,
  ArrowUpFromLine,
  AudioLines,
  Blend,
  Bold,
  CircleDot,
  CircleHelp,
  DoorClosed,
  DoorOpen,
  Eraser,
  Expand,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Frame,
  Grid2X2,
  Grip,
  Highlighter,
  Maximize2,
  MoveDiagonal,
  MoveDown,
  MoveHorizontal,
  MoveUp,
  Paintbrush,
  PaintBucket,
  PieChart,
  Palette,
  PenLine,
  RotateCw,
  Route,
  ScanLine,
  Sparkle,
  Sparkles,
  SplitSquareHorizontal,
  Star,
  TextCursor,
  Type,
  Underline,
  Waves,
  Zap,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import type { AnimationClass } from './animations';

const glyphs: Record<string, LucideIcon> = {
  instant: Eye,
  fade: Blend,
  split: SplitSquareHorizontal,
  wipe: ScanLine,
  bars: AudioLines,
  blinds: Grip,
  box: Frame,
  checker: Grid2X2,
  circle: CircleDot,
  wheel: PieChart,
  wedge: PieChart,
  diamond: MoveDiagonal,
  dissolve: Grip,
  strips: Grip,
  flash: Zap,
  plus: Expand,
  zoom: ZoomIn,
  fly: ArrowUpFromLine,
  float: MoveUp,
  bounce: Waves,
  swivel: FlipHorizontal2,
  flip: FlipHorizontal2,
  growTurn: RotateCw,
  spin: RotateCw,
  spiral: RotateCw,
  pinwheel: RotateCw,
  spinner: RotateCw,
  revolve: RotateCw,
  fadedSwivel: FlipHorizontal2,
  fadedZoom: ZoomIn,
  random: CircleHelp,
  teeter: MoveHorizontal,
  wave: Waves,
  stretch: MoveHorizontal,
  expand: Expand,
  grow: Maximize2,
  pulse: AudioLines,
  darken: CircleDot,
  lighten: Sparkle,
  desaturate: Blend,
  transparency: Blend,
  glide: MoveHorizontal,
  curve: MoveDiagonal,
  descend: MoveDown,
  ascend: MoveUp,
  credits: MoveUp,
  rise: MoveUp,
  typewriter: TextCursor,
  font: Type,
  fontSize: Type,
  fontStyle: Type,
  boldFlash: Bold,
  boldReveal: Bold,
  fontColor: Type,
  fillColor: PaintBucket,
  lineColor: PenLine,
  brushColor: Paintbrush,
  complement: Palette,
  complement2: Palette,
  objectColor: Palette,
  colorBlend: Palette,
  colorWave: Waves,
  colorPulse: Sparkles,
  growColor: Palette,
  blink: EyeOff,
  flicker: Sparkle,
  shimmer: Sparkles,
  blast: Zap,
  underline: Underline,
  highlight: Highlighter,
  crawl: MoveHorizontal,
  breaks: Eraser,
  fold: Frame,
  unfold: Frame,
  magnify: ZoomIn,
  peek: ScanLine,
  compress: MoveHorizontal,
  boomerang: MoveDiagonal,
};
const groupGlyphs = { entr: DoorOpen, emph: Sparkles, exit: DoorClosed, path: Route };

export function EffectIcon({
  group,
  style,
  path,
}: {
  group?: AnimationClass;
  style?: string;
  path?: string;
}) {
  const Icon =
    group === 'exit' && style === 'instant'
      ? EyeOff
      : group === 'exit' && (style === 'fly' || style === 'float')
        ? ArrowDownToLine
        : group === 'exit' && (style === 'zoom' || style === 'fadedZoom')
          ? ZoomOut
          : (style && glyphs[style]) || (group && groupGlyphs[group]) || Star;
  let preview;
  if (path) {
    const points = path.match(/[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
    const x = points.filter((_, i) => i % 2 === 0);
    const y = points.filter((_, i) => i % 2 !== 0);
    const left = Math.min(...x);
    const top = Math.min(...y);
    const width = Math.max(...x) - left;
    const height = Math.max(...y) - top;
    const padding = Math.max(width, height, 0.1) * 0.13;
    preview = (
      <svg
        viewBox={`${left - padding} ${top - padding} ${width + padding * 2} ${height + padding * 2}`}
        width={20}
        height={20}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={padding * 0.65}
      >
        <path d={path} />
        <circle cx={x[0]} cy={y[0]} r={padding * 0.55} fill="currentColor" />
      </svg>
    );
  }
  return (
    <span className="animation-effect-icon" data-group={group} aria-hidden="true">
      {preview ?? <Icon size={19} strokeWidth={1.8} />}
    </span>
  );
}
