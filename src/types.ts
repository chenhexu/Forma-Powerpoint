import type { Transition } from './transitions';
import type { SlideAnimation } from './animations';
export type { Transition } from './transitions';

export const geometries = [
  'line',
  'rect',
  'roundRect',
  'ellipse',
  'triangle',
  'diamond',
  'hexagon',
  'parallelogram',
  'rightArrow',
  'downArrow',
  'chevron',
  'flowChartDecision',
  'star5',
] as const;
export type Geometry = (typeof geometries)[number];
export type Alignment = 'left' | 'center' | 'right' | 'justify';
export type Point = { x: number; y: number };
export type Kind = 'text' | 'shape' | 'image' | 'model' | 'table' | 'chart' | 'media' | 'unsupported';
export type SlideLink =
  | { type: 'web'; url: string }
  | { type: 'slide'; part: string }
  | { type: 'action'; jump: 'firstslide' | 'lastslide' | 'nextslide' | 'previousslide' | 'endshow' };
export type TableData = {
  cells: string[][];
  header: boolean;
  widths?: number[];
  heights?: number[];
  fills?: string[][];
  borders?: Partial<Record<TableEdge, string>>[][];
  merges?: TableMerge[];
};
export type TableEdge = 'T' | 'B' | 'L' | 'R';
export type TableMerge = { row: number; column: number; rows: number; columns: number };
export type ChartData = {
  type: 'column' | 'bar' | 'line' | 'pie' | 'stacked' | 'combo';
  points: { label: string; value: number }[];
  firstSeries?: string;
  series?: { name: string; values: number[] }[];
  workbookName?: string;
};
export type MediaPlayback = {
  start?: number;
  end?: number;
  volume?: number;
  loop?: boolean;
  autoplay?: boolean;
  rewind?: boolean;
  captions?: string;
  captionLabel?: string;
  bookmarks?: { time: number; name: string }[];
};
export type SlideComment = {
  id: string;
  author: string;
  text: string;
  date: string;
  imported?: boolean;
  replyTo?: string;
  resolved?: boolean;
  nativeKey?: string;
};
export type ListStyle = 'none' | 'disc' | 'circle' | 'square' | 'decimal' | 'alpha' | 'roman';
export type Outline = { color: string; width: number; dash: 'solid' | 'dash' | 'dot' };
export type FontSizeRange = { start: number; end: number; size: number };
export interface TextRun {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  baseline?: number;
  highlight?: string;
  letterSpacing?: number;
}
export interface TextParagraph {
  runs: TextRun[];
  alignment?: Alignment;
  left: number;
  right: number;
  indent: number;
  bullet?: string;
  listStyle?: ListStyle;
  indentLevel?: number;
  lineHeight?: { value: number; unit: 'ratio' | 'px' };
  before?: { value: number; unit: 'ratio' | 'px' };
  after?: { value: number; unit: 'ratio' | 'px' };
}
export interface TextFlow {
  paragraphs: TextParagraph[];
  themeFonts: { major?: string; minor?: string };
  noWrap: boolean;
  fitTitle: boolean;
  fitWidth?: number;
  fontScale: number;
  lineReduction: number;
}
export type ModelSourceFile = { path: string; file: Blob };
export type BackgroundPaint =
  | { kind: 'gradient'; angle: number; stops: { color: string; position: number }[] }
  | { kind: 'pattern'; pattern: 'ltHorz' | 'ltVert' | 'ltDnDiag'; fore: string; back: string }
  | { kind: 'image'; asset: string };
export type SlideTheme = { heading: string; body: string; accent: string };
export type SlideSection = { id: string; name: string };
export interface SlideObject {
  id: string;
  name: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  locked?: boolean;
  groupId?: string;
  layoutPlaceholder?: number;
  hidden?: boolean;
  connector?: { from: string; to: string };
  customPaths?: Point[][];
  pictureShape?: 'rect' | 'ellipse' | 'roundRect' | 'triangle';
  pictureOpacity?: number;
  pictureBrightness?: number;
  originalPicture?: string;
  pictureSourceAsset?: string;
  pictureFileName?: string;
  deleteBlocked?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  crop?: [number, number, number, number];
  text?: string;
  fontSize?: number;
  fontSizeRanges?: FontSizeRange[];
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  baseline?: number;
  letterSpacing?: number;
  fontFamily?: string;
  alignment?: Alignment;
  listStyle?: ListStyle;
  indentLevel?: number;
  lineSpacing?: number;
  columns?: number;
  textAnchor?: 'top' | 'middle' | 'bottom';
  textInsets?: [number, number, number, number];
  textFlow?: TextFlow;
  fontReplacements?: { from: string; to: string }[];
  slideNumber?: boolean;
  link?: SlideLink;
  table?: TableData;
  chart?: ChartData;
  media?: 'video' | 'audio';
  mediaPlayback?: MediaPlayback;
  altText?: string;
  stroke?: { points: Point[]; color: string; width: number; opacity?: number };
  fill?: string;
  fillThemeAccent?: boolean;
  outline?: Outline;
  geometry?: Geometry;
  adjustments?: Record<string, number>;
  asset?: string;
  preview?: string;
  modelPreviewKey?: string;
  modelZoom?: number;
  pose?: [number, number, number];
  modelCenter?: [number, number, number];
  modelSize?: number;
  sourceXml?: string;
  sourcePart?: string;
  changed: string[];
  warning?: string;
}
export interface Slide {
  id: string;
  part: string;
  sourcePart?: string;
  layoutSource?: string;
  savedLayout?: string;
  sectionAnchor?: string;
  sectionId?: string;
  masterObjects?: SlideObject[];
  masterGraphicsHidden?: boolean;
  sourceXml: string;
  objects: SlideObject[];
  background: string;
  backgroundDirty?: boolean;
  backgroundPaint?: BackgroundPaint;
  transition: Transition;
  transitionOption?: string;
  advanceOnClick?: boolean;
  advanceAfter?: number | null;
  hidden?: boolean;
  duration: number;
  dirty: boolean;
  transitionDirty?: boolean;
  rehearsalTimingDirty?: boolean;
  warnings: string[];
  comments?: SlideComment[];
  commentThreadsDirty?: boolean;
  speakerNotes?: string;
  speakerNotesDirty?: boolean;
  animations?: SlideAnimation[];
  animationsUnpreviewed?: boolean;
  replaceAnimationTiming?: boolean;
}
export type CustomShow = { id: number; name: string; slideIds: string[] };
export interface Deck {
  name: string;
  width: number;
  height: number;
  slides: Slide[];
  sections?: SlideSection[];
  theme?: SlideTheme;
  themeDirty?: boolean;
  masterObjects?: SlideObject[];
  masterDirty?: boolean;
  savedLayouts?: { id: string; name: string; placeholders: SlideObject[]; part?: string; dirty?: boolean }[];
  sectionsDirty?: boolean;
  customShows?: CustomShow[];
  customShowsDirty?: boolean;
}
export interface Asset {
  bytes: Uint8Array;
  mime: string;
  url: string;
}
export interface Project {
  deck: Deck;
  original: Uint8Array;
  assets: Record<string, Asset>;
  modelSources?: Record<string, ModelSourceFile[]>;
}
export const uid = () => crypto.randomUUID();
export const EMU = 9525; // Editor coordinates are CSS pixels at 96 dpi.

// Fit tall and narrow frames without cropping a typical centered model.
export const modelCameraDistance = (aspect: number) => 3.7 / Math.min(1, Math.max(0.05, aspect));

export const modelZoomFactor = (o: SlideObject) =>
  o.kind === 'model' && !o.locked ? (o.modelZoom ?? 100) / 100 : 1;

// Zoom changes the visible frame around the same center. The editor caps the hitbox at the base frame size.
export function modelDisplayFrame(o: SlideObject): SlideObject {
  const scale = modelZoomFactor(o);
  if (scale === 1) return o;
  const w = o.w * scale;
  const h = o.h * scale;
  return { ...o, x: o.x + (o.w - w) / 2, y: o.y + (o.h - h) / 2, w, h, modelZoom: undefined };
}

export const modelPreviewKey = (o: Pick<SlideObject, 'w' | 'h' | 'pose'>) =>
  [Math.max(1, o.w) / Math.max(1, o.h), ...(o.pose || [0, 0, 0])].join(',');
