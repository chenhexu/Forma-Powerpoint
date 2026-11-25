import JSZip from 'jszip';
import { AccessibilityReview } from './AccessibilityReview';
import { AutomationTools } from './AutomationTools';
import { CustomShows } from './ShowTools';
import { PrintSlides } from './PrintSlides';
import { CollaborationDialog } from './CollaborationDialog';
import { ZoomPercentage } from './ZoomPercentage';
import { SidebarResize, SidebarTabs, type EditorPane } from './EditorSidebar';
import { emptyRoom, RoomClient } from './collaboration';
import { applyDeckPatch } from './deckPatch.mjs';
import { MediaSettings, RecordAudio } from './MediaSettings';
import { SpeakerNotesDialog, openPresenterWindow } from './PresenterTools';
import { hasInkRecognition, recognizeInk } from './inkRecognition';
import { objectFonts, replaceSlideFont, replaceSlideText, textMatches } from './findReplace';
import {
  downloadPicture,
  pictureAccept,
  pictureCropShapes,
  pictureExtension,
  pictureFormatName,
  pictureFormats,
  pictureType,
  preparePicture,
  removeEdgeBackground,
  type PictureDownload,
} from './pictureEditing';
import { mergeCommands, mergeShapes, type MergeCommand } from './mergeShapes';
import {
  ObjectSpacing,
  ReuseSlides,
  SlideMaster,
  SlideSize,
  SlideToolsDialog,
  ThemeSettings,
} from './SlideTools';
import { backgroundFallback, pasteObjects, resizeDeck } from './slideEditing';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlignCenter,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  AlignLeft,
  Bold,
  Eraser,
  Paintbrush,
  Strikethrough,
  Superscript,
  Subscript,
  IndentIncrease,
  IndentDecrease,
  ClipboardPaste,
  Italic,
  MoreHorizontal,
  Pen,
  Pencil,
  Highlighter,
  Lasso,
  Shapes,
  Scissors,
  Search,
  Underline,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  LayoutTemplate,
  ImagePlus,
  Layers,
  PanelRight,
  PanelLeft,
  LockKeyhole,
  Maximize,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  PaintBucket,
  Move3D,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  ShieldCheck,
  Sparkles,
  Square,
  Settings2,
  Zap,
  Trash2,
  Type,
  Undo2,
  UnlockKeyhole,
  Users,
  X,
} from 'lucide-react';
import { Canvas, SlidePreview, type EditRequest } from './Canvas';
import {
  eraseInk,
  eraserRadius,
  eraserSamples,
  initialPens,
  inkFrame,
  inkToShape,
  lassoContains,
  penDefaults,
  slideInkPoints,
  type DrawTool,
  type EraserMode,
  type Ink,
  type InkPen,
  type InkStyle,
  type PenKind,
} from './ink';
import {
  createProject,
  duplicateSlide,
  exportPptx,
  importPptx,
  insertBlankSlide,
  makeAsset,
  masterFooterName,
  masterLogoName,
  newObject,
  releaseProject,
  reuseSlides,
} from './pptx';
import { demoGlb, loadModel, renderModelPng } from './model';
import { History } from './history';
import { importModelFiles, isModelInput, modelAccept } from './modelImport';
import {
  EXPORT_TEXTURE_LIMIT,
  exportModelWarnings,
  inspectModel,
  modelPerformanceWarnings,
  modelSizeLabel,
  shrinkModelTextures,
} from './modelPerformance';
import { clearSavedProject, restoreProject, saveProject } from './storage';
import { Presentation } from './Presentation';
import { Options, readPreferences, storePreferences, type OptionsSection } from './Options';
import { AnimationGallery } from './AnimationControls';
import { AnimationPane, canMoveEffect } from './AnimationPane';
import type { AnimationPosition } from './animationTimeline';
import { AnimationSettings, triggerChoices, type AnimationSettingsTab } from './AnimationSettings';
import {
  AnimationPreview,
  CustomPath,
  PreviewSettings,
  TransitionPreview,
  type EditorPreviewKind,
  type PreviewPreferences,
} from './EditorPreview';
import { animationEffect, animationStarts, type SlideAnimation } from './animations';
import {
  uid,
  modelPreviewKey,
  type Alignment,
  type BackgroundPaint,
  type SlideTheme,
  type ChartData,
  type Deck,
  type Geometry,
  type Outline,
  type Point,
  type Project,
  type Slide,
  type SlideObject,
  type TableData,
  type Transition,
} from './types';
import { Ribbon, Dropdown, RibbonGroup, type RibbonTab, type FormatTab } from './Ribbon';
import { paragraphFormatKeys, runFormatKeys } from './textFormat';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ListStyleMenu } from './ListStyleMenu';
import { remapFontSizeRanges, resizeTextSelection } from './textRuns';
import type { TextEditSession } from './textSelection';
import { arrangeObjects, editable, type Arrange, type Axis } from './layout';
import { InsertRibbon, type InsertCommand } from './InsertRibbon';
import { emptyTable, InsertDialog, type InsertDialogState, type InsertResult } from './InsertDialog';
import { captureScreenshot, mediaPoster } from './insertMedia';
import { connectorFrame, isLine, refreshConnectors, shapeRings } from './shapeGeometry';
import { SlideDialog, type SlideDialogKind } from './SlideDialog';
import { TransitionGallery } from './TransitionGallery';
import { defaultTransitionOption, transitionChoices, transitionGroups, transitions } from './transitions';
import {
  alignmentReferencePreviews,
  arrangePreviews,
  casePreviews,
  characterSpacingPreviews,
  lineSpacingPreviews,
  objectAlignmentPreviews,
  outlinePreviews,
  paragraphAlignmentPreviews,
  shapePreviews,
  ShapeSwatch,
  slideLayoutPreviews,
  textColumnPreviews,
  verticalAlignmentPreviews,
} from './RibbonPreviews';

const backgroundPresets = [
  ['White', '#ffffff'],
  ['Lavender', '#eee8ff'],
  ['Slate', '#e4e9f3'],
  ['Sand', '#f5eddc'],
  ['Mint', '#e2f3ec'],
] as const;
const shapes: [Geometry, string][] = [
  ['line', 'Line'],
  ['rect', 'Rectangle'],
  ['roundRect', 'Rounded rectangle'],
  ['ellipse', 'Ellipse'],
  ['triangle', 'Triangle'],
  ['diamond', 'Diamond'],
  ['hexagon', 'Hexagon'],
  ['parallelogram', 'Parallelogram'],
  ['rightArrow', 'Right arrow'],
  ['downArrow', 'Down arrow'],
  ['chevron', 'Chevron'],
  ['flowChartDecision', 'Decision'],
  ['star5', 'Five-point star'],
];
const arrangeCommands: [Arrange, string][] = [
  ['left', 'Align left'],
  ['center', 'Align center'],
  ['right', 'Align right'],
  ['top', 'Align top'],
  ['middle', 'Align middle'],
  ['bottom', 'Align bottom'],
  ['horizontal', 'Distribute horizontally'],
  ['vertical', 'Distribute vertically'],
];
const fontChoices = ['Arial', 'Aptos', 'Calibri', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'];
const fontSizes = [
  '8',
  '9',
  '10',
  '11',
  '12',
  '14',
  '16',
  '18',
  '20',
  '22',
  '24',
  '26',
  '28',
  '32',
  '36',
  '40',
  '44',
  '48',
  '54',
  '60',
  '66',
  '72',
  '80',
  '88',
  '96',
];
const fitView = { zoom: 1, x: 0, y: 0 };
const minSlideZoom = 0.25;
const maxSlideZoom = 3;
const clampSlideZoom = (zoom: number) => Math.max(minSlideZoom, Math.min(maxSlideZoom, zoom));
const pointsToPixels = (points: number) => (points * 4) / 3;
const fontPoints = (pixels = 28) => Math.round(pixels * 75) / 100;
const slideLayouts = [
  ['title', 'Title Slide'],
  ['content', 'Title and Content'],
  ['section', 'Section Header'],
  ['two-content', 'Two Content'],
  ['comparison', 'Comparison'],
  ['title-only', 'Title Only'],
  ['blank', 'Blank'],
  ['content-caption', 'Content with Caption'],
  ['picture-caption', 'Picture with Caption'],
] as const;
type SlideLayout = (typeof slideLayouts)[number][0];
const shapeStyles = [
  { label: 'Lavender', fill: '#eee8ff', line: '#6345bd' },
  { label: 'Ocean', fill: '#dceeff', line: '#2462a0' },
  { label: 'Mint', fill: '#dcefe6', line: '#247052' },
  { label: 'Amber', fill: '#fff0cf', line: '#986011' },
  { label: 'Neutral', fill: '#f1eff4', line: '#5e596a' },
] as const;
const textFormatKeys = [...runFormatKeys, ...paragraphFormatKeys, 'textAnchor', 'columns'] as const;
const defaultTextFormat: Partial<SlideObject> = {
  fontFamily: '+mn-lt',
  fontSize: 28,
  color: '#17233b',
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  baseline: 0,
  letterSpacing: 0,
  alignment: 'left',
  listStyle: 'none',
  indentLevel: 0,
  lineSpacing: 1,
  textAnchor: 'top',
  columns: 1,
};
const caseChoices = [
  ['sentence', 'Sentence case'],
  ['lower', 'lowercase'],
  ['upper', 'UPPERCASE'],
  ['title', 'Capitalize Each Word'],
  ['toggle', 'tOGGLE cASE'],
] as const;

function changeCase(text: string, mode: (typeof caseChoices)[number][0]) {
  if (mode === 'lower') return text.toLocaleLowerCase();
  if (mode === 'upper') return text.toLocaleUpperCase();
  if (mode === 'toggle')
    return text.replace(/\p{L}/gu, (c) =>
      c === c.toLocaleLowerCase() ? c.toLocaleUpperCase() : c.toLocaleLowerCase(),
    );
  const lower = text.toLocaleLowerCase();
  const start = mode === 'title' ? /(^|[^\p{L}\p{N}’'])(\p{L})/gu : /(^|[.!?]\s+|\n)(\s*\p{L})/gu;
  return lower.replace(start, (_, prefix, char) => prefix + char.toLocaleUpperCase());
}

function presetObjects(layout: SlideLayout, deck: Deck): SlideObject[] {
  const { width, height } = deck;
  const text = (
    name: string,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    centered = false,
  ): SlideObject => ({
    ...newObject('text', deck),
    name,
    text: value,
    x: x * width,
    y: y * height,
    w: w * width,
    h: h * height,
    fontSize: Math.max(8, Math.round(size * Math.min(width / 1280, height / 720))),
    bold: name === 'Title',
    fontFamily: deck.themeDirty ? (name === 'Title' ? deck.theme?.heading : deck.theme?.body) : undefined,
    alignment: centered ? 'center' : 'left',
  });
  switch (layout) {
    case 'blank':
      return [];
    case 'title':
      return [
        text('Title', 'Slide title', 0.08, 0.33, 0.84, 0.21, 62, true),
        text('Subtitle', 'Subtitle', 0.12, 0.56, 0.76, 0.12, 30, true),
      ];
    case 'section':
      return [
        text('Title', 'Section title', 0.08, 0.43, 0.84, 0.2, 56),
        text('Subtitle', 'Section subtitle', 0.08, 0.65, 0.84, 0.12, 28),
      ];
    case 'content':
      return [
        text('Title', 'Slide title', 0.08, 0.09, 0.84, 0.14, 47),
        text('Content', 'Add your content', 0.08, 0.28, 0.84, 0.57, 29),
      ];
    case 'two-content':
      return [
        text('Title', 'Slide title', 0.08, 0.09, 0.84, 0.14, 47),
        text('Left content', 'Add your content', 0.08, 0.28, 0.39, 0.57, 29),
        text('Right content', 'Add your content', 0.53, 0.28, 0.39, 0.57, 29),
      ];
    case 'title-only':
      return [text('Title', 'Slide title', 0.08, 0.09, 0.84, 0.14, 47)];
    case 'comparison':
      return [
        ...presetObjects('title-only', deck),
        text('Left heading', 'Option A', 0.08, 0.28, 0.39, 0.08, 28),
        text('Right heading', 'Option B', 0.53, 0.28, 0.39, 0.08, 28),
        text('Left content', 'Add your details', 0.08, 0.39, 0.39, 0.43, 24),
        text('Right content', 'Add your details', 0.53, 0.39, 0.39, 0.43, 24),
      ];
    case 'picture-caption':
    case 'content-caption':
      return [
        text('Title', 'Slide title', 0.08, 0.15, 0.29, 0.2, 40),
        text('Caption', 'Add a caption', 0.08, 0.43, 0.28, 0.31, 26),
        layout === 'picture-caption'
          ? {
              ...newObject('shape', deck),
              name: 'Picture area',
              x: width * 0.42,
              y: height * 0.15,
              w: width * 0.5,
              h: height * 0.64,
              fill: '#f1eef7',
            }
          : text('Content', 'Add your content', 0.42, 0.15, 0.5, 0.64, 29),
      ];
  }
}

const equationText: Record<string, string> = {
  circle: 'A = πr²',
  binomial: '(x + y)ⁿ = ∑ₖ₌₀ⁿ C(n, k) xⁿ⁻ᵏ yᵏ',
  euler: 'e^(iπ) + 1 = 0',
  pythagorean: 'a² + b² = c²',
  quadratic: 'x = (−b ± √(b² − 4ac)) / (2a)',
  series: 'f(x) = f(a) + f′(a)(x − a) + f″(a)(x − a)² / 2! + ⋯',
};

function formatDate(format: string, language: string) {
  const options: Intl.DateTimeFormatOptions =
    format === 'time'
      ? { timeStyle: 'short' }
      : format === 'both'
        ? { dateStyle: 'medium', timeStyle: 'short' }
        : { dateStyle: format === 'long' ? 'long' : 'short' };
  return new Intl.DateTimeFormat(language === 'browser' ? undefined : language, options).format(new Date());
}

function pageDetail(kind: 'date' | 'header' | 'footer' | 'number', text: string, deck: Deck): SlideObject {
  const names = { date: 'Date and time', header: 'Header', footer: 'Footer', number: 'Slide number' };
  const { width, height } = deck;
  const centered = kind === 'header' || kind === 'footer';
  return {
    ...newObject('text', deck),
    name: names[kind],
    altText: 'Forma ' + names[kind].toLowerCase(),
    text,
    slideNumber: kind === 'number' || undefined,
    x: width * (centered ? 0.24 : kind === 'number' ? 0.76 : 0.05),
    y: height * (kind === 'header' ? 0.035 : 0.935),
    w: width * (centered ? 0.52 : 0.19),
    h: height * 0.041,
    fontSize: Math.max(10, height / 45),
    color: '#534e63',
    alignment: centered ? 'center' : kind === 'number' ? 'right' : 'left',
  };
}

const diagramLayouts: Record<string, [number, number, string][]> = {
  list: [
    [0.37, 0.27, 'First item'],
    [0.37, 0.43, 'Second item'],
    [0.37, 0.59, 'Third item'],
  ],
  process: [
    [0.08, 0.43, 'Plan'],
    [0.37, 0.43, 'Build'],
    [0.66, 0.43, 'Deliver'],
  ],
  cycle: [
    [0.37, 0.19, 'Plan'],
    [0.57, 0.56, 'Do'],
    [0.17, 0.56, 'Review'],
  ],
  hierarchy: [
    [0.37, 0.25, 'Team lead'],
    [0.16, 0.6, 'Team A'],
    [0.58, 0.6, 'Team B'],
  ],
  relationship: [
    [0.37, 0.21, 'Idea A'],
    [0.12, 0.58, 'Idea B'],
    [0.62, 0.58, 'Idea C'],
    [0.37, 0.43, 'Main idea'],
  ],
  matrix: [
    [0.22, 0.26, 'A'],
    [0.52, 0.26, 'B'],
    [0.22, 0.48, 'C'],
    [0.52, 0.48, 'D'],
  ],
  pyramid: [
    [0.37, 0.25, 'Goal'],
    [0.37, 0.42, 'Strategy'],
    [0.37, 0.59, 'Foundation'],
  ],
};

function diagramObjects(layout: string, deck: Deck) {
  const { width, height } = deck;
  const boxes = diagramLayouts[layout].map(([left, top, label], index): SlideObject => {
    const extra = layout === 'pyramid' ? index * 0.07 : 0;
    return {
      ...newObject('text', deck),
      name: label,
      text: label,
      geometry: 'roundRect',
      x: width * (left - extra),
      y: height * top,
      w: width * (0.26 + 2 * extra),
      h: height * 0.14,
      fill: ['#6345bd', '#7253c8', '#51458e', '#403575'][index],
      color: '#ffffff',
      bold: true,
      fontSize: Math.max(12, width / 50),
      alignment: 'center',
      textAnchor: 'middle',
    };
  });
  const links: Record<string, [number, number][]> = {
    process: [
      [0, 1],
      [1, 2],
    ],
    cycle: [
      [0, 1],
      [1, 2],
      [2, 0],
    ],
    hierarchy: [
      [0, 1],
      [0, 2],
    ],
    relationship: [
      [3, 0],
      [3, 1],
      [3, 2],
    ],
  };
  const lines = (links[layout] || []).map(([from, to]): SlideObject => {
    const a = boxes[from],
      b = boxes[to];
    const x = a.x + a.w / 2,
      y = a.y + a.h / 2,
      endX = b.x + b.w / 2,
      endY = b.y + b.h / 2;
    const w = Math.hypot(endX - x, endY - y);
    return {
      ...newObject('shape', deck),
      name: 'Diagram connector',
      x: (x + endX - w) / 2,
      y: (y + endY) / 2 - 2,
      w,
      h: 4,
      fill: '#a892df',
      rotation: (Math.atan2(endY - y, endX - x) * 180) / Math.PI,
    };
  });
  return [...lines, ...boxes];
}

type Menu = {
  x: number;
  y: number;
  area: 'slide' | 'object' | 'canvas';
  position?: Point;
  returnFocus?: HTMLElement;
};

function Tool({
  children,
  icon,
  onClick,
  disabled,
  active,
  title,
  onMouseDown,
}: {
  children?: ReactNode;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  onMouseDown?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`tool ${active ? 'active' : ''}`}
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      aria-label={title || (typeof children === 'string' ? children : undefined)}
    >
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}
function NumberField({
  label,
  caption = label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  caption?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = String(Math.round(value * 100) / 100);
  return (
    <label className="number-field">
      <span>{caption}</span>
      <input
        aria-label={label}
        type="number"
        value={draft ?? display}
        min={min}
        max={max}
        step="any"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== '' && Number.isFinite(Number(draft))) {
            const next = Math.min(max ?? 100000, Math.max(min ?? -100000, Number(draft)));
            if (next !== value) onChange(next);
          }
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

async function initialProject(withDemo: boolean) {
  const project = await createProject();
  if (!withDemo) return project;
  project.deck.name = 'A new perspective';
  const slide = project.deck.slides[0];
  slide.dirty = true;
  const text = (
    name: string,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    color: string,
    bold = false,
  ): SlideObject => ({
    ...newObject('text', project.deck),
    name,
    text: value,
    x,
    y,
    w,
    h,
    fontSize: size,
    color,
    bold,
  });
  slide.objects.push(
    text('Section label', 'A LITTLE DIMENSION. A BIG DIFFERENCE.', 80, 80, 700, 40, 17, '#7e6eab', true),
  );
  slide.objects.push(text('Title', 'Ideas,\nwith a twist.', 78, 172, 620, 240, 83, '#25334d', true));
  slide.objects.push(
    text(
      'Description',
      'Bring a new perspective to your next presentation.\nExplore native 3D models and seamless Morph.',
      82,
      446,
      600,
      90,
      24,
      '#707b90',
    ),
  );
  slide.objects.push(text('Footer', 'DESIGNED TO MOVE', 82, 625, 500, 35, 15, '#8d95a3', true));
  try {
    const bytes = await demoGlb();
    const key = uid();
    const asset = makeAsset(bytes, 'model/gltf-binary');
    project.assets[key] = asset;
    const model = await loadModel(asset);
    const o: SlideObject = {
      ...newObject('model', project.deck),
      name: '!!Forma_Knot',
      x: 666,
      y: 118,
      w: 560,
      h: 500,
      asset: key,
      pose: [24, -25, 0],
      modelCenter: model.center,
      modelSize: model.size,
    };
    try {
      const preview = await renderModelPng(o, asset, model);
      const previewId = uid();
      project.assets[previewId] = makeAsset(preview, 'image/png');
      o.preview = previewId;
      o.modelPreviewKey = modelPreviewKey(o);
    } catch {
      /* WebGL limits are shown by the model view and on export. */
    }
    slide.objects.push(o);
  } catch {
    slide.warnings.push(
      'The sample model could not be initialized. You can still import your own presentation.',
    );
  }
  project.deck = duplicateSlide(project.deck, 0, true);
  const second = project.deck.slides[1];
  const model = second.objects.find((o) => o.kind === 'model');
  if (model) {
    model.pose = [-20, 115, 15];
    model.x = 700;
    model.y = 90;
    model.changed.push('pose', 'x', 'y');
  }
  const title = second.objects.find((o) => o.text === 'Ideas,\nwith a twist.');
  if (title) {
    title.text = 'A different\npoint of view.';
    title.fontSize = 72;
    title.changed.push('text', 'fontSize');
  }
  return project;
}

export default function App() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [options, setOptions] = useState<OptionsSection>();
  useEffect(() => {
    storePreferences(preferences);
  }, [preferences]);
  const [project, setProjectState] = useState<Project | null>(null);
  const [roomStatus, setRoomStatus] = useState(emptyRoom);
  const [showRoom, setShowRoom] = useState(false);
  const roomClient = useRef<RoomClient>(undefined);
  const roomOrigin = useRef<Project>(undefined);
  const intendedRoom = useRef<'create' | 'join'>('create');
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.at(-1) || null;
  const setSelected = (id: string | null) => setSelection(id ? [id] : []);
  const [ribbon, setRibbon] = useState<RibbonTab>('Home');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [insertDialog, setInsertDialog] = useState<InsertDialogState | null>(null);
  const [toolsDialog, setToolsDialog] = useState<
    'size' | 'theme' | 'reuse' | 'section' | 'master' | 'customLayout' | 'picture' | 'spacing' | null
  >(null);
  const [reuseSource, setReuseSource] = useState<Project | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const reuseRequest = useRef(0);
  useEffect(
    () => () => {
      if (reuseSource) releaseProject(reuseSource);
    },
    [reuseSource],
  );
  const [mediaDialog, setMediaDialog] = useState<'playback' | 'record' | 'narration' | 'camera'>();
  const [slideDialog, setSlideDialog] = useState<SlideDialogKind | null>(null);
  const [drawTool, setDrawTool] = useState<DrawTool>('select');
  const [pens, setPens] = useState(initialPens);
  const [penId, setPenId] = useState(initialPens[0].id);
  const pen = pens.find(({ id }) => id === penId) ?? pens[0];
  const [eraser, setEraser] = useState<EraserMode>('stroke');
  const [grid, setGrid] = useState(false);
  const [guides, setGuides] = useState(false);
  const [ruler, setRuler] = useState(false);
  const { smartGuides, spellCheck } = preferences;
  const [alignToSlide, setAlignToSlide] = useState(false);
  const [dragAxis, setDragAxis] = useState<Axis>();
  const [panes, setPanes] = useState<{ tabs: EditorPane[]; active?: EditorPane }>({ tabs: [] });
  const [slidesCollapsed, setSlidesCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOverlayOpen, setSidebarOverlayOpen] = useState(false);
  const [slidesWidth, setSlidesWidth] = useState<number>();
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [editorWidth, setEditorWidth] = useState(() => window.innerWidth);
  const openSidebarButton = useRef<HTMLButtonElement>(null);
  const slidesToggleButton = useRef<HTMLButtonElement>(null);
  const focusSidebarButton = useCallback(
    () => openSidebarButton.current?.focus({ preventScroll: true }),
    [],
  );
  useEffect(() => {
    const resize = () => setEditorWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  function openPane(id: EditorPane, activate = true) {
    setPanes((state) => {
      const tabs = state.tabs.includes(id) ? state.tabs : [...state.tabs, id];
      const active = activate ? id : (state.active ?? id);
      return tabs === state.tabs && active === state.active ? state : { tabs, active };
    });
    if (activate) {
      setSidebarCollapsed(false);
      if (window.innerWidth <= 620) setSidebarOverlayOpen(true);
    }
  }
  function closePane(id: EditorPane) {
    setPanes((state) => {
      const index = state.tabs.indexOf(id);
      if (index === -1) return state;
      const tabs = state.tabs.filter((tab) => tab !== id);
      const active = state.active === id ? tabs[Math.min(index, tabs.length - 1)] : state.active;
      return { tabs, active };
    });
  }
  const compactSidebar = editorWidth <= 620;
  const slidesMin = compactSidebar ? 76 : 112;
  const slidesMax = Math.max(slidesMin, Math.min(380, Math.floor(editorWidth * 0.32)));
  const railWidth = Math.max(slidesMin, Math.min(slidesMax, slidesWidth ?? (compactSidebar ? 90 : 212)));
  const sidebarMin = Math.min(236, editorWidth - 28);
  const sidebarMax = Math.max(
    sidebarMin,
    Math.min(625, compactSidebar ? editorWidth - 28 : editorWidth - (slidesCollapsed ? 0 : railWidth) - 190),
  );
  const toolsWidth = Math.min(sidebarMax, Math.max(sidebarMin, sidebarWidth));
  const workspaceOpen = !sidebarCollapsed && (!compactSidebar || sidebarOverlayOpen);
  const collapseSidebar = () => {
    setSidebarCollapsed(true);
    setSidebarOverlayOpen(false);
    requestAnimationFrame(focusSidebarButton);
  };
  const [view, setView] = useState<'normal' | 'sorter'>(preferences.initialView);
  const [sectionRename, setSectionRename] = useState(false);
  const [find, setFind] = useState(false);
  const [query, setQuery] = useState('');
  const [replaceMode, setReplaceMode] = useState<'find' | 'text' | 'font'>('find');
  const [replaceWith, setReplaceWith] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [replaceStatus, setReplaceStatus] = useState('');
  const [editPoints, setEditPoints] = useState<string>();
  const [recognizedInk, setRecognizedInk] = useState<{
    text: string;
    math: boolean;
    ids: string[];
    slideId: string;
  }>();
  const [inkReplay, setInkReplay] = useState<number>();
  const [editRequest, setEditRequest] = useState<EditRequest | null>(null);
  const textEditor = useRef<TextEditSession | null>(null);
  const [orbit, setOrbit] = useState(false);
  const [busy, setBusy] = useState('Opening your workspace…');
  const [notice, setNotice] = useState('');
  const [exportReview, setExportReview] = useState<{
    check: ReturnType<typeof exportModelWarnings>;
    format: 'pptx' | 'potx';
    optimized?: ReadonlyMap<string, Uint8Array>;
    savings?: number;
  } | null>(null);
  const exportDialog = useRef<HTMLDialogElement>(null);
  const exportReviewOpen = exportReview !== null;
  useEffect(() => {
    if (exportReviewOpen) exportDialog.current?.showModal();
  }, [exportReviewOpen]);
  const [saved, setSaved] = useState('Local workspace');
  const [report, setReport] = useState(false);
  const [help, setHelp] = useState(false);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [showOrder, setShowOrder] = useState<string[]>();
  const [rehearsing, setRehearsing] = useState(false);
  const [playTimings, setPlayTimings] = useState(true);
  const [customShowsOpen, setCustomShowsOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const presenterWindow = useRef<Window>(undefined);
  useEffect(() => () => presenterWindow.current?.close(), []);
  function closePresentation() {
    presenterWindow.current?.close();
    presenterWindow.current = undefined;
    setPresenting(null);
    setRehearsing(false);
    setShowOrder(undefined);
  }
  function saveRehearsal(timings: Record<string, number>) {
    const deck = current.current?.deck;
    if (deck) {
      commit({
        ...deck,
        slides: deck.slides.map((slide) =>
          timings[slide.id] === undefined
            ? slide
            : {
                ...slide,
                advanceAfter: timings[slide.id],
                rehearsalTimingDirty: true,
                transitionDirty: true,
                dirty: true,
              },
        ),
      });
      setPlayTimings(true);
      setNotice(`Saved timings for ${Object.keys(timings).length} slides.`);
    }
    closePresentation();
  }
  const [editorPreview, setEditorPreview] = useState<EditorPreviewKind | null>(null);
  const [previewFrom, setPreviewFrom] = useState<string | AnimationPosition>();
  const [animationSettings, setAnimationSettings] = useState<{ id: string; tab: AnimationSettingsTab }>();
  const [animationPicker, setAnimationPicker] = useState<number>();
  const [animationBrush, setAnimationBrush] = useState<SlideAnimation[] | null>(null);
  const [showPreviewSettings, setShowPreviewSettings] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<PreviewPreferences>({
    speed: '1',
    requireClicks: true,
  });
  const [selectedAnimationId, setSelectedAnimationId] = useState<string>();
  const [customPath, setCustomPath] = useState<{ target: string; add: boolean } | null>(null);
  const previewLocked = editorPreview !== null || customPath !== null;
  function previousVisibleSlide() {
    let previous = index - 1;
    while (previous >= 0 && deck?.slides[previous].hidden) previous--;
    return previous;
  }
  function togglePreview(kind: EditorPreviewKind, from?: string | AnimationPosition) {
    if (editorPreview === kind) {
      setEditorPreview(null);
      return;
    }
    setView('normal');
    setPreviewFrom(from);
    setMenu(null);
    setEditRequest(null);
    setOrbit(false);
    setRibbon(kind === 'animation' ? 'Animations' : 'Transitions');
    setEditorPreview(kind);
  }
  const [slideViews, setSlideViews] = useState<Record<string, typeof fitView>>({});
  const canvasAnchor = useRef<{ id: string; cursor: Point; fraction: Point } | null>(null);
  const pastePoint = useRef<{ id: string; point: Point } | undefined>(undefined);
  const gestureZoom = useRef(1);
  const [panning, setPanning] = useState(false);
  const panGesture = useRef<{
    pointer: number;
    slideId: string;
    target: EventTarget;
    start: Point;
    last: Point;
    move: Point;
    axis?: keyof Point;
    dragged: boolean;
  } | null>(null);
  const [viewport, setViewport] = useState({ w: 900, h: 650 });
  const history = useRef<History<Deck> | null>(null);
  const current = useRef(project);
  const indexRef = useRef(index);
  indexRef.current = index;
  const setProject = useCallback(
    (update: Project | null | ((previous: Project | null) => Project | null)) => {
      const next = typeof update === 'function' ? update(current.current) : update;
      current.current = next;
      setProjectState(next);
      if (next) roomClient.current?.change(next);
    },
    [],
  );
  useEffect(
    () => () => {
      roomClient.current?.close();
      if (roomOrigin.current) releaseProject(roomOrigin.current);
    },
    [],
  );
  const pptInput = useRef<HTMLInputElement>(null),
    modelInput = useRef<HTMLInputElement>(null),
    modelFolderInput = useRef<HTMLInputElement>(null),
    textureFolderInput = useRef<HTMLInputElement>(null),
    repairSourceInput = useRef<HTMLInputElement>(null),
    imgInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const canvasArea = useRef<HTMLDivElement>(null);
  const [pendingTextures, setPendingTextures] = useState<{ asset: string; files: File[] } | null>(null);
  const [clipboard, setClipboard] = useState<SlideObject[]>([]);
  const clipboardSlide = useRef<string | undefined>(undefined);
  const [formatBrush, setFormatBrush] = useState<{
    kind: 'text' | 'shape';
    fields: Partial<SlideObject>;
  } | null>(null);
  const fontPresetSelection = useRef<{ id: string; snapshot: ReturnType<TextEditSession['read']> } | null>(
    null,
  );
  const dragSlide = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    side: 'before' | 'after';
    list: 'rail' | 'sorter';
  } | null>(null);
  const [deletingSlide, setDeletingSlide] = useState<{ slide: Slide; index: number } | null>(null);
  const generation = useRef(0);
  const savedQueue = useRef(Promise.resolve());
  const deck = project?.deck;
  const slide = deck?.slides[index];
  const newSlideLayouts = [
    ...slideLayouts,
    ...(deck?.savedLayouts || []).map(({ id, name }) => [id, name] as const),
  ];
  const slideItems = deck?.slides.map((item, position) => ({ item, position, exiting: false })) ?? [];
  if (deletingSlide && !slideItems.some(({ item }) => item.id === deletingSlide.slide.id)) {
    const { slide: item, index: position } = deletingSlide;
    slideItems.splice(position, 0, { item, position, exiting: true });
  }
  const object = slide?.objects.find((o) => o.id === selected);
  const { tabs, active: tab } = panes;
  const sidebarVisible = workspaceOpen && !!tab;
  const animations = slide?.animations ?? [];
  const animationTarget = selection.length === 1 && object?.kind !== 'unsupported' ? object : undefined;
  const activeAnimation =
    animationTarget &&
    (animations.find(({ id, target }) => id === selectedAnimationId && target === animationTarget.id) ??
      animations.find(({ target }) => target === animationTarget.id));
  const settingsAnimation = animations.find(({ id }) => id === animationSettings?.id);
  const linkTarget =
    selection.length === 1 && object && editable(object) && ['text', 'image', 'shape'].includes(object.kind)
      ? object
      : undefined;
  const selectedObjects = slide?.objects.filter((o) => selection.includes(o.id) && editable(o)) || [];
  const inkSelection = selectedObjects.filter((o): o is SlideObject & { stroke: Ink } => !!o.stroke);

  const textObject =
    selection.length === 1 && object?.kind === 'text' && editable(object) ? object : undefined;
  const cropImage =
    selection.length === 1 &&
    object?.kind === 'image' &&
    editable(object) &&
    object.asset &&
    project?.assets[object.asset]
      ? object
      : undefined;
  const shapeSelection = selectedObjects.filter((o) => o.kind === 'shape' && !o.stroke);
  const canGroup =
    selectedObjects.length > 1 &&
    selectedObjects.every(
      (o) =>
        ['text', 'shape', 'image'].includes(o.kind) &&
        !o.groupId &&
        !o.connector &&
        o.layoutPlaceholder === undefined &&
        !/<(?:[\w.-]+:)?ph\b/.test(o.sourceXml || ''),
    );
  const canUngroup = selectedObjects.some((o) => !!o.groupId);
  const mergeable =
    shapeSelection.length === selection.length &&
    shapeSelection.length >= 2 &&
    shapeSelection.length <= 8 &&
    shapeSelection.every(
      (shape) =>
        !shape.groupId &&
        !shape.deleteBlocked &&
        !isLine(shape) &&
        shape.w > 0 &&
        shape.h > 0 &&
        !animations.some(({ target, trigger }) => target === shape.id || trigger === shape.id) &&
        !slide?.objects.some((o) => o.connector?.from === shape.id || o.connector?.to === shape.id),
    );
  const canEditPoints =
    selection.length === 1 &&
    !!shapeSelection[0] &&
    !isLine(shapeSelection[0]) &&
    shapeSelection[0].w > 0 &&
    shapeSelection[0].h > 0;
  const canConnect =
    selectedObjects.length === 2 &&
    selectedObjects.every(
      (o) =>
        o.kind === 'shape' &&
        ['rect', 'roundRect', 'ellipse'].includes(o.geometry || 'rect') &&
        !o.customPaths &&
        !o.groupId &&
        !o.stroke,
    );
  const contextual: FormatTab | undefined =
    selection.length !== 1
      ? shapeSelection.length > 1
        ? 'Shape Format'
        : undefined
      : object?.kind === 'model'
        ? '3D Model'
        : object?.kind === 'image'
          ? 'Picture Format'
          : object?.kind === 'text' || object?.kind === 'shape'
            ? 'Shape Format'
            : undefined;
  const activeRibbon =
    preferences.hiddenTabs.some((tab) => tab === ribbon) ||
    (['3D Model', 'Picture Format', 'Shape Format'].includes(ribbon) && ribbon !== contextual)
      ? 'Home'
      : ribbon;
  const findMatches =
    query.trim() && deck
      ? deck.slides.flatMap((s, i) =>
          s.objects
            .filter((o) => o.kind === 'text' && o.text && textMatches(o.text, query, matchCase).length > 0)
            .map((o) => ({ object: o, index: i })),
        )
      : [];
  const slideView = (slide && slideViews[slide.id]) || fitView;
  const fitScale = deck
    ? Math.max(
        0.01,
        Math.min((viewport.w - (ruler ? 22 : 0)) / deck.width, (viewport.h - (ruler ? 22 : 0)) / deck.height),
      )
    : 1;
  const scale = fitScale * slideView.zoom;
  gestureZoom.current = slideView.zoom;
  function updateSlideView(id: string, change: Partial<typeof fitView>) {
    setSlideViews((views) => ({ ...views, [id]: { ...(views[id] || fitView), ...change } }));
  }
  function setZoom(value: number) {
    canvasAnchor.current = null;
    if (slide) updateSlideView(slide.id, { zoom: clampSlideZoom(value) });
  }
  function zoomBy(delta: number) {
    setZoom(slideView.zoom + delta);
  }
  function fitSlide() {
    canvasAnchor.current = null;
    if (slide) updateSlideView(slide.id, fitView);
    if (canvasArea.current) canvasArea.current.scrollTo(0, 0);
  }
  function keepCanvasPosition() {
    const canvas = canvasArea.current?.querySelector('.slide-canvas');
    if (!canvas || !slide) return;
    const { left, top } = canvas.getBoundingClientRect();
    canvasAnchor.current = { id: slide.id, cursor: { x: left, y: top }, fraction: { x: 0, y: 0 } };
  }
  function deselectCanvas() {
    setSelected(null);
    setOrbit(false);
    setEditPoints(undefined);
  }
  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      previewLocked ||
      event.button !== 2 ||
      !slide ||
      !(event.target instanceof HTMLElement || event.target instanceof SVGElement)
    )
      return;
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    panGesture.current = {
      pointer: event.pointerId,
      slideId: slide.id,
      target: event.target,
      start: point,
      last: point,
      move: { x: slideView.x, y: slideView.y },
      dragged: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function panSlide(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = panGesture.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!gesture.dragged) {
      if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) < 4) return;
      gesture.dragged = true;
      setPanning(true);
      setMenu(null);
    }
    const dx = point.x - gesture.last.x;
    const dy = point.y - gesture.last.y;
    gesture.last = point;
    gesture.axis = event.shiftKey ? (gesture.axis ?? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y')) : undefined;
    const factor = event.metaKey || event.ctrlKey || event.altKey ? 0.25 : 1;
    if (gesture.axis !== 'y') gesture.move.x += dx * factor;
    if (gesture.axis !== 'x') gesture.move.y += dy * factor;
    updateSlideView(gesture.slideId, { ...gesture.move });
  }
  function finishPan(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = panGesture.current;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    panGesture.current = null;
    setPanning(false);
    if (event.type !== 'pointerup' || gesture.dragged) return;
    const click = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      button: 2,
    });
    gesture.target.dispatchEvent(click);
    if (!click.defaultPrevented) openMenu(event, 'canvas');
  }
  function adopt(p: Project, fromRoom = false) {
    setPanes({ tabs: [] });
    pastePoint.current = undefined;
    const previous = current.current;
    if (!fromRoom) {
      roomClient.current?.close();
      if (roomOrigin.current && roomOrigin.current !== p) releaseProject(roomOrigin.current);
      roomOrigin.current = undefined;
    }
    if (previous && previous !== p && previous !== roomOrigin.current) releaseProject(previous);
    generation.current++;
    setClipboard([]);
    clipboardSlide.current = undefined;
    setFormatBrush(null);
    setAnimationBrush(null);
    setAnimationSettings(undefined);
    setAnimationPicker(undefined);
    setPendingTextures(null);
    current.current = p;
    setProject(p);
    history.current = new History(p.deck);
    setIndex(0);
    setSelected(null);
    setOrbit(false);
    setDrawTool('select');
    setView(preferences.initialView);
    setMenu(null);
    setInsertDialog(null);
    setSlideDialog(null);
    setSlideViews({});
    setToolsDialog(null);
    setReuseSource(null);
    reuseRequest.current++;
    setCollapsedSections([]);
    setDeletingSlide(null);
  }
  function connectRoom(type: 'create' | 'join', code?: string) {
    const source = current.current;
    if (!source) return;
    intendedRoom.current = type;
    roomClient.current ??= new RoomClient({
      onStatus: (status) => {
        setRoomStatus(status);
        if (status.error) setNotice(status.error);
      },
      onProject: (shared, kind, remote) => {
        const previous = current.current;
        if (kind === 'join' && intendedRoom.current === 'join') {
          roomOrigin.current = previous ?? undefined;
          adopt(shared, true);
          return;
        }
        const viewedSlide = previous?.deck.slides[indexRef.current]?.id;
        const nextIndex = shared.deck.slides.findIndex(({ id }) => id === viewedSlide);
        const position =
          nextIndex < 0 ? Math.min(indexRef.current, shared.deck.slides.length - 1) : nextIndex;
        if (kind === 'restore') history.current = new History(shared.deck);
        else if (remote && history.current)
          history.current.rebase((deck) => applyDeckPatch(deck, remote), shared.deck);
        else if (history.current) history.current.current = shared.deck;
        current.current = shared;
        setProjectState(shared);
        if (indexRef.current !== position) {
          indexRef.current = position;
          setIndex(position);
        }
        if (nextIndex < 0) {
          setSelected(null);
          setEditRequest(null);
          setOrbit(false);
        } else
          setSelection((ids) =>
            ids.filter((id) => shared.deck.slides[position].objects.some((object) => object.id === id)),
          );
      },
    });
    roomClient.current.open(type, source, code);
  }
  function leaveRoom(returnToPrevious = false) {
    roomClient.current?.close();
    const previous = roomOrigin.current;
    if (returnToPrevious && previous) adopt(previous);
    else if (previous) {
      releaseProject(previous);
      roomOrigin.current = undefined;
    }
    setShowRoom(false);
  }
  useEffect(() => {
    let canceled = false;
    (async () => {
      const recovered = preferences.localRecovery ? await restoreProject().catch(() => undefined) : undefined;
      const p = recovered || (await initialProject(true));
      if (canceled) {
        releaseProject(p);
        return;
      }
      adopt(p);
      if (recovered) setNotice('Recovered your last local session.');
      setBusy('');
    })().catch((e) => {
      setBusy('');
      setNotice(e.message);
    });
    return () => {
      canceled = true;
    };
  }, []);
  useEffect(() => {
    const area = canvasArea.current;
    if (!area) return;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(area);
      const size = area.getBoundingClientRect();
      const w = Math.max(0, size.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      const h = Math.max(0, size.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
      setViewport((previous) => (previous.w === w && previous.h === h ? previous : { w, h }));
    });
    observer.observe(area, { box: 'border-box' });
    return () => observer.disconnect();
  }, [view, slide?.id]);
  useEffect(() => {
    const area = canvasArea.current;
    const id = slide?.id;
    if (!area || !id || previewLocked || presenting !== null || busy) return;
    let pinchScale: number | undefined;
    type PinchEvent = Event & { scale: number; clientX?: number; clientY?: number };

    function zoomAt(factor: number, clientX?: number, clientY?: number) {
      const canvas = area?.querySelector('.slide-canvas');
      const zoom = clampSlideZoom(gestureZoom.current * factor);
      if (!id || !canvas || !Number.isFinite(zoom) || zoom === gestureZoom.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX ?? (rect.left + rect.right) / 2;
      const y = clientY ?? (rect.top + rect.bottom) / 2;
      if (rect.width && rect.height) {
        canvasAnchor.current = {
          id,
          cursor: { x, y },
          fraction: { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height },
        };
      }
      gestureZoom.current = zoom;
      setSlideViews((views) => ({ ...views, [id]: { ...(views[id] ?? fitView), zoom } }));
    }
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.shiftKey) return;
      event.preventDefault();
      if (pinchScale !== undefined) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? area.clientHeight : 1;
      const delta = event.deltaY || event.deltaX;
      if (delta) zoomAt(Math.exp(-delta * unit * 0.005), event.clientX, event.clientY);
    };
    const pinchStart = (event: Event) => {
      event.preventDefault();
      pinchScale = 1;
    };
    const pinchChange = (event: Event) => {
      if (pinchScale === undefined) return;
      event.preventDefault();
      const { scale, clientX, clientY } = event as PinchEvent;
      if (!(scale > 0)) return;
      zoomAt(scale / pinchScale, clientX, clientY);
      pinchScale = scale;
    };
    const pinchEnd = (event: Event) => {
      event.preventDefault();
      pinchScale = undefined;
    };
    area.addEventListener('wheel', wheel, { passive: false });
    area.addEventListener('gesturestart', pinchStart, { passive: false });
    area.addEventListener('gesturechange', pinchChange, { passive: false });
    area.addEventListener('gestureend', pinchEnd, { passive: false });
    return () => {
      area.removeEventListener('wheel', wheel);
      area.removeEventListener('gesturestart', pinchStart);
      area.removeEventListener('gesturechange', pinchChange);
      area.removeEventListener('gestureend', pinchEnd);
      canvasAnchor.current = null;
    };
  }, [view, slide?.id, previewLocked, presenting, busy]);
  useLayoutEffect(() => {
    const anchor = canvasAnchor.current;
    canvasAnchor.current = null;
    const area = canvasArea.current;
    const rect = area?.querySelector('.slide-canvas')?.getBoundingClientRect();
    if (!anchor || !area || !rect || anchor.id !== slide?.id) return;
    const dx = rect.left + rect.width * anchor.fraction.x - anchor.cursor.x;
    const dy = rect.top + rect.height * anchor.fraction.y - anchor.cursor.y;
    const left = area.scrollLeft;
    const top = area.scrollTop;
    area.scrollLeft = left + dx;
    area.scrollTop = top + dy;
    const x = dx + left - area.scrollLeft;
    const y = dy + top - area.scrollTop;
    if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5)
      updateSlideView(anchor.id, { x: slideView.x - x, y: slideView.y - y });
  }, [scale, slide?.id, slide?.objects]);
  useEffect(() => {
    if (!project) return;
    if (!preferences.localRecovery) {
      setSaved('Local recovery off');
      return;
    }
    setSaved('Saving locally…');
    let active = true;
    const timer = setTimeout(() => {
      const g = generation.current;
      savedQueue.current = savedQueue.current
        .catch(() => {})
        .then(() => (active && g === generation.current ? saveProject(project) : undefined))
        .then(() => {
          if (active && g === generation.current) setSaved('Saved on this device');
        })
        .catch(() => {
          if (active && g === generation.current) setSaved('Recovery unavailable — export to save');
        });
    }, 650);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [project, preferences.localRecovery]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const commit = useCallback((next: Deck) => {
    next = {
      ...next,
      slides: next.slides.map((slide, index) => {
        const text = String(index + 1);
        if (!slide.objects.some((object) => object.slideNumber && object.text !== text)) return slide;
        return {
          ...slide,
          dirty: true,
          objects: slide.objects.map((object) =>
            object.slideNumber && object.text !== text
              ? { ...object, text, changed: [...new Set([...object.changed, 'text'])] }
              : object,
          ),
        };
      }),
    };
    const previousSlides = new Map(current.current?.deck.slides.map((slide) => [slide.id, slide.objects]));
    next = {
      ...next,
      slides: next.slides.map((slide) => {
        const objects = refreshConnectors(slide.objects, previousSlides.get(slide.id) ?? slide.objects);
        return objects.some((object, index) => object !== slide.objects[index])
          ? { ...slide, objects, dirty: true }
          : slide;
      }),
    };
    history.current?.commit(next);
    setProject((p) => p && { ...p, deck: next });
  }, []);
  const patch = useCallback(
    (id: string, changes: Partial<SlideObject>) => {
      const p = current.current;
      if (!p) return;
      const next = structuredClone(p.deck);
      const s = next.slides[index];
      const o = s.objects.find((o) => o.id === id);
      if (!o || o.kind === 'unsupported' || (o.locked && !('locked' in changes))) return;
      if (o.kind === 'text' && !('fontSizeRanges' in changes)) {
        if ('fontSize' in changes) changes = { ...changes, fontSizeRanges: undefined };
        else if ('text' in changes && o.fontSizeRanges?.length) {
          changes = {
            ...changes,
            fontSizeRanges: remapFontSizeRanges(o.fontSizeRanges, o.text ?? '', changes.text ?? ''),
          };
        }
      }
      Object.assign(o, changes);
      o.changed = [...new Set([...o.changed, ...Object.keys(changes)])];
      s.dirty = true;
      commit(next);
    },
    [index, commit],
  );
  function changeModelZoom(id: string, direction?: number) {
    const o = current.current?.deck.slides[index]?.objects.find((object) => object.id === id);
    if (!o || o.kind !== 'model' || !editable(o)) return;
    const zoom = o.modelZoom ?? 100;
    const next = direction === undefined ? 100 : Math.min(200, Math.max(50, zoom + direction * 10));
    if (next !== zoom) patch(id, { modelZoom: next === 100 ? undefined : next });
  }
  function undo() {
    if (!history.current) return;
    const next = history.current.undo();
    setProject((p) => p && { ...p, deck: next });
    setIndex((i) => Math.min(i, next.slides.length - 1));
    setDeletingSlide(null);
    setSelected(null);
  }
  function redo() {
    if (!history.current) return;
    const next = history.current.redo();
    setProject((p) => p && { ...p, deck: next });
    setIndex((i) => Math.min(i, next.slides.length - 1));
    setSelected(null);
  }
  function addObjects(objects: SlideObject[], inspect = true) {
    const p = current.current;
    if (!p) return;
    const next = structuredClone(p.deck);
    next.slides[index].objects.push(...objects);
    next.slides[index].dirty = true;
    commit(next);
    setSelection(objects.map(({ id }) => id));
    if (inspect) openPane('object');
  }
  function add(object: SlideObject, inspect = true) {
    addObjects([object], inspect);
  }
  function selectSlide(next: number) {
    pastePoint.current = undefined;
    setEditPoints(undefined);
    setInkReplay(undefined);
    setRecognizedInk(undefined);
    indexRef.current = next;
    setIndex(next);
    setSelected(null);
    setOrbit(false);
    setEditRequest(null);
    setInsertDialog(null);
    setSlideDialog(null);
    setSelectedAnimationId(undefined);
    setAnimationSettings(undefined);
    setAnimationPicker(undefined);
    setCustomPath(null);
  }
  function saveAnimations(values: SlideAnimation[]) {
    if (!deck || !slide) return;
    commit({
      ...deck,
      slides: deck.slides.map((item) =>
        item === slide ? { ...item, dirty: true, animations: values } : item,
      ),
    });
  }
  function selectAnimation(animation: SlideAnimation) {
    setSelected(animation.target);
    setSelectedAnimationId(animation.id);
    openPane('animations');
    setOrbit(false);
  }
  function makeAnimationsEditable() {
    if (!deck || !slide || slide.animationsUnpreviewed || !animations.some(({ imported }) => imported))
      return;
    commit({
      ...deck,
      slides: deck.slides.map((item) =>
        item.id === slide.id
          ? {
              ...item,
              animations: animations.map((entry) => ({ ...entry, imported: undefined })),
              replaceAnimationTiming: true,
              dirty: true,
            }
          : item,
      ),
    });
    setNotice('PowerPoint effects can now be edited on this slide.');
  }
  function openAnimationSettings(entry: SlideAnimation, tab: AnimationSettingsTab) {
    if (entry.imported) return;
    selectAnimation(entry);
    setAnimationSettings({ id: entry.id, tab });
  }
  function launchAnimationPicker() {
    setRibbon('Animations');
    openPane('animations');
    setAnimationPicker(Date.now());
  }
  function chooseAnimation(effect: string, add: boolean, path?: Point[], target = animationTarget?.id) {
    if (!target) return;
    if (effect === 'path:0' && !path) {
      setView('normal');
      setEditRequest(null);
      setCustomPath({ target, add });
      return;
    }
    const previous =
      !add && activeAnimation?.target === target && !activeAnimation.imported ? activeAnimation : undefined;
    const definition = animationEffect(effect)!;
    const entry: SlideAnimation = {
      id: previous?.id ?? uid(),
      target,
      effect,
      path,
      start: previous?.start ?? 'click',
      delay: previous?.delay ?? 0,
      trigger: previous?.trigger,
      repeat: previous?.repeat,
      rewind: previous?.rewind,
      after: previous?.after,
      duration: definition.style === 'instant' ? 0.001 : definition.group === 'path' ? 2 : 0.5,
    };
    saveAnimations(
      previous ? animations.map((item) => (item.id === entry.id ? entry : item)) : [...animations, entry],
    );
    selectAnimation(entry);
  }
  function animateParagraphs() {
    if (!activeAnimation || activeAnimation.imported || !textObject?.text) return;
    const paragraphs = textObject.text.split('\n');
    const effects = paragraphs.map((_, i): SlideAnimation => ({
      ...activeAnimation,
      id: uid(),
      start: 'click',
      trigger: undefined,
      paragraphs: [i, i],
    }));
    saveAnimations(animations.flatMap((entry) => (entry.id === activeAnimation.id ? effects : [entry])));
    selectAnimation(effects[0]);
  }
  function updateAnimation(change: Partial<SlideAnimation>, id = activeAnimation?.id) {
    const entry = animations.find((animation) => animation.id === id && !animation.imported);
    if (!entry) return;
    const amended = { ...entry, ...change };
    amended.smoothStart = Math.min(amended.smoothStart ?? 0, amended.duration) || undefined;
    amended.smoothEnd =
      Math.min(amended.smoothEnd ?? 0, amended.duration - (amended.smoothStart ?? 0)) || undefined;
    saveAnimations(animations.map((animation) => (animation === entry ? amended : animation)));
  }
  function removeAnimation(id = activeAnimation?.id) {
    if (!animations.some((entry) => entry.id === id && !entry.imported)) return;
    saveAnimations(animations.filter((entry) => entry.id !== id));
    setSelectedAnimationId(undefined);
  }
  function moveAnimation(id: string, destination: string, after: boolean) {
    const entry = animations.find((item) => item.id === id);
    const target = animations.find((item) => item.id === destination);
    if (!entry || !target || entry === target || !canMoveEffect(animations, entry, target)) return;
    const values = animations.filter((item) => item !== entry);
    values.splice(values.indexOf(target) + Number(after), 0, entry);
    if (values.every((item, index) => item === animations[index])) return;
    saveAnimations(values);
    selectAnimation(entry);
  }
  function duplicateAnimation(entry: SlideAnimation) {
    if (entry.imported) return;
    const copy = { ...entry, id: uid() };
    const values = [...animations];
    values.splice(animations.indexOf(entry) + 1, 0, copy);
    saveAnimations(values);
    selectAnimation(copy);
  }
  function paintAnimations() {
    if (animationBrush) {
      setAnimationBrush(null);
      setNotice('');
      return;
    }
    if (!animationTarget) return;
    setAnimationBrush(animations.filter((entry) => entry.target === animationTarget.id && !entry.imported));
    setNotice('Click an object to apply these animations. Press Escape to cancel.');
  }
  function pickObject(id: string, extend: boolean, inspect = true, fromSelection = false) {
    const target = slide?.objects.find((o) => o.id === id);
    if (!target) return;
    if (animationBrush && !extend && target.kind !== 'unsupported') {
      if (animationBrush[0]?.target === id) return true;
      const copies = animationBrush.map((entry) => ({
        ...entry,
        id: uid(),
        target: id,
        trigger:
          entry.trigger === entry.target
            ? id
            : slide?.objects.some(({ id }) => id === entry.trigger)
              ? entry.trigger
              : undefined,
      }));
      saveAnimations([...animations, ...copies]);
      if (copies[0]) selectAnimation(copies[0]);
      setAnimationBrush(null);
      setNotice('Animations applied.');
      return true;
    }
    if (formatBrush && !extend) {
      if (target.kind !== formatBrush.kind || !editable(target) || target.stroke) {
        setNotice(
          `Select an editable ${formatBrush.kind === 'text' ? 'text box' : 'shape'} to apply the formatting.`,
        );
        return true;
      }
      setFormatBrush(null);
      setSelected(id);
      openPane('object');
      setNotice('Formatting applied.');
      patch(id, formatBrush.fields);
      return true;
    }
    const members = target.groupId
      ? slide!.objects.filter((o) => o.groupId === target.groupId && editable(o)).map(({ id }) => id)
      : [id];
    if (!extend) {
      if (id !== selected) setOrbit(false);
      setSelection(members);
    } else if (editable(target)) {
      setOrbit(false);
      setSelection((ids) =>
        ids.includes(id)
          ? ids.filter((id) => !members.includes(id))
          : [
              ...new Set([
                ...ids.filter((value) => slide?.objects.some((o) => o.id === value && editable(o))),
                ...members,
              ]),
            ],
      );
    }
    if (inspect) openPane('object', !sidebarVisible || (tab !== 'animations' && !fromSelection));
  }
  function paintFormat() {
    if (formatBrush) {
      setFormatBrush(null);
      setNotice('');
      return;
    }
    const shape = shapeSelection.length === 1 && selection.length === 1 ? shapeSelection[0] : undefined;
    if (textObject) {
      const format = textFormatKeys.map((key) => [key, textObject[key] ?? defaultTextFormat[key]]);
      setFormatBrush({ kind: 'text', fields: Object.fromEntries(format) });
      setNotice('Click a text box to apply its formatting. Press Escape to cancel.');
    } else if (shape) {
      setFormatBrush({ kind: 'shape', fields: { fill: shape.fill, outline: shape.outline } });
      setNotice('Click a shape to apply its formatting. Press Escape to cancel.');
    }
  }
  function mutateObjects(changes: Record<string, Partial<SlideObject>>) {
    const p = current.current;
    if (!p) return;
    let changed = false;
    const next = structuredClone(p.deck);
    const active = next.slides[index];
    for (const o of active.objects) {
      const update = changes[o.id];
      if (!update || !editable(o)) continue;
      const keys = (Object.keys(update) as (keyof SlideObject)[]).filter((key) => update[key] !== o[key]);
      if (!keys.length) continue;
      Object.assign(o, update);
      o.changed = [...new Set([...o.changed, ...keys])];
      changed = true;
    }
    if (changed) {
      active.dirty = true;
      commit(next);
    }
  }
  function moveGroup(ids: string[], delta: Point) {
    const items = current.current?.deck.slides[index].objects || [];
    mutateObjects(
      Object.fromEntries(
        items
          .filter((o) => ids.includes(o.id))
          .map((o) => [
            o.id,
            { x: Math.round((o.x + delta.x) * 100) / 100, y: Math.round((o.y + delta.y) * 100) / 100 },
          ]),
      ),
    );
  }
  function arrange(action: Arrange) {
    if (deck) mutateObjects(arrangeObjects(selectedObjects, deck.width, deck.height, action, alignToSlide));
  }
  function removeObjects(ids = selection) {
    if (!deck || !slide) return;
    const items = slide.objects.filter((o) => ids.includes(o.id) && editable(o));
    if (items.some((o) => o.deleteBlocked)) {
      setNotice('A preserved animation or connector references this object.');
      return;
    }
    if (!items.length) return;
    const next = structuredClone(deck);
    next.slides[index].objects = next.slides[index].objects.filter(
      (o) => !items.some((item) => item.id === o.id),
    );
    next.slides[index].animations = next.slides[index].animations
      ?.filter(({ target }) => !items.some(({ id }) => id === target))
      .map((entry) =>
        items.some(({ id }) => id === entry.trigger) ? { ...entry, trigger: undefined } : entry,
      );
    next.slides[index].dirty = true;
    commit(next);
    setSelection((ids) => ids.filter((id) => !items.some((o) => o.id === id)));
    setOrbit(false);
  }
  function removeObject() {
    removeObjects();
  }
  function storeObjectClipboard() {
    clipboardSlide.current = slide?.id;
    setClipboard(structuredClone(selectedObjects));
    const plainText = selectedObjects.map(({ text, name }) => text || name).join('\n');
    void navigator.clipboard?.writeText(plainText).catch(() => {});
  }
  function copyObject() {
    if (!selectedObjects.length) return;
    storeObjectClipboard();
    setNotice('Copied to the Forma clipboard.');
  }
  function cutObject() {
    if (!selectedObjects.length || selectedObjects.some((o) => o.deleteBlocked)) return;
    storeObjectClipboard();
    removeObject();
  }
  function pasteObject(items = clipboard, source = clipboardSlide.current, position?: Point) {
    if (!deck || !items.length) return;
    if (position) keepCanvasPosition();
    const { deck: next, copies } = pasteObjects(deck, index, items, source, position);
    commit(next);
    setSelection(copies.map((o) => o.id));
    setOrbit(false);
    setDrawTool('select');
    openPane('object');
  }
  function duplicateObject() {
    pasteObject(selectedObjects, slide?.id);
  }
  function addBlank() {
    insertSlide('blank');
  }
  function insertSlide(layout: string) {
    if (!deck) return;
    const next = insertBlankSlide(deck, index);
    const custom = deck.savedLayouts?.find(({ id }) => id === layout);
    const added = next.slides[index + 1];
    if (custom) {
      added.savedLayout = custom.id;
      added.objects = custom.placeholders.map((object) => ({ ...structuredClone(object), id: uid() }));
    } else added.objects = presetObjects(layout as SlideLayout, deck);
    commit(next);
    selectSlide(index + 1);
  }
  function saveCustomLayout(name: string) {
    if (!deck || !slide || !name.trim()) return;
    const source = slide.objects.filter(
      (object) => object.kind === 'text' && !object.hidden && !object.slideNumber,
    );
    if (!source.length) return;
    const layouts = deck.savedLayouts ?? [];
    const existing = layouts.find(
      (layout) => layout.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
    );
    const id = existing?.id ?? uid();
    const placeholders = source.map((item, index): SlideObject => ({
      ...newObject('text', deck),
      name: item.name,
      layoutPlaceholder: index + 1,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      rotation: item.rotation,
      text: item.text,
      fontSize: item.fontSize,
      fontFamily: item.fontFamily,
      bold: item.bold,
      color: item.color,
      fill: item.fill,
      alignment: item.alignment,
      textAnchor: item.textAnchor,
    }));
    commit({
      ...deck,
      savedLayouts: [
        ...layouts.filter((layout) => layout !== existing),
        { id, name: name.trim(), placeholders, dirty: true, part: existing?.part },
      ],
    });
    setToolsDialog(null);
    setNotice(`Saved ${name.trim()} to the New Slide menu.`);
  }
  function deleteSlideAt(position: number) {
    if (!deck || deck.slides.length <= 1) return;
    setDeletingSlide({ slide: deck.slides[position], index: position });
    commit({ ...deck, slides: deck.slides.filter((_, i) => i !== position) });
    selectSlide(Math.min(position, deck.slides.length - 2));
  }
  function deleteSlide() {
    deleteSlideAt(index);
  }
  function finishSlideDeletion(id: string) {
    setDeletingSlide((current) => (current?.slide.id === id ? null : current));
  }
  function duplicate(morph = true) {
    if (!deck) return;
    commit(duplicateSlide(deck, index, morph));
    selectSlide(index + 1);
    if (morph) openPane('transition');
    setNotice(
      morph ? 'Slide duplicated. Change the model pose, then preview the Morph.' : 'Slide duplicated.',
    );
  }
  function reorderSlide(from: number, to: number) {
    if (!deck || from === to || to < 0 || to >= deck.slides.length) return;
    const next = structuredClone(deck);
    const destination = next.slides[to];
    const [s] = next.slides.splice(from, 1);
    s.sectionAnchor = destination.sectionAnchor || destination.sourcePart || destination.part;
    s.sectionId = destination.sectionId;
    if (next.sections?.length) next.sectionsDirty = true;
    next.slides.splice(to, 0, s);
    commit(next);
    selectSlide(to);
  }
  function endSlideDrag() {
    dragSlide.current = null;
    setDropTarget(null);
  }
  function slideDragEvents(id: string, list: 'rail' | 'sorter') {
    function side(event: ReactDragEvent) {
      const bounds = event.currentTarget.getBoundingClientRect();
      return (
        list === 'rail'
          ? event.clientY < bounds.top + bounds.height / 2
          : event.clientX < bounds.left + bounds.width / 2
      )
        ? 'before'
        : 'after';
    }
    return {
      draggable: true,
      'data-drop': dropTarget?.id === id && dropTarget.list === list ? dropTarget.side : undefined,
      onDragStart: (event: ReactDragEvent) => {
        dragSlide.current = id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
      },
      onDragEnd: endSlideDrag,
      onDragOver: (event: ReactDragEvent) => {
        if (!dragSlide.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const edge = side(event);
        setDropTarget((previous) =>
          previous?.id === id && previous.side === edge && previous.list === list
            ? previous
            : { id, side: edge, list },
        );
      },
      onDragLeave: (event: ReactDragEvent) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setDropTarget((previous) => (previous?.id === id && previous.list === list ? null : previous));
      },
      onDrop: (event: ReactDragEvent) => {
        if (!dragSlide.current || !deck) return;
        event.preventDefault();
        event.stopPropagation();
        const from = deck.slides.findIndex((item) => item.id === dragSlide.current);
        const target = deck.slides.findIndex((item) => item.id === id);
        const slot = target + (side(event) === 'after' ? 1 : 0);
        endSlideDrag();
        if (from >= 0 && target >= 0) reorderSlide(from, slot > from ? slot - 1 : slot);
      },
    };
  }
  function combineShapes(command: MergeCommand) {
    if (!deck || !slide || !mergeable) return;
    try {
      const ordered = selection.map((id) => shapeSelection.find((o) => o.id === id)!);
      const merged = mergeShapes(ordered, command);
      if (!merged.length) {
        setNotice('The selected shapes have no area for this operation.');
        return;
      }
      const objects = slide.objects.filter(({ id }) => !selection.includes(id));
      objects.push(...merged);
      commit({
        ...deck,
        slides: deck.slides.map((item) => (item.id === slide.id ? { ...item, objects, dirty: true } : item)),
      });
      setSelection(merged.map(({ id }) => id));
    } catch (error) {
      setNotice(message(error));
    }
  }
  function toggleEditPoints() {
    if (!canEditPoints) return;
    const item = shapeSelection[0];
    if (editPoints === item.id) {
      setEditPoints(undefined);
      return;
    }
    if (!item.customPaths) patch(item.id, { customPaths: shapeRings(item) });
    setEditPoints(item.id);
  }
  function connectShapes() {
    if (!deck || !canConnect) return;
    const [from, to] = selection.map((id) => selectedObjects.find((o) => o.id === id)!);
    add({
      ...newObject('shape', deck),
      geometry: 'line',
      name: 'Straight Connector',
      fill: 'transparent',
      outline: { color: '#6345bd', width: 2, dash: 'solid' },
      ...connectorFrame(from, to).frame,
      connector: { from: from.id, to: to.id },
    });
  }
  function groupObjects(ungroup: boolean) {
    if (!deck || !slide || (ungroup ? !canUngroup : !canGroup)) return;
    const ids = new Set(selectedObjects.map(({ id }) => id));
    const groups = new Set(selectedObjects.map(({ groupId }) => groupId).filter(Boolean));
    const id = uid();
    let objects: SlideObject[];
    if (ungroup)
      objects = slide.objects.map((object) =>
        groups.has(object.groupId) ? { ...object, groupId: undefined } : object,
      );
    else {
      const last = slide.objects.reduce((at, object, index) => (ids.has(object.id) ? index : at), -1);
      const members = slide.objects
        .filter((object) => ids.has(object.id))
        .map((object) => ({ ...object, groupId: id }));
      objects = slide.objects.flatMap((object, index) =>
        index === last ? members : ids.has(object.id) ? [] : [object],
      );
    }
    commit({
      ...deck,
      slides: deck.slides.map((item) => (item.id === slide.id ? { ...item, objects, dirty: true } : item)),
    });
  }
  function layer(delta: number, objectsToMove = selectedObjects) {
    changeLayer(objectsToMove, delta);
  }
  function layerToEdge(front: boolean) {
    changeLayer(selectedObjects, front ? Infinity : -Infinity);
  }
  function changeLayer(objectsToMove: SlideObject[], delta: number) {
    if (!deck || !slide || !objectsToMove.length) return;
    const buckets = new Map<string, SlideObject[]>();
    const moving = new Set(objectsToMove.map((object) => object.groupId ?? object.id));
    for (const object of slide.objects) {
      const key = object.groupId ?? object.id;
      const members = buckets.get(key) ?? [];
      members.push(object);
      buckets.set(key, members);
    }
    let order = [...buckets.keys()];
    if (Number.isFinite(delta)) {
      const positions = order.map((_, index) => index);
      if (delta > 0) positions.reverse();
      for (const at of positions) {
        const to = at + delta;
        if (order[to] && moving.has(order[at]) && !moving.has(order[to]))
          [order[at], order[to]] = [order[to], order[at]];
      }
    } else {
      const chosen = order.filter((key) => moving.has(key));
      const rest = order.filter((key) => !moving.has(key));
      order = delta > 0 ? [...rest, ...chosen] : [...chosen, ...rest];
    }
    const objects = order.flatMap((key) => buckets.get(key)!);
    if (objects.every((object, i) => object === slide.objects[i])) return;
    commit({
      ...deck,
      slides: deck.slides.map((item) => (item.id === slide.id ? { ...item, objects, dirty: true } : item)),
    });
  }
  function setShapeStyle(fill?: string, outline?: Partial<Outline> | ((base: Outline) => Partial<Outline>)) {
    mutateObjects(
      Object.fromEntries(
        shapeSelection.map((o) => {
          const base: Outline = { color: '#6345bd', width: 2, dash: 'solid', ...o.outline };
          return [
            o.id,
            {
              ...(fill !== undefined && { fill }),
              ...(outline && {
                outline: { ...base, ...(typeof outline === 'function' ? outline(base) : outline) },
              }),
            },
          ];
        }),
      ),
    );
  }
  function changeBackground(color: string, allSlides = false, paint?: BackgroundPaint) {
    if (!deck) return;
    const next = structuredClone(deck);
    const slides = allSlides ? next.slides : [next.slides[index]];
    for (const slide of slides) {
      slide.background = paint ? backgroundFallback(paint) : color;
      slide.backgroundPaint = paint;
      slide.backgroundDirty = true;
      slide.dirty = true;
    }
    commit(next);
  }
  async function changeBackgroundFromDialog(
    color: string,
    allSlides: boolean,
    paint?: BackgroundPaint,
    image?: File,
  ) {
    if (!image) {
      changeBackground(color, allSlides, paint);
      return;
    }
    const before = current.current;
    try {
      if (!['image/jpeg', 'image/png'].includes(image.type)) throw new Error('Choose a PNG or JPEG picture.');
      const bitmap = await createImageBitmap(image);
      bitmap.close();
      const bytes = new Uint8Array(await image.arrayBuffer());
      if (before !== current.current || !before) return;
      const asset = uid();
      setProject(
        (project) =>
          project && { ...project, assets: { ...project.assets, [asset]: makeAsset(bytes, image.type) } },
      );
      changeBackground(color, allSlides, { kind: 'image', asset });
    } catch (error) {
      setNotice(message(error));
    }
  }
  async function changeMaster(footer: string, file: File | undefined, removeLogo: boolean) {
    const before = current.current;
    if (!before || !deck) return;
    setNotice('');
    setBusy('Updating the master…');
    try {
      let logo = removeLogo ? undefined : deck.masterObjects?.find((item) => item.name === masterLogoName);
      if (file) {
        if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choose a PNG or JPEG logo.');
        const bitmap = await createImageBitmap(file);
        const height = Math.min(deck.height * 0.07, (deck.width * 0.18 * bitmap.height) / bitmap.width);
        const width = (height * bitmap.width) / bitmap.height;
        bitmap.close();
        const resource = new Uint8Array(await file.arrayBuffer());
        if (current.current !== before) return;
        const asset = uid();
        logo = {
          ...newObject('image', deck),
          name: masterLogoName,
          asset,
          locked: true,
          x: deck.width * 0.96 - width,
          y: deck.height * 0.04,
          w: width,
          h: height,
        };
        setProject((p) => p && { ...p, assets: { ...p.assets, [asset]: makeAsset(resource, file.type) } });
      }
      const objects = [
        ...(logo ? [logo] : []),
        ...(footer
          ? [
              {
                ...newObject('text', deck),
                name: masterFooterName,
                locked: true,
                text: footer,
                x: deck.width * 0.04,
                y: deck.height * 0.93,
                w: deck.width * 0.9,
                h: deck.height * 0.05,
                fontSize: Math.min(16, deck.height * 0.026),
                fontFamily: deck.theme?.body,
              },
            ]
          : []),
      ];
      commit({
        ...deck,
        masterObjects: objects,
        masterDirty: true,
        slides: deck.slides.map((slide) => ({
          ...slide,
          masterObjects: slide.masterGraphicsHidden ? undefined : objects,
        })),
      });
      setToolsDialog(null);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy('');
    }
  }
  function replaceAcrossDeck(font: boolean) {
    if (!deck || !query.trim() || (font && !replaceWith.trim())) return;
    let count = 0;
    const slides = deck.slides.map((item) => {
      const objects = item.objects.map((object) => {
        const next = font
          ? replaceSlideFont(object, query.trim(), replaceWith.trim())
          : replaceSlideText(object, query, replaceWith, matchCase);
        if (next !== object) count++;
        return next;
      });
      return objects.some((object, i) => object !== item.objects[i])
        ? { ...item, objects, dirty: true }
        : item;
    });
    if (count) commit({ ...deck, slides });
    setReplaceStatus(
      count ? `Updated ${count} text ${count === 1 ? 'box' : 'boxes'}.` : 'No editable matching text.',
    );
  }
  function changeTheme(theme: SlideTheme) {
    if (!deck) return;
    const previous = deck.theme;
    commit({
      ...deck,
      theme,
      themeDirty: true,
      slides: deck.slides.map((slide) => ({
        ...slide,
        objects: slide.objects.map((object) => {
          const shape =
            object.fillThemeAccent && !object.changed.includes('fill')
              ? { ...object, fill: theme.accent }
              : object;
          if (!shape.textFlow) return shape;
          const { major, minor } = shape.textFlow.themeFonts;
          return {
            ...shape,
            textFlow: {
              ...shape.textFlow,
              themeFonts: {
                major: major === previous?.heading ? theme.heading : major,
                minor: minor === previous?.body ? theme.body : minor,
              },
            },
          };
        }),
      })),
    });
  }
  function sectionName(name: string, rename: boolean) {
    if (!deck || !slide || !name.trim()) return;
    const next = structuredClone(deck);
    next.sections ??= [];
    if (rename && slide.sectionId) {
      const section = next.sections.find(({ id }) => id === slide.sectionId);
      if (section) section.name = name.trim();
    } else {
      const id = '{' + uid().toUpperCase() + '}';
      if (index > 0 && !next.slides[0].sectionId) {
        const defaultId = '{' + uid().toUpperCase() + '}';
        next.sections.unshift({ id: defaultId, name: 'Default Section' });
        for (const preceding of next.slides) {
          if (preceding.sectionId) break;
          preceding.sectionId = defaultId;
        }
      }
      for (let i = index; i < next.slides.length; i++) {
        if (i > index && next.slides[i].sectionId !== slide.sectionId && next.slides[i].sectionId) break;
        next.slides[i].sectionId = id;
      }
      next.sections.push({ id, name: name.trim() });
      next.sections = [...new Set(next.slides.map((slide) => slide.sectionId))].flatMap((id) =>
        next.sections!.filter((section) => section.id === id),
      );
    }
    next.sectionsDirty = true;
    commit(next);
  }
  function removeSection() {
    if (!deck || !slide?.sectionId) return;
    const id = slide.sectionId;
    const sections = (deck.sections || []).filter((section) => section.id !== id);
    const first = deck.slides.findIndex((slide) => slide.sectionId === id);
    const replacement =
      deck.slides[first - 1]?.sectionId ?? deck.slides.find((slide) => slide.sectionId !== id)?.sectionId;
    const slides = deck.slides.map((slide) =>
      slide.sectionId === id ? { ...slide, sectionId: replacement } : slide,
    );
    commit({ ...deck, sections, slides, sectionsDirty: true });
  }
  function moveSection(direction: number) {
    if (!deck || !slide?.sectionId || !deck.sections?.length) return;
    const sections = [...deck.sections];
    const from = sections.findIndex(({ id }) => id === slide.sectionId);
    const to = from + direction;
    if (from < 0 || !sections[to]) return;
    [sections[from], sections[to]] = [sections[to], sections[from]];
    const slides = [
      ...deck.slides.filter((slide) => !slide.sectionId),
      ...sections.flatMap(({ id }) => deck.slides.filter((slide) => slide.sectionId === id)),
    ];
    commit({ ...deck, sections, slides, sectionsDirty: true });
    selectSlide(slides.findIndex(({ id }) => id === slide.id));
  }
  function closeReuse() {
    if (busy) return;
    reuseRequest.current++;
    setReuseSource(null);
    setToolsDialog(null);
  }
  async function loadReuse(file: File) {
    const request = ++reuseRequest.current;
    setBusy('Reading slides…');
    setNotice('');
    try {
      if (file.size > 150 * 1024 * 1024) throw new Error('Please use a presentation smaller than 150 MB.');
      const source = await importPptx(new Uint8Array(await file.arrayBuffer()), file.name);
      if (request === reuseRequest.current) setReuseSource(source);
      else releaseProject(source);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy('');
    }
  }
  async function addReusedSlides(positions: number[]) {
    if (!project || !reuseSource) return;
    setBusy('Inserting selected slides…');
    setNotice('');
    try {
      const updated = await reuseSlides(project, reuseSource, positions, index);
      if (current.current !== project) {
        for (const [id, asset] of Object.entries(updated.assets))
          if (!project.assets[id]) URL.revokeObjectURL(asset.url);
        return;
      }
      setProject((before) => before && { ...before, original: updated.original, assets: updated.assets });
      commit(updated.deck);
      selectSlide(index + 1);
      setReuseSource(null);
      setToolsDialog(null);
      setNotice(`Inserted ${positions.length} ${positions.length === 1 ? 'slide' : 'slides'}.`);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy('');
    }
  }
  function applyLayout(layout: SlideLayout) {
    if (!deck || !slide) return;
    const items = presetObjects(layout, deck);
    if (!items.length) return;
    const objects = [...slide.objects];
    const placed = new Set<string>();
    for (const item of items) {
      const match = objects.findIndex(
        (o) =>
          !placed.has(o.id) &&
          editable(o) &&
          o.kind === item.kind &&
          o.name.replace(/\s+\d+$/, '').toLowerCase() === item.name.toLowerCase(),
      );
      if (match < 0) objects.push(item);
      else {
        const existing = objects[match];
        placed.add(existing.id);
        objects[match] = {
          ...existing,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          changed: [...new Set([...existing.changed, 'x', 'y', 'w', 'h'])],
        };
      }
    }
    commit({
      ...deck,
      slides: deck.slides.map((s) => (s.id === slide.id ? { ...s, objects, dirty: true } : s)),
    });
  }
  function toggleHiddenSlide() {
    if (!deck || !slide) return;
    commit({
      ...deck,
      slides: deck.slides.map((item) =>
        item.id === slide.id ? { ...item, hidden: !item.hidden, dirty: true } : item,
      ),
    });
  }
  function useDrawTool(tool: DrawTool) {
    setOrbit(false);
    setEditRequest(null);
    setDrawTool(tool);
  }
  function addStroke(points: Point[]) {
    if (!deck) return;
    add(
      {
        ...newObject('shape', deck),
        name:
          pen.kind === 'highlighter'
            ? 'Highlighter stroke'
            : pen.kind === 'pencil'
              ? 'Pencil stroke'
              : 'Ink stroke',
        ...inkFrame(points, { color: pen.color, width: pen.width, opacity: pen.opacity }),
        fill: 'transparent',
      },
      false,
    );
    setSelected(null);
  }
  function lassoInk(points: Point[], extend: boolean) {
    const ids =
      slide?.objects
        .filter(
          (o) => o.stroke && editable(o) && lassoContains(slideInkPoints({ ...o, stroke: o.stroke }), points),
        )
        .map(({ id }) => id) ?? [];
    setSelection((prior) => (extend ? [...new Set([...prior, ...ids])] : ids));
    useDrawTool('select');
  }
  function eraseStrokes(points: Point[]) {
    if (!deck || !slide) return;
    const whole = eraser === 'stroke';
    const radius = eraserRadius[eraser];
    const samples = eraserSamples(points, radius);
    const removed = new Set<string>();
    let changed = false;
    const objects = slide.objects.flatMap((object) => {
      if (!object.stroke || !editable(object)) return [object];
      const fragments = eraseInk(
        slideInkPoints({ ...object, stroke: object.stroke }),
        samples,
        radius + object.stroke.width / 2,
        whole,
      );
      if (!fragments || (!fragments.length && object.deleteBlocked)) return [object];
      changed = true;
      if (!fragments.length) removed.add(object.id);
      return fragments.map((fragment, i): SlideObject => ({
        ...object,
        ...(i !== 0 && { id: uid(), sourceXml: undefined, sourcePart: undefined, deleteBlocked: undefined }),
        ...inkFrame(fragment, object.stroke!),
        rotation: 0,
        flipH: false,
        flipV: false,
        changed: [
          ...new Set([...object.changed, 'stroke', 'x', 'y', 'w', 'h', 'rotation', 'flipH', 'flipV']),
        ],
      }));
    });
    if (!changed) return;
    const animations = slide.animations
      ?.filter(({ target }) => !removed.has(target))
      .map((effect) =>
        effect.trigger && removed.has(effect.trigger) ? { ...effect, trigger: undefined } : effect,
      );
    commit({
      ...deck,
      slides: deck.slides.map((item) =>
        item === slide ? { ...item, objects, animations, dirty: true } : item,
      ),
    });
    setSelection((ids) => ids.filter((id) => !removed.has(id)));
  }
  function changePen(value: Partial<InkStyle>) {
    setPens((items) => items.map((item) => (item.id === pen.id ? { ...item, ...value } : item)));
  }
  function addPen(kind: PenKind) {
    const count = pens.filter((item) => item.kind === kind).length;
    const name = { pen: 'Pen', pencil: 'Pencil', highlighter: 'Highlighter' }[kind] + ' ' + (count + 1);
    const id = uid();
    setPens((items) => [...items, { id, name, kind, ...penDefaults[kind] }]);
    setPenId(id);
    useDrawTool('pen');
  }
  function formatInk(changes: Partial<InkStyle>) {
    mutateObjects(
      Object.fromEntries(inkSelection.map(({ id, stroke }) => [id, { stroke: { ...stroke, ...changes } }])),
    );
  }
  function convertInk() {
    const changes = Object.fromEntries(
      inkSelection.flatMap((item) => {
        const shape = inkToShape(item);
        return shape ? [[item.id, shape]] : [];
      }),
    );
    if (!Object.keys(changes).length) {
      setNotice('Draw a straight line or a closed rectangle, oval, or triangle, then select the stroke.');
      return;
    }
    mutateObjects(changes);
    useDrawTool('select');
  }
  async function convertHandwriting(math: boolean) {
    if (!slide || !inkSelection.length) return;
    const before = current.current;
    const selection = slide.objects.filter(
      (object): object is SlideObject & { stroke: Ink } =>
        !!object.stroke && inkSelection.some((ink) => ink.id === object.id),
    );
    setBusy('Recognizing handwriting…');
    try {
      const text = await recognizeInk(selection.map(slideInkPoints));
      if (before !== current.current) return;
      setRecognizedInk({ text, math, ids: selection.map(({ id }) => id), slideId: slide.id });
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy('');
    }
  }
  function insertRecognizedInk(text: string) {
    if (!recognizedInk || !deck || slide?.id !== recognizedInk.slideId || !text.trim()) return;
    const objects = slide.objects.filter(({ id }) => recognizedInk.ids.includes(id));
    if (!objects.length) return;
    const x = Math.min(...objects.map(({ x }) => x));
    const y = Math.min(...objects.map(({ y }) => y));
    add({
      ...newObject('text', deck),
      x,
      y,
      text,
      name: recognizedInk.math ? 'Handwritten Equation' : 'Handwritten Text',
      fontFamily: recognizedInk.math ? 'Cambria Math' : deck.theme?.body,
      w: Math.max(200, ...objects.map((object) => object.x + object.w - x)),
    });
    setRecognizedInk(undefined);
    setDrawTool('select');
  }
  function insertShape(geometry: Geometry) {
    if (!deck) return;
    setDrawTool('select');
    add({
      ...newObject('shape', deck),
      ...(deck.themeDirty && deck.theme && geometry !== 'line'
        ? { fillThemeAccent: true, fill: deck.theme.accent }
        : {}),
      geometry,
      name: shapes.find((item) => item[0] === geometry)![1],
      ...(geometry === 'line' && {
        h: deck.height * 0.16,
        fill: 'transparent',
        outline: { color: '#6345bd', width: 3, dash: 'solid' },
      }),
    });
  }
  function insertText() {
    if (!deck) return;
    setDrawTool('select');
    add(newObject('text', deck));
  }
  function createTextAt(point: Point) {
    if (!deck) return;
    pastePoint.current = undefined;
    keepCanvasPosition();
    const box = newObject('text', deck);
    const inside = point.x >= 0 && point.x < deck.width && point.y >= 0 && point.y < deck.height;
    const x = inside ? Math.min(point.x, deck.width - 24) : point.x;
    const y = inside ? Math.min(point.y, deck.height - 24) : point.y;
    add({ ...box, x, y, w: inside ? Math.min(box.w, deck.width - x) : box.w, text: '' });
    setEditRequest({ id: box.id, token: performance.now(), kind: 'text' });
  }
  function startTextEdit() {
    if (!textObject || textObject.slideNumber) return;
    setView('normal');
    setDrawTool('select');
    setEditRequest({ id: textObject.id, token: performance.now(), kind: 'text' });
  }
  function editInsertData(id: string) {
    const item = slide?.objects.find((object) => object.id === id);
    if (!item || !editable(item)) return;
    if (item.table) setInsertDialog({ type: 'table', objectId: id, data: item.table });
    if (item.chart) setInsertDialog({ type: 'chart', objectId: id, data: item.chart });
  }
  function placeTable(table: TableData) {
    if (!deck) return;
    const w = Math.min(deck.width * 0.78, Math.max(deck.width * 0.28, table.cells[0].length * 122));
    const h = Math.min(deck.height * 0.73, Math.max(70, table.cells.length * 46));
    add({
      ...newObject('table', deck),
      name: 'Table',
      table,
      x: (deck.width - w) / 2,
      y: (deck.height - h) / 2,
      w,
      h,
    });
  }
  function addEquation(value: string) {
    if (!deck) return;
    add({
      ...newObject('text', deck),
      name: 'Equation',
      text: value,
      fontSize: 34,
      fontFamily: 'Cambria Math',
      w: deck.width * 0.68,
      x: deck.width * 0.16,
    });
  }
  function addSlideNumber() {
    if (!deck || slide?.objects.some((item) => item.slideNumber)) return;
    add(pageDetail('number', String(index + 1), deck));
  }
  function saveInsertion(result: InsertResult) {
    if (!deck || !slide) return;
    if (result.type !== 'comment-resolve') setInsertDialog(null);
    switch (result.type) {
      case 'table':
        if (result.objectId) patch(result.objectId, { table: result.data });
        else placeTable(result.data);
        break;
      case 'chart': {
        const w = deck.width * 0.55,
          h = deck.height * 0.55;
        if (result.objectId) patch(result.objectId, { chart: result.data });
        else
          add({
            ...newObject('chart', deck),
            name: 'Chart',
            chart: result.data,
            x: (deck.width - w) / 2,
            y: (deck.height - h) / 2,
            w,
            h,
          });
        break;
      }
      case 'link':
        if (result.objectId) patch(result.objectId, { link: result.link });
        else
          add({
            ...newObject('text', deck),
            name: result.label,
            text: result.label,
            link: result.link,
            fontSize: 28,
            underline: true,
            color: '#6345bd',
            w: deck.width * 0.52,
            x: deck.width * 0.24,
          });
        break;
      case 'equation':
        addEquation(result.text);
        break;
      case 'comment': {
        const comment = {
          id: uid(),
          author: result.author,
          text: result.text,
          replyTo: result.replyTo,
          date: new Date().toISOString(),
        };
        commit({
          ...deck,
          slides: deck.slides.map((item) =>
            item.id === slide.id
              ? {
                  ...item,
                  dirty: true,
                  commentThreadsDirty: !!result.replyTo || item.commentThreadsDirty,
                  comments: [...(item.comments || []), comment],
                }
              : item,
          ),
        });
        setNotice('Comment added to this slide.');
        break;
      }
      case 'comment-resolve':
        commit({
          ...deck,
          slides: deck.slides.map((item) =>
            item.id === slide.id
              ? {
                  ...item,
                  dirty: true,
                  commentThreadsDirty: true,
                  comments: item.comments?.map((comment) =>
                    comment.id === result.id ? { ...comment, resolved: result.resolved } : comment,
                  ),
                }
              : item,
          ),
        });
        break;
      case 'footer': {
        const values = [
          ['header', result.header],
          ['footer', result.footer],
          ['date', result.date ? formatDate('short', preferences.dateLanguage) : ''],
          ['number', result.number ? String(index + 1) : ''],
        ] as const;
        if (values.every(([, value]) => !value)) break;
        commit({
          ...deck,
          slides: deck.slides.map((item, position) => {
            if (!result.allSlides && item.id !== slide.id) return item;
            const objects = [...item.objects];
            for (const [kind, text] of values) {
              if (!text) continue;
              const detail = pageDetail(kind, kind === 'number' ? String(position + 1) : text, deck);
              const existing = objects.findIndex((object) => object.altText === detail.altText);
              if (existing < 0) objects.push(detail);
              else
                objects[existing] = {
                  ...objects[existing],
                  text: detail.text,
                  changed: [...new Set([...objects[existing].changed, 'text'])],
                };
            }
            return { ...item, objects, dirty: true };
          }),
        });
        setNotice(
          result.allSlides ? 'Header and footer applied to all slides.' : 'Header and footer applied.',
        );
        break;
      }
    }
  }
  function runInsert(command: InsertCommand, value?: string) {
    if (!deck || !slide) return;
    if (command !== 'new') setView('normal');
    setDrawTool('select');
    setOrbit(false);
    switch (command) {
      case 'new':
        insertSlide(value ?? 'blank');
        break;
      case 'reuse':
        setNotice('');
        setToolsDialog('reuse');
        break;
      case 'duplicate':
        duplicate(false);
        break;
      case 'table': {
        const [columns, rows] = value!.split('x').map(Number);
        placeTable(emptyTable(columns, rows));
        break;
      }
      case 'customTable':
        setInsertDialog({ type: 'table' });
        break;
      case 'pasteTable':
        setInsertDialog({ type: 'table-paste' });
        break;
      case 'picture':
        imgInput.current?.click();
        break;
      case 'capture':
      case 'clip':
        void screenshot(command === 'clip');
        break;
      case 'pastePicture':
        void pastePicture();
        break;
      case 'model':
        modelInput.current?.click();
        break;
      case 'folder':
        modelFolderInput.current?.click();
        break;
      case 'shape':
        insertShape(value as Geometry);
        break;
      case 'diagram':
        addObjects(diagramObjects(value!, deck));
        break;
      case 'chart':
        setInsertDialog({
          type: 'chart',
          data: {
            type: value as ChartData['type'],
            points: [
              { label: 'Category A', value: 24 },
              { label: 'Category B', value: 16 },
              { label: 'Category C', value: 32 },
            ],
          },
        });
        break;
      case 'zoom':
      case 'online':
      case 'link':
      case 'action': {
        const target = command === 'link' || command === 'action' ? linkTarget : undefined;
        setInsertDialog({ type: 'link', entry: command, link: target?.link, objectId: target?.id });
        break;
      }
      case 'text':
        insertText();
        break;
      case 'footer':
        setInsertDialog({ type: 'footer' });
        break;
      case 'comment':
        setInsertDialog({ type: 'comment', author: preferences.author });
        break;
      case 'date':
        add(pageDetail('date', formatDate(value!, preferences.dateLanguage), deck));
        break;
      case 'number':
        addSlideNumber();
        break;
      case 'wordArt':
        add({
          ...newObject('text', deck),
          name: 'WordArt',
          text: 'Your headline',
          w: deck.width * 0.62,
          x: deck.width * 0.19,
          fontSize: 56,
          alignment: 'center',
          italic: value === 'serif',
          bold: value !== 'serif',
          fontFamily: value === 'serif' ? 'Georgia' : 'Arial',
          color: value === 'bold' ? '#252438' : '#6345bd',
        });
        break;
      case 'symbol':
        if (textObject && !textObject.slideNumber)
          patch(textObject.id, { text: (textObject.text || '') + value });
        else add({ ...newObject('text', deck), name: 'Symbol', text: value, w: 100 });
        break;
      case 'equation':
        if (value === 'custom') setInsertDialog({ type: 'equation' });
        else if (value && equationText[value]) addEquation(equationText[value]);
        break;
      case 'video':
        videoInput.current?.click();
        break;
      case 'audio':
        if (value === 'record') setMediaDialog('record');
        else audioInput.current?.click();
        break;
    }
  }
  function startPictureCrop() {
    if (!cropImage) return;
    setView('normal');
    setDrawTool('select');
    setEditRequest({ id: cropImage.id, token: performance.now(), kind: 'crop' });
  }
  function startOrbit() {
    setDrawTool('select');
    setOrbit(true);
    openPane('object');
    setRibbon('3D Model');
  }
  function openMenu(event: ReactMouseEvent, area: Menu['area'], target?: string | number, position?: Point) {
    event.preventDefault();
    event.stopPropagation();
    if (area === 'slide' && typeof target === 'number') selectSlide(target);
    if (area === 'object' && typeof target === 'string' && !selection.includes(target))
      pickObject(target, false);
    if (area === 'canvas') {
      pastePoint.current = undefined;
      deselectCanvas();
    }
    const node = event.currentTarget as HTMLElement;
    const focus =
      area === 'slide' && node.classList.contains('slide-row')
        ? node.querySelector<HTMLElement>('.slide-thumb-button') || node
        : area === 'canvas'
          ? (canvasArea.current?.querySelector<HTMLElement>('.slide-canvas') ?? node)
          : node;
    setMenu({ area, x: event.clientX, y: event.clientY, position, returnFocus: focus });
  }
  function openSlideActions(index: number, button: HTMLElement) {
    const rect = button.getBoundingClientRect();
    selectSlide(index);
    setMenu({ area: 'slide', x: rect.left, y: rect.bottom + 4, returnFocus: button });
  }
  function closeMenu() {
    menu?.returnFocus?.focus({ preventScroll: true });
    setMenu(null);
  }
  async function newPresentation() {
    setBusy('Creating presentation…');
    try {
      await savedQueue.current;
      await clearSavedProject();
      adopt(await initialProject(false));
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy('');
    }
  }
  function updateTransition(
    settings: Partial<
      Pick<Slide, 'transition' | 'transitionOption' | 'duration' | 'advanceOnClick' | 'advanceAfter'>
    >,
    allSlides = false,
  ) {
    if (!deck || !slide) return;
    commit({
      ...deck,
      slides: deck.slides.map((item) =>
        !allSlides && item.id !== slide.id
          ? item
          : {
              ...item,
              ...settings,
              dirty: true,
              transitionDirty: true,
              warnings: item.warnings.filter(
                (warning) => warning !== 'This transition is preserved but is not previewed.',
              ),
            },
      ),
    });
  }
  function chooseTransition(value: Transition) {
    if (value === 'preserve' || value === slide?.transition) return;
    updateTransition({ transition: value, transitionOption: defaultTransitionOption(value) });
  }
  function applyTransitionToAll() {
    if (!slide || slide.transition === 'preserve') return;
    const { transition, transitionOption, duration, advanceOnClick, advanceAfter } = slide;
    updateTransition(
      {
        transition,
        transitionOption: transitionOption ?? defaultTransitionOption(transition),
        duration,
        advanceOnClick: advanceOnClick ?? true,
        advanceAfter: advanceAfter ?? null,
      },
      true,
    );
  }
  async function importFile(file: File) {
    setBusy('Reading your presentation…');
    try {
      if (file.size > 150 * 1024 * 1024) throw new Error('Please use a presentation smaller than 150 MB.');
      const p = await importPptx(new Uint8Array(await file.arrayBuffer()), file.name);
      const check = exportModelWarnings(p.deck, p.assets);
      adopt(p);
      setNotice(
        check.models.length || check.crowdedSlides.length
          ? 'Presentation imported. Some slides may run slowly in PowerPoint. Review 3D performance when you export.'
          : 'Presentation imported. Your original file is unchanged.',
      );
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy('');
    }
  }
  async function modelFiles(files: File[], previous?: SlideObject, pending: File[] = []) {
    if (!project || !deck) return;
    const oldKey = previous?.asset;
    const savedSource = oldKey ? project.modelSources?.[oldKey] : undefined;
    if (oldKey && !savedSource && !files.some((file) => isModelInput(file.name))) {
      setPendingTextures({ asset: oldKey, files });
      setNotice('Texture folder selected. Choose the original model to match its material references.');
      return;
    }
    setBusy(previous ? 'Matching textures to the model…' : 'Preparing your 3D model…');
    let asset: ReturnType<typeof makeAsset> | undefined;
    try {
      const companions = [
        ...(savedSource || []),
        ...pending.map((file) => ({ path: file.webkitRelativePath || file.name, file })),
      ];
      const imported = await importModelFiles(files, companions);
      const complex = modelPerformanceWarnings(inspectModel(imported.bytes)).length > 0;
      asset = makeAsset(imported.bytes, 'model/gltf-binary');
      const model = await loadModel(asset);
      const key = uid();
      const o: SlideObject = {
        ...(previous || newObject('model', deck)),
        name: previous?.name || imported.name,
        warning: imported.missing.length
          ? `Missing model resources: ${imported.missing.join(', ')}.`
          : undefined,
        asset: key,
        modelCenter: model.center,
        modelSize: model.size,
      };
      const preview = await renderModelPng(o, asset, model);
      const pk = uid();
      o.preview = pk;
      o.modelPreviewKey = modelPreviewKey(o);
      const p = current.current!;
      current.current = {
        ...p,
        assets: { ...p.assets, [key]: asset, [pk]: makeAsset(preview, 'image/png') },
        modelSources: imported.source ? { ...p.modelSources, [key]: imported.source } : p.modelSources,
      };
      setProject(current.current);
      if (oldKey) {
        const next = structuredClone(p.deck);
        for (const slide of next.slides) {
          for (const target of slide.objects.filter(
            (object) => object.kind === 'model' && !object.locked && object.asset === oldKey,
          )) {
            Object.assign(target, {
              asset: key,
              preview: pk,
              modelPreviewKey: o.modelPreviewKey,
              modelCenter: model.center,
              modelSize: model.size,
              warning: o.warning,
              changed: [...new Set([...target.changed, 'asset'])],
            });
            slide.dirty = true;
          }
        }
        commit(next);
        setPendingTextures(null);
      } else {
        add(o);
        setDrawTool('select');
        setOrbit(true);
      }
      setNotice(
        (imported.missing.length
          ? `Model has ${imported.missing.length} unresolved resources. Select the model to see the filenames or add another folder.`
          : oldKey
            ? 'Textures applied to the model and its linked slide copies.'
            : 'Native 3D model inserted. Drag inside the model to turn it.') +
          (complex ? ' This model may run slowly in PowerPoint. Review its details before export.' : ''),
      );
    } catch (e) {
      if (asset) URL.revokeObjectURL(asset.url);
      setNotice(message(e));
    } finally {
      setBusy('');
    }
  }
  async function imageFile(input: File | File[], crop = false, position?: Point) {
    const targetId = current.current?.deck.slides[indexRef.current]?.id;
    if (!targetId) return;
    const projectGeneration = generation.current;
    const pictures = [];
    const errors: string[] = [];
    for (const file of Array.isArray(input) ? input : [input]) {
      try {
        const { width, height, original, compatible } = await preparePicture(file);
        const bytes = new Uint8Array(await compatible.arrayBuffer());
        const source =
          original !== compatible
            ? { bytes: new Uint8Array(await original.arrayBuffer()), mime: original.type }
            : undefined;
        pictures.push({ file, width, height, bytes, mime: compatible.type, source });
      } catch (error) {
        errors.push(message(error));
      }
    }
    const open = current.current;
    if (!open || projectGeneration !== generation.current || !open.deck.slides.some((s) => s.id === targetId))
      return;
    if (errors.length) setNotice(errors.join(' '));
    if (!pictures.length) return;
    const assets = { ...open.assets };
    const objects = pictures.map(({ file, width, height, bytes, mime, source }, offset) => {
      const asset = uid();
      assets[asset] = makeAsset(bytes, mime);
      const pictureSourceAsset = source && uid();
      if (source && pictureSourceAsset) assets[pictureSourceAsset] = makeAsset(source.bytes, source.mime);
      const o = newObject('image', open.deck);
      const fit = Math.min(1, (open.deck.width * 0.5) / width, (open.deck.height * 0.65) / height);
      return {
        ...o,
        name: file.name,
        pictureFileName: file.name,
        pictureSourceAsset,
        asset,
        x: (position?.x ?? o.x) + offset * 12,
        y: (position?.y ?? o.y) + offset * 12,
        w: width * fit,
        h: height * fit,
      };
    });
    if (position && open.deck.slides[indexRef.current]?.id === targetId) keepCanvasPosition();
    setProject({ ...open, assets });
    commit({
      ...open.deck,
      slides: open.deck.slides.map((s) =>
        s.id === targetId ? { ...s, dirty: true, objects: [...s.objects, ...objects] } : s,
      ),
    });
    if (open.deck.slides[indexRef.current]?.id === targetId) {
      setSelection(objects.map(({ id }) => id));
      openPane('object');
      setDrawTool('select');
      if (crop) setEditRequest({ id: objects[0].id, token: performance.now(), kind: 'crop' });
    }
  }
  function originalPictureKey(object: SlideObject) {
    const assets = current.current?.assets;
    return [object.pictureSourceAsset, object.originalPicture, object.asset].find(
      (key) => key && assets?.[key],
    );
  }
  async function savePicture(object: SlideObject, format?: PictureDownload) {
    const key = format ? object.asset : originalPictureKey(object);
    if (!key) return;
    const asset = current.current?.assets[key];
    if (!asset) return;
    const name = object.pictureFileName ?? (key?.startsWith('ppt/') ? key.split('/').at(-1)! : object.name);
    try {
      await downloadPicture(asset, name, format);
    } catch (error) {
      setNotice(message(error));
    }
  }
  async function removePictureBackground(tolerance: number) {
    if (!cropImage?.asset || !project) return;
    const before = current.current;
    const input = cropImage.originalPicture || cropImage.asset;
    setBusy('Removing picture background…');
    setNotice('');
    try {
      const bytes = await removeEdgeBackground(project.assets[input], tolerance);
      if (current.current !== before) return;
      const asset = uid();
      setProject(
        (project) =>
          project && { ...project, assets: { ...project.assets, [asset]: makeAsset(bytes, 'image/png') } },
      );
      patch(cropImage.id, { asset, originalPicture: input });
      setToolsDialog(null);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy('');
    }
  }
  async function screenshot(crop: boolean) {
    setBusy('Capturing a screenshot…');
    try {
      await imageFile(await captureScreenshot(), crop);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) setNotice(message(error));
    } finally {
      setBusy('');
    }
  }
  async function pastePicture() {
    try {
      const items = await navigator.clipboard.read();
      const pictures: File[] = [];
      for (const item of items) {
        const type = item.types.find((mime) => mime.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        pictures.push(new File([blob], `Clipboard.${pictureExtension(type)}`, { type }));
      }
      if (pictures.length) await imageFile(pictures);
      else setNotice('The clipboard does not contain a picture.');
    } catch {
      setNotice('The clipboard could not be read. Use Pictures → Picture from File.');
    }
  }
  async function insertMedia(file: File, media: 'video' | 'audio', recording?: 'narration' | 'camera') {
    if (!deck || !project) return;
    const targetId = slide?.id;
    const generationAtStart = generation.current;
    const extension = file.name.split('.').at(-1)?.toLowerCase() || '';
    const mime =
      media === 'video'
        ? extension === 'mp4'
          ? 'video/mp4'
          : ''
        : ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' } as Record<string, string>)[extension];
    if (!mime || !file.size || file.size > 50 * 1024 * 1024) {
      setNotice(
        media === 'video'
          ? 'Choose an MP4 video under 50 MB.'
          : 'Choose an MP3, M4A, or WAV file under 50 MB.',
      );
      return;
    }
    setBusy('Preparing media…');
    let asset: ReturnType<typeof makeAsset> | undefined;
    try {
      asset = makeAsset(new Uint8Array(await file.arrayBuffer()), mime);
      const { png, ratio } = await mediaPoster(media, asset.url);
      const key = uid(),
        poster = uid();
      const fraction = recording ? (media === 'video' ? 0.25 : 0.12) : media === 'video' ? 0.62 : 0.28;
      const w = Math.min(deck.width * fraction, deck.height * 0.62 * ratio);
      const h = w / ratio;
      const posterBytes = new Uint8Array(await png.arrayBuffer());
      const open = current.current;
      if (
        !open ||
        generationAtStart !== generation.current ||
        !open.deck.slides.some((item) => item.id === targetId)
      ) {
        URL.revokeObjectURL(asset.url);
        return;
      }
      const updated = {
        ...open,
        assets: {
          ...open.assets,
          [key]: asset,
          [poster]: makeAsset(posterBytes, 'image/png'),
        },
      };
      current.current = updated;
      setProject(updated);
      const item: SlideObject = {
        ...newObject('media', deck),
        media,
        name: recording === 'narration' ? 'Slide narration' : file.name,
        mediaPlayback: recording ? { autoplay: true, volume: 1 } : undefined,
        asset: key,
        preview: poster,
        x: recording ? deck.width * 0.96 - w : (deck.width - w) / 2,
        y: recording ? deck.height * 0.96 - h : (deck.height - h) / 2,
        w,
        h,
      };
      commit({
        ...open.deck,
        slides: open.deck.slides.map((slide) =>
          slide.id === targetId ? { ...slide, dirty: true, objects: [...slide.objects, item] } : slide,
        ),
      });
      if (open.deck.slides[indexRef.current]?.id === targetId) {
        setSelected(item.id);
        openPane('object');
      }
    } catch (error) {
      if (asset) URL.revokeObjectURL(asset.url);
      setNotice(message(error));
    } finally {
      setBusy('');
    }
  }
  function download(format: 'pptx' | 'potx' = 'pptx') {
    if (!project || !deck) return;
    const check = exportModelWarnings(deck, project.assets);
    if (check.models.length || check.crowdedSlides.length) {
      setExportReview({ check, format });
    } else {
      void writeExport(undefined, format);
    }
  }
  async function prepareCompactExport() {
    if (!project || !deck || !exportReview) return;
    const { check, format } = exportReview;
    setExportReview(null);
    setBusy('Reducing 3D textures…');
    try {
      const optimized = new Map<string, Uint8Array>();
      const assets = { ...project.assets };
      let savings = 0;
      for (const { key, stats } of check.models) {
        if (!stats.canShrinkTextures) continue;
        const asset = assets[key];
        const bytes = await shrinkModelTextures(asset.bytes);
        if (bytes === asset.bytes) continue;
        optimized.set(key, bytes);
        assets[key] = { ...asset, bytes };
        savings += asset.bytes.length - bytes.length;
      }
      setExportReview({ check: exportModelWarnings(deck, assets), format, optimized, savings });
    } catch (e) {
      setExportReview({ check, format });
      setNotice(message(e));
    } finally {
      setBusy('');
    }
  }
  async function exportShows() {
    if (!project || !deck) return;
    setBusy('Building the slide show ZIP…');
    try {
      const archive = new JSZip();
      const byId = new Map(deck.slides.map((slide) => [slide.id, slide]));
      for (const [i, show] of (deck.customShows ?? []).entries()) {
        const slides: Slide[] = [];
        const included = new Set<string>();
        let source = deck;
        for (const id of show.slideIds) {
          const original = byId.get(id);
          if (!original) continue;
          if (!included.has(id)) {
            included.add(id);
            slides.push(original);
          } else {
            const index = source.slides.findIndex((slide) => slide.id === id);
            source = duplicateSlide(source, index, false);
            slides.push(source.slides[index + 1]);
          }
        }
        if (!slides.length) continue;
        const name = show.name.replace(/[^\p{L}\p{N} _.-]/gu, '_');
        archive.file(
          `${i + 1}-${name || 'Show'}.pptx`,
          await exportPptx(
            project,
            { ...deck, slides, customShows: [], customShowsDirty: true },
            renderModelPng,
          ),
        );
      }
      if (!Object.keys(archive.files).length) throw new Error('Save a custom show with at least one slide.');
      const blob = await archive.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${deck.name || 'Presentation'} shows.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setAutomationOpen(false);
      setNotice('Custom slide shows exported.');
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy('');
    }
  }
  async function writeExport(optimized?: ReadonlyMap<string, Uint8Array>, format: 'pptx' | 'potx' = 'pptx') {
    if (!project || !deck) return;
    setExportReview(null);
    setBusy('Building your PowerPoint file…');
    try {
      const bytes = await exportPptx(project, deck, renderModelPng, optimized, format);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], {
          type:
            'application/vnd.openxmlformats-officedocument.presentationml.' +
            (format === 'potx' ? 'template' : 'presentation'),
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deck.name || 'Presentation'}${optimized?.size ? ' (smaller textures)' : ''}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        format === 'potx'
          ? 'PowerPoint template exported.'
          : optimized?.size
            ? 'PPTX exported with smaller 3D textures.'
            : 'PPTX exported.',
      );
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy('');
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (previewLocked) {
        if (e.key === 'Escape' && editorPreview === 'transition') setEditorPreview(null);
        if (e.key === 'Escape' && customPath) setCustomPath(null);
        return;
      }
      if (
        presenting !== null ||
        busy ||
        menu ||
        find ||
        insertDialog ||
        slideDialog ||
        document.querySelector('dialog[open]') ||
        exportReview ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) ||
        (e.target as HTMLElement).isContentEditable
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      const thumbnail = (e.target as HTMLElement).closest<HTMLElement>('.slide-thumb-button, .sorter-card');
      const focusedSlideId = thumbnail?.closest<HTMLElement>('[data-slide-id]')?.dataset.slideId;
      const focusedSlide = focusedSlideId
        ? (deck?.slides.findIndex((item) => item.id === focusedSlideId) ?? -1)
        : -1;
      if (deck && thumbnail && focusedSlide >= 0 && mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const earlier = e.key === 'ArrowUp';
        const to = e.shiftKey ? (earlier ? 0 : deck.slides.length - 1) : focusedSlide + (earlier ? -1 : 1);
        reorderSlide(focusedSlide, to);
        requestAnimationFrame(() => thumbnail.focus({ preventScroll: true }));
        return;
      }
      if (mod && ['z', 'y', 's', 'd', 'c', 'o', 'x', 'f', 'm'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const k = e.key.toLowerCase();
        if (k === 'z') e.shiftKey ? redo() : undo();
        if (k === 'y') redo();
        if (k === 's') void download();
        if (k === 'd') duplicateObject();
        if (k === 'c') copyObject();
        if (k === 'o') pptInput.current?.click();
        if (k === 'x') cutObject();
        if (k === 'f') {
          setReplaceMode('find');
          setFind(true);
        }
        if (k === 'm') addBlank();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (
          (e.target as HTMLElement).closest('.animation-pane, .context-menu, .sidebar-tabbar, .sidebar-resize')
        )
          return;
        e.preventDefault();
        if (focusedSlide >= 0) deleteSlideAt(focusedSlide);
        else removeObject();
      }
      if (e.key === 'Escape') {
        pastePoint.current = undefined;
        if (drawTool !== 'select') {
          setDrawTool('select');
          return;
        }
        if (animationBrush) {
          setAnimationBrush(null);
          setNotice('');
          return;
        }
        if (formatBrush) {
          setFormatBrush(null);
          setNotice('');
          return;
        }
        setEditPoints(undefined);
        setSelected(null);
        setOrbit(false);
      }
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
        !(e.target as HTMLElement).closest('.ribbon, .context-menu, button')
      ) {
        const canvasFocused = (e.target as HTMLElement).matches('.slide-canvas');
        if (!selectedObjects.length && !canvasFocused) return;
        e.preventDefault();
        const n = (mod ? 1 : 10) / (selectedObjects.length && !e.shiftKey ? scale : 1);
        const delta = {
          x: e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0,
          y: e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0,
        };
        if (!selectedObjects.length) {
          if (slide) updateSlideView(slide.id, { x: slideView.x + delta.x, y: slideView.y + delta.y });
        } else if (e.shiftKey) {
          mutateObjects(
            Object.fromEntries(
              selectedObjects.map((item) => [
                item.id,
                {
                  w: delta.x ? Math.max(24, item.w + delta.x) : item.w,
                  h: delta.y ? Math.max(24, item.h - delta.y) : item.h,
                },
              ]),
            ),
          );
        } else if (e.altKey && delta.x) {
          mutateObjects(
            Object.fromEntries(
              selectedObjects.map((item) => [
                item.id,
                {
                  rotation: item.rotation + Math.sign(delta.x) * 15,
                },
              ]),
            ),
          );
        } else moveGroup(selection, delta);
      }
      if (e.key === 'F5') {
        e.preventDefault();
        setPresenting(e.shiftKey ? index : 0);
      }
    };
    const paste = (event: ClipboardEvent) => {
      if (
        event.defaultPrevented ||
        presenting !== null ||
        previewLocked ||
        busy ||
        menu ||
        document.querySelector('dialog[open]') ||
        (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable], .crop-mode'))
      )
        return;
      const files = Array.from(event.clipboardData?.files ?? []).filter(pictureType);
      event.preventDefault();
      const location = pastePoint.current;
      const position =
        location &&
        location.id === slide?.id &&
        event.target instanceof Element &&
        event.target.matches('.slide-canvas')
          ? location.point
          : undefined;
      pastePoint.current = undefined;
      if (files.length) void imageFile(files, false, position);
      else pasteObject(clipboard, clipboardSlide.current, position);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('paste', paste);
    };
  });
  const message = (e: unknown) =>
    e instanceof Error ? e.message : 'Something went wrong. Please try again.';
  const locked = !object || object.locked || object.kind === 'unsupported';
  const modelAsset = object?.kind === 'model' && object.asset ? project?.assets[object.asset] : undefined;
  const selectedModelStats = modelAsset && inspectModel(modelAsset.bytes);
  const selectedModelWarnings = selectedModelStats ? modelPerformanceWarnings(selectedModelStats) : [];
  const issues =
    deck?.slides.flatMap((s, i) => [
      ...s.warnings.map((w) => ({ slide: i + 1, text: w })),
      ...s.objects.filter((o) => o.warning).map((o) => ({ slide: i + 1, text: `${o.name}: ${o.warning}` })),
    ]) || [];
  const canDeleteObjects = selectedObjects.length > 0 && !selectedObjects.some((o) => o.deleteBlocked);
  const canDeleteSlide = (deck?.slides.length || 0) > 1;
  const pictureKey = object?.kind === 'image' && originalPictureKey(object);
  const originalPictureAsset = pictureKey ? project?.assets[pictureKey] : undefined;
  const sectionItems: MenuItem[] = [
    {
      label: 'Add Section Here',
      action: () => {
        setSectionRename(false);
        setToolsDialog('section');
      },
      group: 'Sections',
    },
    {
      label: 'Rename Section…',
      action: () => {
        setSectionRename(true);
        setToolsDialog('section');
      },
      disabled: !slide?.sectionId,
      group: 'Sections',
    },
    {
      label: 'Move Section Up',
      action: () => moveSection(-1),
      disabled: (deck?.sections?.findIndex(({ id }) => id === slide?.sectionId) ?? -1) <= 0,
      group: 'Sections',
    },
    {
      label: 'Move Section Down',
      action: () => moveSection(1),
      disabled: !slide?.sectionId || deck?.sections?.at(-1)?.id === slide.sectionId,
      group: 'Sections',
    },
    {
      label: 'Remove Section',
      action: removeSection,
      disabled: !slide?.sectionId,
      group: 'Sections',
    },
  ];
  const menuItems: MenuItem[] =
    menu?.area === 'slide'
      ? [
          { label: 'New Slide', action: addBlank },
          { label: 'Duplicate Slide', action: () => duplicate(false) },
          { label: 'Duplicate + Morph', action: () => duplicate(true) },
          { label: slide?.hidden ? 'Unhide Slide' : 'Hide Slide', action: toggleHiddenSlide },
          { label: 'Move Up', action: () => reorderSlide(index, index - 1), disabled: index === 0 },
          {
            label: 'Move Down',
            action: () => reorderSlide(index, index + 1),
            disabled: index >= (deck?.slides.length || 1) - 1,
          },
          { label: 'Delete Slide', action: deleteSlide, disabled: !canDeleteSlide },
          ...sectionItems,
        ]
      : menu?.area === 'object'
        ? [
            ...(textObject && !textObject.slideNumber ? [{ label: 'Edit Text', action: startTextEdit }] : []),
            ...(object && !locked && (object.table || object.chart)
              ? [
                  {
                    label: object.table ? 'Edit Table Cells' : 'Edit Chart Data',
                    action: () => editInsertData(object.id),
                  },
                ]
              : []),
            ...(linkTarget
              ? [{ label: linkTarget.link ? 'Edit Link' : 'Add Link', action: () => runInsert('link') }]
              : []),
            ...(object?.media && object.asset
              ? [{ label: 'Media Playback…', action: () => setMediaDialog('playback') }]
              : []),
            ...(cropImage ? [{ label: 'Crop Picture', action: startPictureCrop }] : []),
            ...(object?.kind === 'image' && originalPictureAsset && selection.length === 1
              ? [
                  {
                    label: 'Download Original',
                    detail: pictureFormatName(originalPictureAsset.mime),
                    group: 'Picture download',
                    action: () => void savePicture(object),
                    submenu: {
                      label: 'Convert picture',
                      items: pictureFormats.map(([label, format]) => ({
                        label: `Convert and Download ${label}`,
                        action: () => void savePicture(object, format),
                      })),
                    },
                  },
                ]
              : []),
            ...(object?.kind === 'model' && editable(object) && selection.length === 1
              ? [{ label: 'Rotate in 3D', action: startOrbit }]
              : []),
            ...(animationTarget
              ? [
                  {
                    label: 'Add Animation…',
                    action: launchAnimationPicker,
                    preview: <Plus size={15} />,
                    group: 'Animation',
                  },
                  ...(activeAnimation
                    ? [
                        {
                          label: 'Play From Animation',
                          action: () => togglePreview('animation', activeAnimation.id),
                          preview: <Play size={15} />,
                          group: 'Animation',
                        },
                        {
                          label: 'Animation Settings…',
                          action: () => openAnimationSettings(activeAnimation, 'effect'),
                          preview: <Settings2 size={15} />,
                          group: 'Animation',
                          disabled: activeAnimation.imported,
                        },
                      ]
                    : []),
                ]
              : []),
            { label: 'Edit Points', action: toggleEditPoints, disabled: !canEditPoints, group: 'Shapes' },
            { label: 'Connect Shapes', action: connectShapes, disabled: !canConnect, group: 'Shapes' },
            { label: 'Group', action: () => groupObjects(false), disabled: !canGroup, group: 'Arrange' },
            { label: 'Ungroup', action: () => groupObjects(true), disabled: !canUngroup, group: 'Arrange' },
            {
              label: 'Object Spacing…',
              action: () => setToolsDialog('spacing'),
              disabled: selectedObjects.length < 2,
              group: 'Arrange',
            },
            { label: 'Cut', action: cutObject, disabled: !canDeleteObjects },
            { label: 'Copy', action: copyObject, disabled: !selectedObjects.length },
            { label: 'Duplicate', action: duplicateObject, disabled: !selectedObjects.length },
            { label: 'Bring Forward', action: () => layer(1), disabled: !selectedObjects.length },
            { label: 'Send Backward', action: () => layer(-1), disabled: !selectedObjects.length },
            { label: 'Delete', action: removeObject, disabled: !canDeleteObjects },
          ]
        : [
            {
              label: 'Paste',
              action: () => pasteObject(clipboard, clipboardSlide.current, menu?.position),
              disabled: !clipboard.length,
              preview: <ClipboardPaste size={16} />,
            },
            ...sectionItems,
            { label: 'New Slide', action: addBlank, preview: <Plus size={16} />, group: 'Slide' },
            {
              label: 'Duplicate Slide',
              action: () => duplicate(false),
              preview: <Copy size={16} />,
              group: 'Slide',
            },
            {
              label: 'Delete Slide',
              action: deleteSlide,
              disabled: !canDeleteSlide,
              preview: <Trash2 size={16} />,
              group: 'Slide',
            },
            {
              label: slide?.hidden ? 'Unhide Slide' : 'Hide Slide',
              action: toggleHiddenSlide,
              preview: slide?.hidden ? <Eye size={16} /> : <EyeOff size={16} />,
              group: 'Slide',
            },
            {
              label: 'Slide Layout…',
              action: () => setSlideDialog('layout'),
              preview: <LayoutTemplate size={16} />,
              group: 'Slide',
            },
            {
              label: 'Format Background…',
              action: () => setSlideDialog('background'),
              preview: <PaintBucket size={16} />,
              group: 'Slide',
            },
            {
              label: 'Ruler',
              action: () => setRuler(!ruler),
              checked: ruler,
              preview: <Ruler size={16} />,
              group: 'View',
            },
            {
              label: 'Guides',
              action: () => setGuides(!guides),
              checked: guides,
              preview: <AlignCenter size={16} />,
              group: 'View',
            },
            {
              label: 'Gridlines',
              action: () => setGrid(!grid),
              checked: grid,
              preview: <Grid2X2 size={16} />,
              group: 'View',
            },
            {
              label: 'Zoom…',
              action: () => setSlideDialog('zoom'),
              preview: <Search size={16} />,
              group: 'View',
            },
            {
              label: 'Slide Show from Here',
              action: () => setPresenting(index),
              preview: <Play size={16} />,
              group: 'View',
            },
            {
              label: 'New Comment',
              action: () => runInsert('comment'),
              preview: <MessageSquarePlus size={16} />,
              group: 'Insert',
            },
            { label: 'Insert Text Box', action: insertText, preview: <Type size={16} />, group: 'Insert' },
            {
              label: 'Insert Rectangle',
              action: () => insertShape('rect'),
              preview: <Square size={16} />,
              group: 'Insert',
            },
            {
              label: 'Insert Picture',
              action: () => imgInput.current?.click(),
              preview: <ImagePlus size={16} />,
              group: 'Insert',
            },
            {
              label: 'Insert 3D Model',
              action: () => modelInput.current?.click(),
              preview: <Box size={16} />,
              group: 'Insert',
            },
          ];
  function selectRibbon(next: RibbonTab) {
    setRibbon(next);
    setDrawTool('select');
    if (next === 'Draw') setView('normal');
    if (next === 'Transitions') openPane('transition');
    if (next === 'Animations') {
      openPane('animations');
    }
    if (next === 'Shape Format' || next === 'Picture Format' || next === '3D Model') openPane('object');
  }
  function renderRibbon() {
    if (editorPreview)
      return (
        <RibbonGroup name="Preview">
          <Tool icon={<Square size={15} />} active onClick={() => togglePreview(editorPreview)}>
            Stop Preview
          </Tool>
          <span className="ribbon-note" role="status">
            {editorPreview === 'animation' ? 'Animation preview' : 'Transition preview'}
          </span>
        </RibbonGroup>
      );
    if (customPath)
      return (
        <RibbonGroup name="Custom Path">
          <Tool icon={<X size={15} />} onClick={() => setCustomPath(null)}>
            Cancel Path
          </Tool>
        </RibbonGroup>
      );
    const fmt = (fields: Partial<SlideObject>) => {
      if (textObject) patch(textObject.id, fields);
    };
    const applyFontSize = (newSize: (size: number) => number, preset = false) => {
      if (!textObject) return;
      const editor = textEditor.current;
      const saved = preset ? fontPresetSelection.current : null;
      if (preset) fontPresetSelection.current = null;
      const snapshot =
        editor?.id === textObject.id
          ? editor.read()
          : saved?.id === textObject.id
            ? saved.snapshot
            : undefined;
      if (!snapshot?.selection) {
        fmt({ fontSize: newSize(textObject.fontSize || 28) });
        return;
      }
      const {
        text,
        selection: { start, end },
      } = snapshot;
      const ranges = remapFontSizeRanges(textObject.fontSizeRanges, textObject.text ?? '', text) ?? [];
      const textChange = text === textObject.text ? {} : { text };
      if (editor?.id === textObject.id) editor.restore({ start, end });
      else
        setEditRequest({
          id: textObject.id,
          token: performance.now(),
          kind: 'text',
          selection: { start, end },
        });
      if (start === end) {
        fmt({ ...textChange, fontSize: newSize(textObject.fontSize || 28) });
        return;
      }
      const snapshotObject = {
        ...textObject,
        ...textChange,
        changed: [...textObject.changed, ...(textChange.text !== undefined ? ['text'] : [])],
        fontSizeRanges: ranges,
      };
      fmt({ ...textChange, fontSizeRanges: resizeTextSelection(snapshotObject, start, end, newSize) });
    };
    const changeFontSize = (delta: number) =>
      applyFontSize((size) => Math.max(8, Math.min(200, size + delta)));
    const preserveTextFocus = (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (textEditor.current?.id === textObject?.id) event.preventDefault();
    };
    const alignmentControls = (
      <>
        <Dropdown
          label="Align and distribute"
          caption="Align & distribute"
          choices={arrangeCommands}
          previews={objectAlignmentPreviews}
          disabled={!selectedObjects.length}
          disabledChoices={selectedObjects.length < 3 ? ['horizontal', 'vertical'] : []}
          onChange={arrange}
        />
        <Dropdown
          label="Alignment reference"
          previews={alignmentReferencePreviews}
          value={alignToSlide || selectedObjects.length < 2 ? 'slide' : 'selection'}
          choices={[
            ['selection', 'Align selected objects'],
            ['slide', 'Align to slide'],
          ]}
          disabled={selectedObjects.length < 2}
          onChange={(scope) => setAlignToSlide(scope === 'slide')}
        />
      </>
    );
    const arrangeGroup = (
      <RibbonGroup name="Arrange">
        {alignmentControls}
        <Tool
          title="Bring Forward"
          icon={<ArrowUp size={16} />}
          disabled={!selectedObjects.length}
          onClick={() => layer(1)}
        />
        <Tool
          title="Send Backward"
          icon={<ArrowDown size={16} />}
          disabled={!selectedObjects.length}
          onClick={() => layer(-1)}
        />
      </RibbonGroup>
    );
    switch (activeRibbon) {
      case 'File':
        return (
          <>
            <RibbonGroup name="Presentation">
              <Tool icon={<FilePlus2 size={18} />} onClick={newPresentation}>
                New blank presentation
              </Tool>
              <Tool
                title="Import PowerPoint"
                icon={<FolderOpen size={18} />}
                onClick={() => pptInput.current?.click()}
              >
                Open PPTX
              </Tool>
              <Tool
                title="Download PowerPoint file"
                icon={<Download size={17} />}
                disabled={!deck}
                onClick={() => download()}
              >
                Export PPTX
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Automation">
              <Tool
                icon={<Zap size={16} />}
                disabled={!deck || !!busy}
                onClick={() => setAutomationOpen(true)}
              >
                Automation
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Output">
              <Tool
                icon={<Download size={16} />}
                disabled={!deck || !!busy}
                onClick={() => setPrintOpen(true)}
              >
                Print / Save PDF
              </Tool>
              <Tool
                icon={<LayoutTemplate size={16} />}
                disabled={!deck || !!busy}
                onClick={() => download('potx')}
              >
                Save Template
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Recovery">
              <span className="ribbon-note">{saved}</span>
            </RibbonGroup>
            <RibbonGroup name="Settings">
              <Tool icon={<Settings2 size={17} />} onClick={() => setOptions('General')}>
                Options
              </Tool>
            </RibbonGroup>
          </>
        );
      case 'Home':
        return (
          <>
            <RibbonGroup name="Clipboard">
              <Tool
                icon={<ClipboardPaste size={18} />}
                disabled={!clipboard.length}
                onClick={() => pasteObject()}
              >
                Paste
              </Tool>
              <div className="home-rows">
                <div className="home-row">
                  <Tool
                    title="Cut objects"
                    icon={<Scissors size={15} />}
                    disabled={!canDeleteObjects}
                    onClick={cutObject}
                  />
                  <Tool
                    title="Copy objects"
                    icon={<Copy size={15} />}
                    disabled={!selectedObjects.length}
                    onClick={copyObject}
                  />
                </div>
                <Tool
                  icon={<Paintbrush size={15} />}
                  active={!!formatBrush}
                  disabled={
                    !formatBrush && !textObject && !(shapeSelection.length === 1 && selection.length === 1)
                  }
                  onClick={paintFormat}
                >
                  Format Painter
                </Tool>
              </div>
            </RibbonGroup>
            <RibbonGroup name="Slides">
              <div className="home-rows">
                <div className="home-row">
                  <Tool icon={<Plus size={16} />} disabled={!deck} onClick={addBlank}>
                    New Slide
                  </Tool>
                  <Tool
                    title="Duplicate Slide"
                    icon={<Copy size={15} />}
                    disabled={!deck}
                    onClick={() => duplicate(false)}
                  />
                  <Tool
                    title="Delete Slide"
                    icon={<Trash2 size={15} />}
                    disabled={!canDeleteSlide}
                    onClick={deleteSlide}
                  />
                </div>
                <Dropdown
                  label="New slide layout"
                  caption="Layout presets"
                  choices={newSlideLayouts}
                  previews={slideLayoutPreviews}
                  disabled={!deck}
                  onChange={insertSlide}
                />
              </div>
            </RibbonGroup>
            <RibbonGroup name="Font">
              <div className="home-rows">
                <div className="home-row">
                  <Dropdown
                    label="Font family"
                    previews={Object.fromEntries(
                      [
                        '+mn-lt',
                        ...fontChoices,
                        ...(textObject?.fontFamily ? [textObject.fontFamily] : []),
                      ].map((font) => [
                        font,
                        font.startsWith('+') ? (
                          <Sparkles size={16} />
                        ) : (
                          <span className="menu-type-sample" style={{ fontFamily: font }}>
                            Aa
                          </span>
                        ),
                      ]),
                    )}
                    caption="Theme font"
                    disabled={!textObject}
                    value={textObject?.fontFamily || '+mn-lt'}
                    choices={[
                      ['+mn-lt', 'Theme font'],
                      ...(textObject?.fontFamily &&
                      textObject.fontFamily !== '+mn-lt' &&
                      !fontChoices.includes(textObject.fontFamily)
                        ? [
                            [
                              textObject.fontFamily,
                              textObject.fontFamily.startsWith('+')
                                ? 'Theme font (imported)'
                                : textObject.fontFamily,
                            ] as const,
                          ]
                        : []),
                      ...fontChoices.map((font) => [font, font] as const),
                    ]}
                    onChange={(fontFamily) => fmt({ fontFamily })}
                  />
                  <fieldset className="font-size-picker" disabled={!textObject}>
                    <NumberField
                      key={textObject?.id}
                      label="Font size"
                      value={fontPoints(textObject?.fontSize)}
                      min={1}
                      max={150}
                      onChange={(points) => fmt({ fontSize: pointsToPixels(points) })}
                    />
                    <Dropdown
                      label="Font size presets"
                      compact
                      disabled={!textObject}
                      value={String(fontPoints(textObject?.fontSize))}
                      choices={fontSizes.map((size) => [size, `${size} pt`] as const)}
                      previews={Object.fromEntries(
                        fontSizes.map((size) => [
                          size,
                          <span
                            className="menu-type-sample"
                            style={{ fontSize: 9 + Math.sqrt(Number(size)) }}
                          >
                            A
                          </span>,
                        ]),
                      )}
                      onMouseDown={(event) => {
                        preserveTextFocus(event);
                        const editor = textEditor.current;
                        fontPresetSelection.current =
                          editor && editor.id === textObject?.id
                            ? { id: editor.id, snapshot: editor.read() }
                            : null;
                      }}
                      onChange={(points) => applyFontSize(() => pointsToPixels(Number(points)), true)}
                    />
                  </fieldset>
                  <Tool
                    title="Increase font size"
                    icon={<span className="type-command">A+</span>}
                    disabled={!textObject}
                    onClick={() => changeFontSize(2)}
                    onMouseDown={preserveTextFocus}
                  />
                  <Tool
                    title="Decrease font size"
                    icon={<span className="type-command">A−</span>}
                    disabled={!textObject}
                    onClick={() => changeFontSize(-2)}
                    onMouseDown={preserveTextFocus}
                  />
                  <Tool
                    title="Clear formatting"
                    icon={<Eraser size={16} />}
                    disabled={!textObject}
                    onClick={() => fmt(defaultTextFormat)}
                  />
                </div>
                <div className="home-row">
                  <Tool
                    title="Bold text"
                    icon={<Bold size={16} />}
                    active={textObject?.bold}
                    disabled={!textObject}
                    onClick={() => fmt({ bold: !textObject?.bold })}
                  />
                  <Tool
                    title="Italic text"
                    icon={<Italic size={16} />}
                    active={textObject?.italic}
                    disabled={!textObject}
                    onClick={() => fmt({ italic: !textObject?.italic })}
                  />
                  <Tool
                    title="Underline text"
                    icon={<Underline size={16} />}
                    active={textObject?.underline}
                    disabled={!textObject}
                    onClick={() => fmt({ underline: !textObject?.underline })}
                  />
                  <Tool
                    title="Strikethrough"
                    icon={<Strikethrough size={15} />}
                    active={textObject?.strike}
                    disabled={!textObject}
                    onClick={() => fmt({ strike: !textObject?.strike })}
                  />
                  <Tool
                    title="Superscript"
                    icon={<Superscript size={15} />}
                    active={(textObject?.baseline ?? 0) > 0}
                    disabled={!textObject}
                    onClick={() => fmt({ baseline: (textObject?.baseline ?? 0) > 0 ? 0 : 30 })}
                  />
                  <Tool
                    title="Subscript"
                    icon={<Subscript size={15} />}
                    active={(textObject?.baseline ?? 0) < 0}
                    disabled={!textObject}
                    onClick={() => fmt({ baseline: (textObject?.baseline ?? 0) < 0 ? 0 : -25 })}
                  />
                  <Dropdown
                    label="Character spacing"
                    previews={characterSpacingPreviews}
                    caption="Spacing"
                    choices={[
                      ['-1', 'Tight'],
                      ['0', 'Normal'],
                      ['1', 'Loose'],
                      ['2', 'Very loose'],
                    ]}
                    disabled={!textObject}
                    onChange={(value) => fmt({ letterSpacing: Number(value) })}
                  />
                  <Dropdown
                    label="Change case"
                    caption="Aa"
                    choices={caseChoices}
                    previews={casePreviews}
                    disabled={!textObject}
                    onChange={(mode) => textObject && fmt({ text: changeCase(textObject.text || '', mode) })}
                  />
                  <label className="ribbon-control">
                    <span>Color</span>
                    <input
                      aria-label="Ribbon font color"
                      type="color"
                      disabled={!textObject}
                      value={textObject?.color || '#17233b'}
                      onChange={(e) => fmt({ color: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            </RibbonGroup>
            <RibbonGroup name="Paragraph">
              <div className="home-rows">
                <div className="home-row">
                  <ListStyleMenu
                    disabled={!textObject}
                    value={textObject?.listStyle}
                    onChange={(listStyle) => fmt({ listStyle })}
                  />
                  <Tool
                    title="Decrease indent"
                    icon={<IndentDecrease size={16} />}
                    disabled={!textObject || !textObject.indentLevel}
                    onClick={() => fmt({ indentLevel: Math.max(0, (textObject?.indentLevel ?? 0) - 1) })}
                  />
                  <Tool
                    title="Increase indent"
                    icon={<IndentIncrease size={16} />}
                    disabled={!textObject || (textObject.indentLevel ?? 0) >= 8}
                    onClick={() => fmt({ indentLevel: (textObject?.indentLevel ?? 0) + 1 })}
                  />
                  <Dropdown
                    label="Line spacing"
                    previews={lineSpacingPreviews}
                    caption="Leading"
                    choices={[
                      ['1', '1.0'],
                      ['1.15', '1.15'],
                      ['1.5', '1.5'],
                      ['2', '2.0'],
                      ['2.5', '2.5'],
                      ['3', '3.0'],
                    ]}
                    disabled={!textObject}
                    onChange={(value) => fmt({ lineSpacing: Number(value) })}
                  />
                </div>
                <div className="home-row">
                  <Dropdown<Alignment>
                    label="Paragraph alignment"
                    previews={paragraphAlignmentPreviews}
                    disabled={!textObject}
                    value={textObject?.alignment || 'left'}
                    choices={[
                      ['left', 'Left'],
                      ['center', 'Center'],
                      ['right', 'Right'],
                      ['justify', 'Justify'],
                    ]}
                    onChange={(alignment) => fmt({ alignment })}
                  />
                  <Dropdown
                    label="Vertical text alignment"
                    previews={verticalAlignmentPreviews}
                    caption="Align text"
                    choices={[
                      ['top', 'Top'],
                      ['middle', 'Middle'],
                      ['bottom', 'Bottom'],
                    ]}
                    disabled={!textObject}
                    value={textObject?.textAnchor}
                    onChange={(textAnchor) => fmt({ textAnchor })}
                  />
                  <Dropdown
                    label="Text columns"
                    previews={textColumnPreviews}
                    caption="Columns"
                    choices={[
                      ['1', 'One column'],
                      ['2', 'Two columns'],
                      ['3', 'Three columns'],
                    ]}
                    disabled={!textObject}
                    value={textObject?.columns ? String(textObject.columns) : undefined}
                    onChange={(value) => fmt({ columns: Number(value) })}
                  />
                </div>
              </div>
            </RibbonGroup>
            <RibbonGroup name="Insert">
              <div className="home-rows">
                <div className="home-row">
                  <Tool
                    icon={<ImagePlus size={16} />}
                    disabled={!deck}
                    onClick={() => imgInput.current?.click()}
                  >
                    Picture
                  </Tool>
                  <Tool icon={<Type size={16} />} disabled={!deck} onClick={insertText}>
                    Text Box
                  </Tool>
                </div>
                <Dropdown
                  label="Insert shape"
                  caption="Shapes"
                  choices={shapes}
                  previews={shapePreviews(shapes)}
                  disabled={!deck}
                  onChange={insertShape}
                />
              </div>
            </RibbonGroup>
            <RibbonGroup name="Arrange">
              <div className="home-rows">
                <div className="home-row">
                  <Dropdown
                    label="Arrange objects"
                    previews={arrangePreviews}
                    caption="Arrange"
                    disabled={!selectedObjects.length}
                    choices={[
                      ['front', 'Bring to Front'],
                      ['forward', 'Bring Forward'],
                      ['back', 'Send to Back'],
                      ['backward', 'Send Backward'],
                      ['clockwise', 'Rotate Right 90°'],
                      ['counterclockwise', 'Rotate Left 90°'],
                      ['group', 'Group'],
                      ['ungroup', 'Ungroup'],
                    ]}
                    disabledChoices={[...(!canGroup ? ['group'] : []), ...(!canUngroup ? ['ungroup'] : [])]}
                    onChange={(command) => {
                      if (command === 'group' || command === 'ungroup') groupObjects(command === 'ungroup');
                      else if (command === 'front' || command === 'back') layerToEdge(command === 'front');
                      else if (command === 'forward' || command === 'backward')
                        layer(command === 'forward' ? 1 : -1);
                      else
                        mutateObjects(
                          Object.fromEntries(
                            selectedObjects.map((o) => [
                              o.id,
                              { rotation: (o.rotation + (command === 'clockwise' ? 90 : 270)) % 360 },
                            ]),
                          ),
                        );
                    }}
                  />
                  <Tool
                    title="Selection pane"
                    icon={<Layers size={16} />}
                    active={sidebarVisible && tab === 'selection'}
                    onClick={() =>
                      sidebarVisible && tab === 'selection' ? closePane('selection') : openPane('selection')
                    }
                  />
                </div>
                <div className="home-row">{alignmentControls}</div>
              </div>
            </RibbonGroup>
            <RibbonGroup name="Shape styles">
              <div className="home-rows">
                <div className="home-row">
                  <Dropdown
                    label="Shape quick styles"
                    previews={Object.fromEntries(
                      shapeStyles.map(({ label, fill, line }) => [
                        label,
                        <ShapeSwatch fill={fill} outline={line} />,
                      ]),
                    )}
                    caption="Quick styles"
                    disabled={!shapeSelection.length}
                    choices={shapeStyles.map((style) => [style.label, style.label] as const)}
                    onChange={(label) => {
                      const style = shapeStyles.find((item) => item.label === label)!;
                      setShapeStyle(style.fill, { color: style.line, width: 2, dash: 'solid' });
                    }}
                  />
                  <Dropdown
                    label="Shape fill options"
                    previews={{
                      transparent: <Ban size={17} />,
                      ...Object.fromEntries(
                        shapeStyles.map(({ fill }) => [fill, <ShapeSwatch fill={fill} />]),
                      ),
                    }}
                    caption="Shape fill"
                    disabled={!shapeSelection.length}
                    choices={[
                      ['transparent', 'No fill'],
                      ...shapeStyles.map(({ fill, label }) => [fill, label] as const),
                    ]}
                    onChange={(fill) => setShapeStyle(fill)}
                  />
                  <input
                    className="home-color"
                    aria-label="Home shape fill color"
                    title="Custom fill color"
                    type="color"
                    disabled={!shapeSelection.length}
                    value={shapeSelection[0]?.fill?.startsWith('#') ? shapeSelection[0].fill : '#ffffff'}
                    onChange={(e) => setShapeStyle(e.target.value)}
                  />
                </div>
                <div className="home-row">
                  <Dropdown
                    label="Shape outline options"
                    previews={outlinePreviews}
                    caption="Outline"
                    disabled={!shapeSelection.length}
                    choices={[
                      ['none', 'No outline'],
                      ['1', 'Thin'],
                      ['2', 'Medium'],
                      ['4', 'Thick'],
                      ['solid', 'Solid'],
                      ['dash', 'Dashed'],
                      ['dot', 'Dotted'],
                    ]}
                    onChange={(value) => {
                      if (value === 'none') return setShapeStyle(undefined, { color: 'transparent' });
                      setShapeStyle(undefined, (outline) => ({
                        color: outline.color === 'transparent' ? '#6345bd' : outline.color,
                        width: Number(value) || outline.width,
                        dash: value === 'dash' || value === 'dot' || value === 'solid' ? value : outline.dash,
                      }));
                    }}
                  />
                  <input
                    className="home-color"
                    aria-label="Home shape outline color"
                    title="Custom outline color"
                    type="color"
                    disabled={!shapeSelection.length}
                    value={
                      shapeSelection[0]?.outline?.color.startsWith('#')
                        ? shapeSelection[0].outline.color
                        : '#6345bd'
                    }
                    onChange={(e) => setShapeStyle(undefined, { color: e.target.value })}
                  />
                </div>
              </div>
            </RibbonGroup>
            <RibbonGroup name="Editing">
              <div className="home-rows home-editing">
                <Tool
                  icon={<Search size={16} />}
                  onClick={() => {
                    setReplaceMode('find');
                    setFind(true);
                  }}
                >
                  Find
                </Tool>
                <Tool
                  icon={<Type size={16} />}
                  disabled={!deck}
                  onClick={() => {
                    setReplaceMode('text');
                    setFind(true);
                  }}
                >
                  Replace
                </Tool>
              </div>
            </RibbonGroup>
          </>
        );
      case 'Insert':
        return (
          <InsertRibbon
            enabled={!!deck}
            linkable={!!linkTarget}
            layouts={newSlideLayouts}
            shapes={shapes}
            act={runInsert}
          />
        );
      case 'Draw': {
        const penIcon = (item: InkPen) => {
          const Icon = { pen: Pen, pencil: Pencil, highlighter: Highlighter }[item.kind];
          return <Icon size={19} style={{ color: item.color }} />;
        };
        const sample = drawTool === 'select' ? inkSelection[0]?.stroke : undefined;
        const style = sample ?? pen;
        const changeStyle = sample ? formatInk : changePen;
        return (
          <>
            <RibbonGroup name="Drawing">
              <Tool
                icon={<MousePointer2 size={18} />}
                active={drawTool === 'select'}
                onClick={() => useDrawTool('select')}
              >
                Select
              </Tool>
              <Tool
                icon={<Lasso size={18} />}
                active={drawTool === 'lasso'}
                title="Lasso Select"
                onClick={() => useDrawTool('lasso')}
              >
                Lasso Select
              </Tool>
              <div className="draw-eraser-stack">
                <Tool
                  icon={<Eraser size={17} />}
                  active={drawTool === 'eraser'}
                  onClick={() => useDrawTool('eraser')}
                >
                  Eraser
                </Tool>
                <Dropdown
                  label="Eraser mode"
                  value={eraser}
                  choices={[
                    ['stroke', 'Stroke Eraser'],
                    ['small', 'Small Point Eraser'],
                    ['large', 'Large Point Eraser'],
                  ]}
                  onChange={(mode) => {
                    setEraser(mode);
                    useDrawTool('eraser');
                  }}
                />
              </div>
            </RibbonGroup>
            <RibbonGroup name="Pens">
              <div className="draw-pen-tray" aria-label="Pen presets">
                {pens.slice(0, initialPens.length).map((item) => (
                  <Tool
                    key={item.id}
                    icon={penIcon(item)}
                    active={drawTool === 'pen' && penId === item.id}
                    onClick={() => {
                      setPenId(item.id);
                      useDrawTool('pen');
                    }}
                  >
                    {item.name}
                  </Tool>
                ))}
              </div>
              <div className="draw-eraser-stack">
                <Dropdown
                  label="Add Pen"
                  icon={<Plus size={16} />}
                  choices={[
                    ['pen', 'Pen'],
                    ['pencil', 'Pencil'],
                    ['highlighter', 'Highlighter'],
                  ]}
                  onChange={addPen}
                />
                {pens.length > initialPens.length && (
                  <Dropdown
                    label="Custom pens"
                    value={penId}
                    choices={pens.slice(initialPens.length).map(({ id, name }) => [id, name])}
                    previews={Object.fromEntries(pens.map((item) => [item.id, penIcon(item)]))}
                    onChange={(id) => {
                      setPenId(id);
                      useDrawTool('pen');
                    }}
                  />
                )}
              </div>
            </RibbonGroup>
            <RibbonGroup name={sample ? 'Selected Ink' : 'Pen Style'}>
              <label className="ribbon-control">
                <span>Color</span>
                <input
                  aria-label={sample ? 'Ink color' : 'Pen color'}
                  type="color"
                  value={style.color}
                  onChange={(e) => changeStyle({ color: e.target.value })}
                />
              </label>
              <NumberField
                label={sample ? 'Ink width' : 'Pen width'}
                caption="Width"
                value={style.width}
                min={0.5}
                max={48}
                onChange={(width) => changeStyle({ width })}
              />
              <NumberField
                label={sample ? 'Ink opacity' : 'Pen opacity'}
                caption="Opacity %"
                value={100 * (style.opacity ?? 1)}
                min={5}
                max={100}
                onChange={(percent) => changeStyle({ opacity: percent / 100 })}
              />
            </RibbonGroup>
            <RibbonGroup name="Ink Editing">
              <Tool icon={<Shapes size={17} />} disabled={!sample} title="Ink to Shape" onClick={convertInk}>
                Ink to Shape
              </Tool>
              <Tool
                icon={<Type size={16} />}
                disabled={!inkSelection.length || !hasInkRecognition() || !!busy}
                title={
                  hasInkRecognition() ? 'Ink to Text' : 'Ink to Text requires browser handwriting recognition'
                }
                onClick={() => void convertHandwriting(false)}
              >
                Ink to Text
              </Tool>
              <Tool
                icon={<Type size={16} />}
                disabled={!inkSelection.length || !hasInkRecognition() || !!busy}
                title={
                  hasInkRecognition() ? 'Ink to Math' : 'Ink to Math requires browser handwriting recognition'
                }
                onClick={() => void convertHandwriting(true)}
              >
                Ink to Math
              </Tool>
              <Tool
                icon={<Play size={16} />}
                disabled={!slide?.objects.some((object) => object.stroke && !object.hidden)}
                onClick={() => {
                  setDrawTool('select');
                  setInkReplay(performance.now());
                }}
              >
                Ink Replay
              </Tool>
              <Tool
                icon={<Play size={16} />}
                disabled={!slide?.objects.some((object) => object.stroke && !object.hidden)}
                onClick={() => {
                  setDrawTool('select');
                  setInkReplay(performance.now());
                }}
              >
                Ink Replay
              </Tool>
              <Tool icon={<Ruler size={17} />} active={ruler} onClick={() => setRuler(!ruler)}>
                Rulers
              </Tool>
            </RibbonGroup>
          </>
        );
      }
      case 'Design':
        return (
          <>
            <RibbonGroup name="Customize">
              <Tool
                icon={<LayoutTemplate size={16} />}
                disabled={!deck}
                onClick={() => setToolsDialog('size')}
              >
                Slide Size
              </Tool>
              <Tool icon={<Paintbrush size={16} />} disabled={!deck} onClick={() => setToolsDialog('theme')}>
                Theme Fonts and Colors
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Slide background">
              {backgroundPresets.map(([label, color]) => (
                <button
                  key={color}
                  title={label}
                  aria-label={`${label} background`}
                  aria-pressed={!slide?.backgroundPaint && slide?.background === color}
                  disabled={!slide}
                  className="background-swatch"
                  style={{ background: color }}
                  onClick={() => changeBackground(color)}
                >
                  {!slide?.backgroundPaint && slide?.background === color && <Check size={15} />}
                </button>
              ))}
              <label className="ribbon-control">
                <span>Custom color</span>
                <input
                  aria-label="Slide background color"
                  type="color"
                  value={slide?.background || '#ffffff'}
                  disabled={!slide}
                  onChange={(e) => changeBackground(e.target.value)}
                />
              </label>
              <Tool
                icon={null}
                disabled={!slide || !canDeleteSlide}
                onClick={() => slide && changeBackground(slide.background, true, slide.backgroundPaint)}
              >
                Apply to All
              </Tool>
              <Tool
                icon={<PaintBucket size={15} />}
                disabled={!slide}
                onClick={() => setSlideDialog('background')}
              >
                Format Background
              </Tool>
            </RibbonGroup>
          </>
        );
      case 'Transitions': {
        const editableTransition = !!slide && slide.transition !== 'preserve';
        const options = editableTransition
          ? transitions[slide.transition as keyof typeof transitions].options
          : undefined;
        return (
          <>
            <RibbonGroup name="Preview">
              <Tool
                icon={<Play size={15} />}
                disabled={!editableTransition || slide?.transition === 'none'}
                onClick={() => togglePreview('transition')}
              >
                Preview Transition
              </Tool>
              <Tool icon={null} onClick={() => setShowPreviewSettings(true)}>
                Preview Settings
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Transition to this slide">
              <TransitionGallery value={slide?.transition} disabled={!slide} choose={chooseTransition} />
              <Dropdown
                label="Effect Options"
                choices={options?.map(([id, label]) => [id, label] as const) ?? []}
                disabled={!options?.length}
                value={
                  slide?.transitionOption ??
                  (editableTransition
                    ? defaultTransitionOption(slide.transition as keyof typeof transitions)
                    : undefined)
                }
                onChange={(transitionOption) => updateTransition({ transitionOption })}
              />
            </RibbonGroup>
            <RibbonGroup name="Timing">
              <fieldset disabled={!editableTransition} className="transition-timing">
                <fieldset disabled={slide?.transition === 'none'}>
                  <NumberField
                    key={slide?.id + '-duration'}
                    label="Transition seconds"
                    value={slide?.duration || 1}
                    min={0.1}
                    max={60}
                    onChange={(duration) => updateTransition({ duration })}
                  />
                </fieldset>
                <div className="transition-advance">
                  <label className="transition-check">
                    <input
                      type="checkbox"
                      checked={slide?.advanceOnClick ?? true}
                      onChange={(e) => updateTransition({ advanceOnClick: e.target.checked })}
                    />{' '}
                    On Mouse Click
                  </label>
                  <label className="transition-check">
                    <input
                      type="checkbox"
                      checked={slide?.advanceAfter != null}
                      onChange={(e) => updateTransition({ advanceAfter: e.target.checked ? 5 : null })}
                    />{' '}
                    After
                  </label>
                </div>
                <fieldset disabled={slide?.advanceAfter == null}>
                  <NumberField
                    key={slide?.id + '-advance'}
                    label="Advance after (seconds)"
                    value={slide?.advanceAfter ?? 5}
                    min={0}
                    max={86400}
                    onChange={(advanceAfter) => updateTransition({ advanceAfter })}
                  />
                </fieldset>
              </fieldset>
              <Tool
                icon={<Copy size={15} />}
                disabled={!editableTransition || !canDeleteSlide}
                onClick={applyTransitionToAll}
              >
                Apply to All
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="3D workflow">
              <Tool icon={<Sparkles size={17} />} disabled={!deck} onClick={() => duplicate(true)}>
                Duplicate + Morph
              </Tool>
            </RibbonGroup>
          </>
        );
      }
      case 'Animations': {
        const editableEffect = !!activeAnimation && !activeAnimation.imported;
        const canPaint =
          !!animationBrush ||
          animations.some((entry) => !entry.imported && entry.target === animationTarget?.id);
        return (
          <>
            <RibbonGroup name="Preview">
              <div className="animation-ribbon-stack">
                <Tool
                  icon={<Play size={15} />}
                  disabled={!animations.length}
                  onClick={() => togglePreview('animation')}
                >
                  Preview Animations
                </Tool>
                <Tool icon={null} onClick={() => setShowPreviewSettings(true)}>
                  Preview Settings
                </Tool>
              </div>
              {animations.some(({ imported }) => imported) && (
                <Tool
                  icon={<Settings2 size={15} />}
                  disabled={!!slide?.animationsUnpreviewed}
                  onClick={makeAnimationsEditable}
                >
                  Make PowerPoint Effects Editable
                </Tool>
              )}
            </RibbonGroup>
            <RibbonGroup name="Animation" hideLabel>
              <AnimationGallery
                selected={activeAnimation?.effect}
                disabled={!animationTarget}
                choose={chooseAnimation}
                remove={removeAnimation}
                canRemove={editableEffect}
                launch={animationPicker}
                launched={() => setAnimationPicker(undefined)}
              />
              <Tool
                icon={<Type size={15} />}
                disabled={
                  !editableEffect || !textObject?.text?.includes('\n') || !!activeAnimation?.paragraphs
                }
                onClick={animateParagraphs}
              >
                Animate by Paragraph
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Advanced Animation">
              <div className="animation-ribbon-stack animation-advanced">
                <Tool
                  icon={<PanelRight size={15} />}
                  active={sidebarVisible && tab === 'animations'}
                  onClick={() =>
                    sidebarVisible && tab === 'animations' ? closePane('animations') : openPane('animations')
                  }
                >
                  Animation Pane
                </Tool>
                <Tool
                  icon={<Settings2 size={14} />}
                  title="Animation Effect Options"
                  disabled={!editableEffect}
                  onClick={() => activeAnimation && openAnimationSettings(activeAnimation, 'effect')}
                >
                  Effect Options
                </Tool>
                <div className="animation-ribbon-trigger">
                  <Dropdown
                    label="Animation Trigger"
                    caption="Trigger"
                    icon={<Zap size={14} />}
                    disabled={!editableEffect}
                    value={activeAnimation?.trigger}
                    choices={triggerChoices(slide?.objects ?? [])}
                    onChange={(trigger) =>
                      updateAnimation(trigger ? { trigger, start: 'click' } : { trigger: undefined })
                    }
                  />
                </div>
                <Tool
                  icon={<Paintbrush size={14} />}
                  disabled={!canPaint}
                  active={!!animationBrush}
                  onClick={paintAnimations}
                >
                  Animation Painter
                </Tool>
              </div>
            </RibbonGroup>
            <RibbonGroup name="Timing">
              <Dropdown
                label="Animation Start"
                caption="Start"
                value={activeAnimation?.start}
                disabled={!editableEffect || !!activeAnimation?.trigger}
                choices={animationStarts}
                onChange={(start) => updateAnimation({ start })}
              />
              <fieldset
                className="animation-ribbon-times"
                disabled={!editableEffect}
                key={activeAnimation?.id}
              >
                <NumberField
                  label="Animation duration (seconds)"
                  caption="Duration"
                  value={activeAnimation?.duration ?? 0.5}
                  min={0.01}
                  max={3600}
                  onChange={(duration) => updateAnimation({ duration })}
                />
                <NumberField
                  label="Animation delay (seconds)"
                  caption="Delay"
                  value={activeAnimation?.delay ?? 0}
                  min={0}
                  max={3600}
                  onChange={(delay) => updateAnimation({ delay })}
                />
              </fieldset>
            </RibbonGroup>
          </>
        );
      }
      case 'Slide Show':
        return (
          <>
            <RibbonGroup name="Start slide show">
              <Tool icon={<Play size={16} />} disabled={!deck} onClick={() => setPresenting(0)}>
                From Beginning
              </Tool>
              <Tool icon={<Play size={16} />} disabled={!deck} onClick={() => setPresenting(index)}>
                From Current Slide
              </Tool>
              <Tool icon={<Type size={16} />} disabled={!slide} onClick={() => setNotesOpen(true)}>
                Speaker Notes
              </Tool>
              <Tool
                icon={<PanelRight size={16} />}
                disabled={!slide}
                onClick={() => {
                  const popup = openPresenterWindow();
                  if (!popup) {
                    setNotice('Allow pop-ups to open presenter notes in a separate window.');
                    return;
                  }
                  presenterWindow.current = popup;
                  setPresenting(index);
                }}
              >
                Presenter View
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Set Up">
              <Tool icon={<Settings2 size={16} />} disabled={!deck} onClick={() => setCustomShowsOpen(true)}>
                Custom Slide Shows
              </Tool>
              <Tool
                icon={<Play size={16} />}
                disabled={!deck?.slides.some((slide) => !slide.hidden)}
                onClick={() => {
                  setRehearsing(true);
                  setPresenting(0);
                }}
              >
                Rehearse Timings
              </Tool>
              <Tool
                icon={<Check size={16} />}
                active={playTimings}
                disabled={!deck}
                onClick={() => setPlayTimings(!playTimings)}
              >
                Use Timings
              </Tool>
            </RibbonGroup>
          </>
        );
      case 'Record':
        return (
          <RibbonGroup name="Record this slide">
            <Tool
              icon={<Play size={16} />}
              disabled={!slide || !!busy}
              onClick={() => setMediaDialog('narration')}
            >
              Record Narration
            </Tool>
            <Tool
              icon={<Play size={16} />}
              disabled={!slide || !!busy}
              onClick={() => setMediaDialog('camera')}
            >
              Record Camera
            </Tool>
          </RibbonGroup>
        );
      case 'Review':
        return (
          <>
            <RibbonGroup name="Proofing & compatibility">
              <Tool
                icon={<Check size={16} />}
                active={spellCheck}
                onClick={() => setPreferences((current) => ({ ...current, spellCheck: !current.spellCheck }))}
              >
                Spelling as You Type
              </Tool>
              <Tool icon={<ShieldCheck size={16} />} onClick={() => setReport(true)}>
                Compatibility Report
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Accessibility">
              <Tool icon={<Check size={16} />} disabled={!deck} onClick={() => setAccessibilityOpen(true)}>
                Check Accessibility
              </Tool>
              <label className="ribbon-control">
                <span>Alt text</span>
                <input
                  aria-label="Object alt text"
                  type="text"
                  value={object?.altText || ''}
                  disabled={locked || selection.length !== 1}
                  onChange={(e) => object && patch(object.id, { altText: e.target.value })}
                  placeholder="Describe the selected object"
                />
              </label>
            </RibbonGroup>
          </>
        );
      case 'View':
        return (
          <>
            <RibbonGroup name="Presentation views">
              <Tool icon={<Square size={16} />} active={view === 'normal'} onClick={() => setView('normal')}>
                Normal
              </Tool>
              <Tool
                icon={<Grid2X2 size={16} />}
                active={view === 'sorter'}
                onClick={() => {
                  setDrawTool('select');
                  setView('sorter');
                }}
              >
                Slide Sorter
              </Tool>
              <Tool
                icon={<LayoutTemplate size={16} />}
                disabled={!deck}
                onClick={() => {
                  setNotice('');
                  setToolsDialog('master');
                }}
              >
                Slide Master
              </Tool>
              <Tool
                icon={<LayoutTemplate size={16} />}
                disabled={
                  !slide?.objects.some(
                    (object) => object.kind === 'text' && !object.hidden && !object.slideNumber,
                  )
                }
                onClick={() => setToolsDialog('customLayout')}
              >
                Save Slide as Layout
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Show">
              <Tool icon={<Grid2X2 size={16} />} active={grid} onClick={() => setGrid(!grid)}>
                Gridlines
              </Tool>
              <Tool icon={<AlignCenter size={16} />} active={guides} onClick={() => setGuides(!guides)}>
                Guides
              </Tool>
              <Tool icon={<Ruler size={16} />} active={ruler} onClick={() => setRuler(!ruler)}>
                Ruler
              </Tool>
              <Tool
                icon={<AlignCenter size={16} />}
                active={smartGuides}
                onClick={() =>
                  setPreferences((current) => ({ ...current, smartGuides: !current.smartGuides }))
                }
              >
                Smart Guides
              </Tool>
              <Tool
                icon={<Layers size={16} />}
                active={sidebarVisible && tab === 'selection'}
                onClick={() =>
                  sidebarVisible && tab === 'selection' ? closePane('selection') : openPane('selection')
                }
              >
                Selection Pane
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Layout tools">
              <Tool
                icon={<Ruler size={16} />}
                disabled={selectedObjects.length < 2 || view === 'sorter'}
                onClick={() => setToolsDialog('spacing')}
              >
                Object Spacing
              </Tool>
              <Dropdown
                label="Constrain object dragging"
                value={dragAxis ?? 'free'}
                choices={[
                  ['free', 'Free Drag'],
                  ['x', 'Horizontal Only'],
                  ['y', 'Vertical Only'],
                ]}
                disabled={!slide || view === 'sorter'}
                onChange={(value) => setDragAxis(value === 'free' ? undefined : value)}
              />
            </RibbonGroup>
            <RibbonGroup name="Zoom">
              <Tool
                title="Ribbon zoom out"
                icon={<Minus size={16} />}
                disabled={!slide || slideView.zoom <= minSlideZoom}
                onClick={() => zoomBy(-0.1)}
              />
              <Tool
                title="Ribbon zoom in"
                icon={<Plus size={16} />}
                disabled={!slide || slideView.zoom >= maxSlideZoom}
                onClick={() => zoomBy(0.1)}
              />
              <Tool icon={<Maximize size={16} />} disabled={!slide} onClick={fitSlide}>
                Fit to Window
              </Tool>
            </RibbonGroup>
          </>
        );
      case 'Help':
        return (
          <RibbonGroup name="Forma help">
            <Tool icon={<Type size={16} />} onClick={() => setHelp(true)}>
              Shortcuts and 3D Guide
            </Tool>
            <Tool icon={<ShieldCheck size={16} />} onClick={() => setReport(true)}>
              Compatibility Report
            </Tool>
          </RibbonGroup>
        );
      case 'Shape Format':
        return (
          <>
            {arrangeGroup}
            <RibbonGroup name="Edit Shape">
              <Dropdown
                label="Merge Shapes"
                caption="Merge Shapes"
                disabled={!mergeable}
                choices={mergeCommands}
                onChange={combineShapes}
              />
              <Tool
                icon={<Settings2 size={16} />}
                disabled={!canEditPoints}
                active={!!object && editPoints === object.id}
                onClick={toggleEditPoints}
              >
                Edit Points
              </Tool>
              <Tool icon={<Shapes size={16} />} disabled={!canConnect} onClick={connectShapes}>
                Connect Shapes
              </Tool>
            </RibbonGroup>
            <RibbonGroup name="Shape styles">
              <label className="ribbon-control">
                <span>Fill color</span>
                <input
                  type="color"
                  aria-label="Ribbon shape fill"
                  value={object?.fill === 'transparent' ? '#ffffff' : object?.fill || '#dcd7f5'}
                  disabled={locked || !!object?.stroke}
                  onChange={(e) => object && patch(object.id, { fill: e.target.value })}
                />
              </label>
              <Tool
                icon={null}
                disabled={locked || !!object?.stroke}
                onClick={() => object && patch(object.id, { fill: 'transparent' })}
              >
                No Fill
              </Tool>
            </RibbonGroup>
          </>
        );
      case 'Picture Format':
        return (
          <>
            {arrangeGroup}
            <RibbonGroup name="Picture">
              <Tool icon={<Crop size={16} />} disabled={!cropImage} onClick={startPictureCrop}>
                Crop Picture
              </Tool>
              <Tool
                icon={<RotateCcw size={16} />}
                disabled={locked}
                onClick={() => object && patch(object.id, { rotation: 0 })}
              >
                Reset Rotation
              </Tool>
              <Dropdown
                label="Crop to Shape"
                caption="Crop to Shape"
                value={cropImage?.pictureShape ?? 'rect'}
                choices={pictureCropShapes}
                previews={shapePreviews(pictureCropShapes)}
                disabled={!cropImage}
                onChange={(pictureShape) => cropImage && patch(cropImage.id, { pictureShape })}
              />
              <label className="ribbon-control">
                <span>Transparency</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  aria-label="Picture transparency"
                  disabled={!cropImage}
                  value={Math.round((1 - (cropImage?.pictureOpacity ?? 1)) * 100)}
                  onChange={(event) =>
                    cropImage && patch(cropImage.id, { pictureOpacity: 1 - Number(event.target.value) / 100 })
                  }
                />
              </label>
              <label className="ribbon-control">
                <span>Brightness</span>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  aria-label="Picture brightness"
                  disabled={!cropImage}
                  value={Math.round((cropImage?.pictureBrightness ?? 0) * 100)}
                  onChange={(event) =>
                    cropImage && patch(cropImage.id, { pictureBrightness: Number(event.target.value) / 100 })
                  }
                />
              </label>
              <Tool
                icon={<Eraser size={16} />}
                disabled={!cropImage}
                onClick={() => setToolsDialog('picture')}
              >
                Remove Background
              </Tool>
              {cropImage?.originalPicture && (
                <Tool
                  icon={<RotateCcw size={16} />}
                  onClick={() =>
                    patch(cropImage.id, { asset: cropImage.originalPicture, originalPicture: undefined })
                  }
                >
                  Restore Original
                </Tool>
              )}
            </RibbonGroup>
          </>
        );
      case '3D Model':
        return (
          <>
            <RibbonGroup name="3D orientation">
              <Tool
                icon={<Move3D size={18} />}
                active={orbit}
                disabled={locked}
                onClick={() => (orbit ? setOrbit(false) : startOrbit())}
              >
                Rotate in 3D
              </Tool>
              <Tool
                icon={<RotateCcw size={16} />}
                disabled={locked}
                onClick={() => object && patch(object.id, { pose: [0, 0, 0] })}
              >
                Reset View
              </Tool>
            </RibbonGroup>
            {arrangeGroup}
          </>
        );
    }
  }
  return (
    <div className="app">
      <input
        ref={pptInput}
        type="file"
        accept=".pptx,.potx"
        aria-label="Import PPTX file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={modelInput}
        type="file"
        accept={modelAccept}
        aria-label="3D model files"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) void modelFiles(files);
          e.target.value = '';
        }}
      />
      <input
        type="file"
        ref={(node) => {
          modelFolderInput.current = node;
          node?.setAttribute('webkitdirectory', '');
        }}
        aria-label="3D model folder"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) void modelFiles(files);
          e.target.value = '';
        }}
      />
      <input
        type="file"
        ref={(node) => {
          textureFolderInput.current = node;
          node?.setAttribute('webkitdirectory', '');
        }}
        aria-label="Texture folder for selected model"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length && object?.kind === 'model' && !object.locked) void modelFiles(files, object);
          e.target.value = '';
        }}
      />
      <input
        type="file"
        ref={repairSourceInput}
        accept=".fbx,.obj,.gltf,.zip"
        multiple
        hidden
        aria-label="Original model for texture repair"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length && object?.kind === 'model' && !object.locked) {
            void modelFiles(
              files,
              object,
              pendingTextures && pendingTextures.asset === object.asset ? pendingTextures.files : [],
            );
          }
          e.target.value = '';
        }}
      />
      <input
        ref={imgInput}
        type="file"
        accept={pictureAccept}
        multiple
        aria-label="Insert image file"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void imageFile(files);
          e.target.value = '';
        }}
      />
      <input
        type="file"
        ref={videoInput}
        accept=".mp4,video/mp4"
        aria-label="Insert video file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertMedia(file, 'video');
          e.target.value = '';
        }}
      />
      <input
        type="file"
        ref={audioInput}
        accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
        aria-label="Insert audio file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertMedia(file, 'audio');
          e.target.value = '';
        }}
      />
      <header className="app-header" inert={previewLocked || presenting !== null}>
        <div className="brand">
          <span className="brand-icon">
            <Layers size={22} />
          </span>
          forma
          <span className="brand-divider" />
        </div>
        <div className="document-title">
          <input
            aria-label="Presentation name"
            value={deck?.name || ''}
            onChange={(e) => deck && commit({ ...deck, name: e.target.value })}
          />
        </div>
        <div className="header-right">
          {preferences.showQuickAccess && preferences.quickCommands.length > 0 && (
            <div className="quick-actions" aria-label="Quick actions">
              {preferences.quickCommands.includes('Undo') && (
                <Tool
                  title="Undo (Ctrl/Cmd+Z)"
                  icon={<Undo2 size={17} />}
                  onClick={undo}
                  disabled={!history.current?.canUndo}
                />
              )}
              {preferences.quickCommands.includes('Redo') && (
                <Tool
                  title="Redo (Ctrl/Cmd+Shift+Z)"
                  icon={<Redo2 size={17} />}
                  onClick={redo}
                  disabled={!history.current?.canRedo}
                />
              )}
              {preferences.quickCommands.includes('Morph') && (
                <Tool
                  title="Create Morph pair"
                  icon={<Sparkles size={16} />}
                  disabled={!deck || !!busy}
                  onClick={() => {
                    setRibbon('Transitions');
                    duplicate(true);
                  }}
                >
                  Morph
                </Tool>
              )}
            </div>
          )}
          <button
            type="button"
            className="button collaborate-button"
            aria-label="Collaborate"
            disabled={!project || !!busy}
            onClick={() => setShowRoom(true)}
          >
            <Users size={15} />
            <span>
              {roomStatus.code ? `Live${roomStatus.people ? ' · ' + roomStatus.people : ''}` : 'Collaborate'}
            </span>
          </button>
          <span className="local-status">
            <ShieldCheck size={14} />
            {saved}
          </span>
          <button
            className="button"
            aria-label="Export PPTX"
            disabled={!project || !!busy}
            onClick={() => download()}
          >
            <Download size={15} />
            <span>Export PPTX</span>
          </button>
          <button
            className="button primary"
            aria-label="Present"
            disabled={!project || !!busy}
            onClick={() => setPresenting(index)}
          >
            <Play size={14} fill="currentColor" />
            <span>Present</span>
          </button>
        </div>
      </header>
      <Ribbon
        active={activeRibbon}
        contextual={contextual}
        select={selectRibbon}
        lockTabs={previewLocked}
        inert={presenting !== null}
        hiddenTabs={preferences.hiddenTabs}
        collapsed={preferences.ribbonCollapsed}
        quickAccessVisible={preferences.showQuickAccess}
        toggleQuickAccess={() =>
          setPreferences((current) => ({ ...current, showQuickAccess: !current.showQuickAccess }))
        }
        toggleCollapsed={() =>
          setPreferences((current) => ({ ...current, ribbonCollapsed: !current.ribbonCollapsed }))
        }
        customize={() => setOptions('Customize Ribbon')}
      >
        {renderRibbon()}
      </Ribbon>
      <div
        className="editor-layout"
        data-slides-open={!slidesCollapsed || undefined}
        data-sidebar-open={sidebarVisible || undefined}
        inert={presenting !== null}
        style={{ '--slides-width': `${railWidth}px`, '--editing-width': `${toolsWidth}px` } as CSSProperties}
      >
        <aside
          className="slides-sidebar"
          id="slides-sidebar"
          aria-label="Slides"
          hidden={slidesCollapsed}
          inert={previewLocked}
        >
          <SidebarResize
            side="left"
            width={railWidth}
            min={slidesMin}
            max={slidesMax}
            resize={setSlidesWidth}
            collapse={() => {
              setSlidesCollapsed(true);
              slidesToggleButton.current?.focus({ preventScroll: true });
            }}
          />
          <div className="sidebar-heading">
            <span>
              Slides <span className="muted">{deck?.slides.length || 0}</span>
            </span>
            <button aria-label="Add blank slide" disabled={!deck} onClick={addBlank}>
              <Plus size={17} />
            </button>
          </div>
          <div className="slides-list">
            {deck &&
              project &&
              slideItems.map(({ item: s, position: i, exiting }) => {
                const caption =
                  s.objects.find((o) => o.kind === 'text' && o.text)?.text?.split('\n')[0] ||
                  `Slide ${i + 1}`;
                if (exiting)
                  return (
                    <div
                      className="slide-exit"
                      aria-hidden="true"
                      key={s.id}
                      onAnimationEnd={() => finishSlideDeletion(s.id)}
                    >
                      <div>
                        <div className="slide-row current">
                          <span className="slide-number">{i + 1}</span>
                          <SlidePreview
                            slide={s}
                            width={deck.width}
                            height={deck.height}
                            assets={project.assets}
                            size={Math.max(42, railWidth - (compactSidebar ? 34 : 49))}
                          />
                          <div className="slide-caption">{caption}</div>
                        </div>
                      </div>
                    </div>
                  );
                const section = deck.sections?.find(({ id }) => id === s.sectionId);
                const collapsed = !!section && collapsedSections.includes(section.id);
                const firstInSection = !!section && deck.slides[i - 1]?.sectionId !== section.id;
                return (
                  <div key={s.id} className="slide-rail-item">
                    {firstInSection && (
                      <button
                        type="button"
                        className="slide-section-heading"
                        aria-expanded={!collapsed}
                        onContextMenu={(event) => openMenu(event, 'slide', i)}
                        onClick={() =>
                          setCollapsedSections((ids) =>
                            collapsed ? ids.filter((id) => id !== section.id) : [...ids, section.id],
                          )
                        }
                      >
                        <ChevronRight size={13} /> <span>{section.name}</span>
                        <span className="muted">
                          {deck.slides.filter(({ sectionId }) => sectionId === section.id).length}
                        </span>
                      </button>
                    )}
                    {!collapsed && (
                      <div
                        className={`slide-row ${i === index ? 'current' : ''}`}
                        key={s.id}
                        data-slide-id={s.id}
                        data-hidden={s.hidden || undefined}
                        onContextMenu={(event) => openMenu(event, 'slide', i)}
                        {...slideDragEvents(s.id, 'rail')}
                      >
                        <span className="slide-number">{i + 1}</span>
                        <button
                          aria-label={`Select slide ${i + 1}`}
                          className="slide-thumb-button"
                          onClick={() => selectSlide(i)}
                          onKeyDown={(e) => {
                            if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
                            e.preventDefault();
                            openSlideActions(i, e.currentTarget);
                          }}
                        >
                          <SlidePreview
                            slide={s}
                            width={deck.width}
                            height={deck.height}
                            assets={project.assets}
                            size={Math.max(42, railWidth - (compactSidebar ? 34 : 49))}
                          />
                        </button>
                        <div className="slide-caption">
                          <span>{caption}</span>
                          {s.hidden && (
                            <span className="hidden-slide-mark" title="Hidden in Slide Show">
                              <EyeOff size={13} />
                            </span>
                          )}
                          {s.transition !== 'none' && s.transition !== 'preserve' && (
                            <span className="morph-marker" title={transitions[s.transition].label}>
                              {s.transition === 'morph' ? (
                                <>
                                  <Sparkles size={11} />
                                  Morph
                                </>
                              ) : (
                                <Sparkles size={11} role="img" aria-label={transitions[s.transition].label} />
                              )}
                            </span>
                          )}
                          <button
                            type="button"
                            className="slide-menu-button"
                            aria-haspopup="menu"
                            aria-label={`Actions for slide ${i + 1}`}
                            onClick={(e) => openSlideActions(i, e.currentTarget)}
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="sidebar-bottom">
            <div className="slide-order-tools">
              <button
                aria-label="Move slide earlier"
                disabled={index === 0}
                onClick={() => reorderSlide(index, index - 1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                aria-label="Move slide later"
                disabled={!deck || index === deck.slides.length - 1}
                onClick={() => reorderSlide(index, index + 1)}
              >
                <ArrowDown size={14} />
              </button>
            </div>
          </div>
        </aside>
        <main
          className="workspace"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (busy || previewLocked) return;
            const files = Array.from(e.dataTransfer.files);
            const [file] = files;
            if (files.length === 1 && /\.p(?:p|o)tx$/i.test(file.name)) void importFile(file);
            else if (files.some((file) => isModelInput(file.name))) void modelFiles(files);
          }}
        >
          <div className="workspace-meta">
            <div className="workspace-meta-left">
              <button
                type="button"
                ref={slidesToggleButton}
                className="sidebar-toggle"
                aria-label={slidesCollapsed ? 'Expand slides sidebar' : 'Collapse slides sidebar'}
                title={slidesCollapsed ? 'Expand slides sidebar' : 'Collapse slides sidebar'}
                aria-expanded={!slidesCollapsed}
                aria-controls="slides-sidebar"
                disabled={previewLocked}
                onClick={() => setSlidesCollapsed(!slidesCollapsed)}
              >
                <PanelLeft size={15} />
              </button>
              <span>
                {slide && slide.transition !== 'none' && slide.transition !== 'preserve'
                  ? transitions[slide.transition].label
                  : ''}
              </span>
            </div>
            <div className="workspace-meta-right">
              <span>
                <Grid2X2 size={13} /> {deck ? `${Math.round(deck.width)} × ${Math.round(deck.height)}` : ''}
              </span>
              {!sidebarVisible && (
                <button
                  type="button"
                  ref={openSidebarButton}
                  className="sidebar-toggle"
                  aria-label="Open editing sidebar"
                  aria-expanded={false}
                  aria-controls="editor-properties"
                  disabled={previewLocked || !deck}
                  onClick={() => openPane(tab ?? (object ? 'object' : 'selection'))}
                >
                  <PanelRight size={15} />
                </button>
              )}
            </div>
          </div>
          {view === 'sorter' && project && deck ? (
            <div className="slide-sorter" aria-label="Slide sorter">
              {slideItems.map(({ item: s, position: i, exiting }) =>
                exiting ? (
                  <div
                    key={s.id}
                    className="sorter-card sorter-exit current"
                    aria-hidden="true"
                    onAnimationEnd={() => finishSlideDeletion(s.id)}
                  >
                    <SlidePreview
                      slide={s}
                      width={deck.width}
                      height={deck.height}
                      assets={project.assets}
                      size={200}
                    />
                    <span>Slide {i + 1}</span>
                  </div>
                ) : (
                  <button
                    key={s.id}
                    data-slide-id={s.id}
                    className={`sorter-card ${index === i ? 'current' : ''}`}
                    aria-label={`Sort slide ${i + 1}`}
                    data-hidden={s.hidden || undefined}
                    {...slideDragEvents(s.id, 'sorter')}
                    onClick={() => selectSlide(i)}
                    onDoubleClick={() => {
                      selectSlide(i);
                      setView('normal');
                    }}
                    onContextMenu={(e) => openMenu(e, 'slide', i)}
                    onKeyDown={(e) => {
                      if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
                      e.preventDefault();
                      openSlideActions(i, e.currentTarget);
                    }}
                  >
                    <SlidePreview
                      slide={s}
                      width={deck.width}
                      height={deck.height}
                      assets={project.assets}
                      size={200}
                    />
                    <span>
                      Slide {i + 1}
                      {s.transition === 'morph' ? ' · Morph' : ''}
                      {s.hidden ? ' · Hidden' : ''}
                    </span>
                  </button>
                ),
              )}
            </div>
          ) : project && slide ? (
            <Canvas
              key={slide.id}
              slide={slide}
              editPoints={editPoints}
              inkReplay={inkReplay}
              width={project.deck.width}
              height={project.deck.height}
              scale={scale}
              pan={slideView}
              areaRef={canvasArea}
              panning={panning}
              onPanStart={startPan}
              onPanMove={panSlide}
              onPanEnd={finishPan}
              onPastePoint={(point) => {
                pastePoint.current = point ? { id: slide.id, point } : undefined;
              }}
              xrayEnabled={!busy && !previewLocked && presenting === null && !menu}
              onCreateText={createTextAt}
              onEditData={editInsertData}
              assets={project.assets}
              selected={selected}
              selection={selection}
              onDeselect={deselectCanvas}
              onPick={(id, extend) => pickObject(id, extend, false)}
              onInspect={(id) => {
                if (selection.includes(id)) openPane('object', !sidebarVisible || tab !== 'animations');
              }}
              delayInspection={!sidebarVisible}
              onPatch={(id, change) => {
                if (
                  [change.x, change.y, change.w, change.h, change.rotation].some(
                    (value) => value !== undefined,
                  )
                )
                  keepCanvasPosition();
                patch(id, change);
              }}
              onMoveGroup={(ids, move) => {
                keepCanvasPosition();
                moveGroup(ids, move);
              }}
              onMenu={(event, id, position) => openMenu(event, id ? 'object' : 'canvas', id, position)}
              orbit={orbit}
              onModelZoom={changeModelZoom}
              drawTool={drawTool}
              ink={pen}
              eraser={eraser}
              onInk={(points) => {
                keepCanvasPosition();
                addStroke(points);
              }}
              onErase={eraseStrokes}
              onLasso={lassoInk}
              showGrid={grid}
              showGuides={guides}
              showRuler={ruler}
              smartGuides={smartGuides}
              dragAxis={dragAxis}
              editRequest={editRequest}
              textEditor={textEditor}
              spellCheck={spellCheck}
              previewing={editorPreview !== null}
              annotation={activeRibbon === 'Animations' ? selectAnimation : undefined}
              overlay={
                editorPreview === 'transition' ? (
                  <TransitionPreview
                    project={project}
                    slide={slide}
                    scale={scale}
                    settings={previewSettings}
                    reduceMotion={preferences.reduceMotion}
                    previous={deck?.slides[previousVisibleSlide()]}
                    onFinish={() => setEditorPreview(null)}
                  />
                ) : editorPreview === 'animation' ? (
                  <AnimationPreview
                    project={project}
                    slide={slide}
                    scale={scale}
                    settings={previewSettings}
                    from={previewFrom}
                  />
                ) : customPath ? (
                  <CustomPath
                    onCancel={() => setCustomPath(null)}
                    onSave={(path) => {
                      chooseAnimation('path:0', customPath.add, path, customPath.target);
                      setCustomPath(null);
                    }}
                  />
                ) : undefined
              }
            />
          ) : (
            <div className="canvas-area" ref={canvasArea} />
          )}
          <div className="canvas-caption">
            <span>
              <LockKeyhole size={12} />
              {roomStatus.code ? 'Shared with this room' : 'Your files stay in this browser'}
            </span>
            <span>
              {view === 'sorter'
                ? 'Double-click to edit a slide'
                : drawTool === 'pen'
                  ? 'Drag to draw · Hold Shift for a straight stroke'
                  : drawTool === 'eraser'
                    ? 'Drag across ink to erase'
                    : drawTool === 'lasso'
                      ? 'Draw a loop around ink · Shift adds to selection'
                      : object?.kind === 'model' && orbit
                        ? 'Drag a ring to turn along a model axis. Scroll over the model to zoom.'
                        : object?.kind === 'image' && cropImage
                          ? 'Double-click to crop the picture'
                          : 'Right-drag to pan · Double-click blank space to add text'}
            </span>
          </div>
        </main>
        <aside
          id="editor-properties"
          aria-label="Editing sidebar"
          hidden={!sidebarVisible}
          inert={previewLocked && (editorPreview !== 'animation' || tab !== 'animations')}
          className="properties"
        >
          <SidebarResize
            side="right"
            width={toolsWidth}
            min={sidebarMin}
            max={sidebarMax}
            resize={setSidebarWidth}
            collapse={collapseSidebar}
          />
          <SidebarTabs
            tabs={tabs}
            active={tab}
            select={openPane}
            close={closePane}
            collapse={collapseSidebar}
            locked={previewLocked}
            focusFallback={focusSidebarButton}
          />
          {tabs.map((pane) => (
            <div
              key={pane}
              id={`editor-pane-${pane}`}
              className="editor-pane"
              data-pane={pane}
              role="tabpanel"
              aria-labelledby={`editor-tab-${pane}`}
              hidden={tab !== pane}
            >
              {pane === 'animations' && (
                <AnimationPane
                  slide={slide}
                  selected={activeAnimation?.id}
                  choose={selectAnimation}
                  remove={removeAnimation}
                  move={moveAnimation}
                  change={(id, patch) => updateAnimation(patch, id)}
                  duplicate={duplicateAnimation}
                  options={openAnimationSettings}
                  previewing={editorPreview === 'animation'}
                  preview={(from) => togglePreview('animation', from)}
                />
              )}
              {pane === 'object' && object && (
                <>
                  <div className="property-section object-heading">
                    <div className="object-icon">
                      {object.kind === 'model' ? (
                        <Box size={22} />
                      ) : object.kind === 'text' ? (
                        <Type size={22} />
                      ) : (
                        <Square size={22} />
                      )}
                    </div>
                    <div>
                      <strong>
                        {object.kind === 'model'
                          ? '3D model'
                          : object.kind === 'text'
                            ? 'Text box'
                            : object.kind === 'unsupported'
                              ? 'Preserved object'
                              : 'Slide object'}
                      </strong>
                      <span>
                        {object.kind === 'model'
                          ? object.locked
                            ? 'Preserved native object'
                            : 'Native PowerPoint object'
                          : 'Position & appearance'}
                      </span>
                    </div>
                  </div>
                  <div className="property-section">
                    <label className="field-label">
                      Object name
                      <input
                        aria-label="Object name"
                        value={object.name}
                        disabled={locked}
                        onChange={(e) => patch(object.id, { name: e.target.value })}
                      />
                    </label>
                    {object.kind === 'model' && !object.locked && (
                      <>
                        <button className="button wide" onClick={() => textureFolderInput.current?.click()}>
                          <FolderOpen size={15} /> Add Texture Folder
                        </button>
                        {pendingTextures?.asset === object.asset && (
                          <>
                            <p className="inline-warning">
                              Texture folder selected. Choose the original FBX, OBJ, glTF, or model ZIP to
                              apply it.
                            </p>
                            <button
                              className="button wide"
                              onClick={() => repairSourceInput.current?.click()}
                            >
                              Choose Original Model
                            </button>
                          </>
                        )}
                      </>
                    )}
                    {object.warning && <p className="inline-warning">{object.warning}</p>}
                    {selectedModelStats && selectedModelWarnings.length > 0 && (
                      <p className="inline-warning model-performance-note">
                        This model may run slowly in PowerPoint. {modelSizeLabel(selectedModelStats.bytes)}{' '}
                        GLB
                        {' · '}
                        {selectedModelStats.triangles.toLocaleString()} triangles
                        {' · '}
                        {selectedModelStats.textures} textures.
                      </p>
                    )}
                    <h3>Position & size</h3>
                    <fieldset disabled={locked} className="field-grid">
                      <NumberField label="X" value={object.x} onChange={(x) => patch(object.id, { x })} />
                      <NumberField label="Y" value={object.y} onChange={(y) => patch(object.id, { y })} />
                      <NumberField
                        label="Width"
                        value={object.w}
                        min={isLine(object) ? 0 : 24}
                        onChange={(w) => patch(object.id, { w })}
                      />
                      <NumberField
                        label="Height"
                        value={object.h}
                        min={isLine(object) ? 0 : 24}
                        onChange={(h) => patch(object.id, { h })}
                      />
                      <NumberField
                        label="Frame rotation"
                        value={object.rotation}
                        min={-360}
                        max={360}
                        onChange={(rotation) => patch(object.id, { rotation })}
                      />
                    </fieldset>
                    <button
                      className="button wide"
                      disabled={locked}
                      onClick={() =>
                        patch(object.id, {
                          x: (deck!.width - object.w) / 2,
                          y: (deck!.height - object.h) / 2,
                        })
                      }
                    >
                      <AlignCenter size={14} />
                      Center on slide
                    </button>
                  </div>
                  {object.kind === 'model' && (
                    <div className="property-section">
                      <div className="section-heading">
                        <h3>3D orientation</h3>
                        <button
                          aria-label="Reset 3D view"
                          disabled={locked}
                          onClick={() => patch(object.id, { pose: [0, 0, 0] })}
                        >
                          <RotateCcw size={13} />
                        </button>
                      </div>
                      <button
                        className={`button wide ${orbit ? 'tinted' : ''}`}
                        disabled={locked}
                        onClick={() => (orbit ? setOrbit(false) : startOrbit())}
                      >
                        <Move3D size={16} />
                        {orbit ? '3D rotation mode' : 'Rotate model interactively'}
                      </button>
                      <fieldset className="field-grid three" disabled={locked}>
                        {['Pitch', 'Yaw', 'Roll'].map((label, i) => (
                          <NumberField
                            key={label}
                            label={label}
                            min={-360}
                            max={360}
                            value={object.pose?.[i] || 0}
                            onChange={(v) => {
                              const pose = [...(object.pose || [0, 0, 0])] as [number, number, number];
                              pose[i] = v;
                              patch(object.id, { pose });
                            }}
                          />
                        ))}
                      </fieldset>
                      <div className="view-presets">
                        {(
                          [
                            ['Front', [0, 0, 0]],
                            ['Back', [0, 180, 0]],
                            ['Left', [0, -90, 0]],
                            ['Right', [0, 90, 0]],
                            ['Top', [90, 0, 0]],
                            ['Iso', [25, -35, 0]],
                          ] as [string, [number, number, number]][]
                        ).map(([label, pose]) => (
                          <button key={label} disabled={locked} onClick={() => patch(object.id, { pose })}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {object.media && object.asset && (
                    <button className="button" onClick={() => setMediaDialog('playback')}>
                      Media Playback
                    </button>
                  )}
                  {(object.table || object.chart || object.link) && (
                    <div className="property-section insert-object-actions">
                      {!locked && (object.table || object.chart) && (
                        <button className="button wide" onClick={() => editInsertData(object.id)}>
                          {object.table ? 'Edit Table Cells' : 'Edit Chart Data'}
                        </button>
                      )}
                      {object.link && linkTarget && (
                        <button className="button wide" onClick={() => runInsert('link')}>
                          Edit Link
                        </button>
                      )}
                    </div>
                  )}
                  {object.kind === 'text' && (
                    <div className="property-section">
                      <h3>Text</h3>
                      <fieldset disabled={locked}>
                        <textarea
                          className="text-editor"
                          spellCheck={spellCheck}
                          aria-label="Text content"
                          value={object.text}
                          onChange={(e) => patch(object.id, { text: e.target.value })}
                        />
                        <NumberField
                          label="Font size"
                          value={fontPoints(object.fontSize)}
                          min={1}
                          max={150}
                          onChange={(points) => patch(object.id, { fontSize: pointsToPixels(points) })}
                        />
                        <div className="color-row">
                          <label>
                            Text color
                            <input
                              type="color"
                              aria-label="Text color"
                              value={object.color || '#17233b'}
                              onChange={(e) => patch(object.id, { color: e.target.value })}
                            />
                          </label>
                          <button
                            className={`button ${object.bold ? 'tinted' : ''}`}
                            onClick={() => patch(object.id, { bold: !object.bold })}
                          >
                            Bold
                          </button>
                        </div>
                      </fieldset>
                    </div>
                  )}
                  {object.kind === 'shape' && (
                    <div className="property-section">
                      <label className="color-row">
                        Fill color
                        <input
                          aria-label="Fill color"
                          type="color"
                          value={object.fill === 'transparent' ? '#ffffff' : object.fill || '#dcd7f5'}
                          disabled={locked}
                          onChange={(e) => patch(object.id, { fill: e.target.value })}
                        />
                      </label>
                    </div>
                  )}
                  <div className="property-section">
                    <h3>Arrange</h3>
                    <div className="arrange-buttons">
                      <Tool
                        title="Send backward"
                        icon={<ArrowDown size={15} />}
                        onClick={() => layer(-1)}
                        disabled={locked}
                      />
                      <Tool
                        title="Bring forward"
                        icon={<ArrowUp size={15} />}
                        onClick={() => layer(1)}
                        disabled={locked}
                      />
                      <Tool
                        title="Duplicate object"
                        icon={<Copy size={15} />}
                        onClick={duplicateObject}
                        disabled={locked}
                      />
                      <Tool
                        title={object.locked ? 'Unlock object' : 'Lock object'}
                        icon={object.locked ? <UnlockKeyhole size={15} /> : <LockKeyhole size={15} />}
                        disabled={object.kind === 'unsupported' || !!object.warning?.includes('read-only')}
                        onClick={() => patch(object.id, { locked: !object.locked })}
                      />
                      <Tool
                        title="Delete object"
                        icon={<Trash2 size={15} />}
                        onClick={removeObject}
                        disabled={locked || object.deleteBlocked}
                      />
                    </div>
                  </div>
                </>
              )}
              {pane === 'object' && !object && (
                <p className="property-section muted">Select an object to edit its properties.</p>
              )}
              {pane === 'transition' && (
                <div className="property-section">
                  <div className="transition-intro">
                    <Sparkles size={24} />
                    <h3>Slide transition</h3>
                    <p>Transitions play as you enter this slide.</p>
                  </div>
                  <div className="field-label">
                    <span>Transition</span>
                    <Dropdown<Transition>
                      label="Transition"
                      value={slide?.transition || 'preserve'}
                      disabledChoices={slide?.transitionDirty ? ['preserve'] : []}
                      choices={
                        slide?.transition === 'preserve'
                          ? [['preserve', 'Keep original'], ...transitionChoices]
                          : transitionChoices
                      }
                      groups={Object.fromEntries(
                        Object.entries(transitionGroups).flatMap(([group, values]) =>
                          Object.keys(values).map((id) => [id, group]),
                        ),
                      )}
                      onChange={chooseTransition}
                    />
                  </div>
                  <fieldset
                    disabled={!slide || slide.transition === 'preserve' || slide.transition === 'none'}
                  >
                    <NumberField
                      label="Duration (seconds)"
                      value={slide?.duration || 1}
                      min={0.1}
                      max={60}
                      onChange={(duration) => updateTransition({ duration })}
                    />
                  </fieldset>
                  <div className="morph-tip">
                    <Sparkles size={18} />
                    <strong>Create a Morph pair</strong>
                    <p>
                      Duplicate this slide with Morph, then move or turn the model on the new slide. Matching
                      object names connect the two views.
                    </p>
                    <button className="button primary wide" onClick={() => duplicate(true)}>
                      Duplicate + Morph
                    </button>
                  </div>
                  <button
                    className="button wide"
                    disabled={!slide}
                    onClick={() => togglePreview('transition')}
                  >
                    <Play size={14} />
                    Preview from previous slide
                  </button>
                  <p className="small-note">
                    Browser transitions are approximate. Export retains native PowerPoint transitions.
                  </p>
                </div>
              )}
              {pane === 'selection' && (
                <div className="layer-section">
                  <div className="section-heading">
                    <h3>
                      <Layers size={13} />
                      Selection panel
                    </h3>
                    <span>{slide?.objects.length || 0}</span>
                  </div>
                  {slide?.objects
                    .slice()
                    .reverse()
                    .map((o) => (
                      <div className="layer-entry" key={o.id}>
                        <button
                          type="button"
                          className={`layer-row ${selection.includes(o.id) ? 'active' : ''}`}
                          onClick={(event) => pickObject(o.id, event.shiftKey, true, true)}
                          title={o.groupId ? 'Grouped object' : o.name}
                        >
                          {o.kind === 'model' ? (
                            <Box size={14} />
                          ) : o.kind === 'text' ? (
                            <Type size={14} />
                          ) : (
                            <Square size={14} />
                          )}
                          <span>
                            {o.name.startsWith('!!Forma_')
                              ? o.text?.split('\n')[0] || (o.kind === 'model' ? '3D model' : 'Object')
                              : o.name}
                          </span>
                          {o.groupId && <Layers size={11} />}
                          {o.locked && <LockKeyhole size={11} />}
                        </button>
                        <button
                          type="button"
                          disabled={!editable(o)}
                          onClick={() => patch(o.id, { hidden: !o.hidden })}
                          title={o.hidden ? 'Show object' : 'Hide object'}
                          aria-label={`${o.hidden ? 'Show' : 'Hide'} ${o.name}`}
                        >
                          {o.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          type="button"
                          disabled={!editable(o)}
                          onClick={() => layer(1, [o])}
                          aria-label={`Bring ${o.name} forward`}
                          title="Bring Forward"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={!editable(o)}
                          onClick={() => layer(-1, [o])}
                          aria-label={`Send ${o.name} backward`}
                          title="Send Backward"
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </aside>
      </div>
      <footer className="statusbar" inert={previewLocked || presenting !== null}>
        <span>
          Slide {deck ? index + 1 : 0} of {deck?.slides.length || 0}
          <span className="status-description">
            <span className="status-divider" /> PowerPoint companion
          </span>
        </span>
        <div className="zoom-controls">
          <button
            aria-label="Previous slide"
            disabled={index === 0}
            onClick={() => {
              selectSlide(index - 1);
            }}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            aria-label="Next slide"
            disabled={!deck || index === deck.slides.length - 1}
            onClick={() => {
              selectSlide(index + 1);
            }}
          >
            <ChevronRight size={15} />
          </button>
          <span className="status-divider" />
          <button
            aria-label="Zoom out"
            disabled={!slide || slideView.zoom <= minSlideZoom}
            onClick={() => zoomBy(-0.1)}
          >
            <Minus size={14} />
          </button>
          <ZoomPercentage
            key={slide?.id}
            value={scale * 100}
            change={(percent) => setZoom(percent / (fitScale * 100))}
            disabled={!slide || view === 'sorter'}
          />
          <button
            aria-label="Zoom in"
            disabled={!slide || slideView.zoom >= maxSlideZoom}
            onClick={() => zoomBy(0.1)}
          >
            <Plus size={14} />
          </button>
          <button aria-label="Fit slide" disabled={!slide} onClick={fitSlide}>
            <Maximize size={14} />
          </button>
        </div>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-overlay">
          <div className="busy-card">
            <div className="spinner" />
            <strong>{busy}</strong>
            <span>Keeping your presentation on your device.</span>
          </div>
        </div>
      )}
      {exportReview && (
        <dialog
          ref={exportDialog}
          className="modal export-review"
          aria-labelledby="export-review-title"
          onCancel={(event) => {
            event.preventDefault();
            setExportReview(null);
          }}
        >
          <h2 id="export-review-title">
            <AlertTriangle size={21} /> Review 3D performance
          </h2>
          {exportReview.optimized && (
            <p role="status">
              {exportReview.savings
                ? `Smaller textures reduced the embedded 3D data by ${modelSizeLabel(exportReview.savings)}.`
                : 'Forma could not reduce the embedded texture data.'}
            </p>
          )}
          {exportReview.check.models.length || exportReview.check.crowdedSlides.length ? (
            <p>These slides may load slowly or freeze in PowerPoint, especially on integrated graphics.</p>
          ) : (
            <p>The optimized copy is within Forma’s 3D performance targets.</p>
          )}
          <ul className="export-models">
            {exportReview.check.models.map(({ key, name, stats, slides, warnings }) => (
              <li key={key}>
                <strong>{name}</strong>
                <span>
                  {modelSizeLabel(stats.bytes)} GLB · {stats.triangles.toLocaleString()} triangles ·{' '}
                  {stats.textures} textures
                </span>
                <span>
                  {slides.length === 1 ? 'Slide' : 'Slides'} {slides.join(', ')} · {warnings.join(', ')}
                </span>
              </li>
            ))}
          </ul>
          {exportReview.check.crowdedSlides.length > 0 && (
            <p>
              Combined 3D complexity is high on{' '}
              {exportReview.check.crowdedSlides.length === 1 ? 'slide' : 'slides'}{' '}
              {exportReview.check.crowdedSlides.join(', ')}.
            </p>
          )}
          {exportReview.check.models.some(({ warnings }) => warnings.includes('dense geometry')) && (
            <p>Use a lower-poly model to reduce the triangle count.</p>
          )}
          {!exportReview.optimized &&
            exportReview.check.models.some(({ stats }) => stats.canShrinkTextures) && (
              <p>
                Smaller textures can reduce file size and memory use. Forma tries a {EXPORT_TEXTURE_LIMIT}px
                cap on eligible textures in the export copy. Geometry, editing and Morph poses are preserved.
              </p>
            )}
          <div className="export-review-actions">
            <button className="button" autoFocus onClick={() => setExportReview(null)}>
              Cancel
            </button>
            {exportReview.optimized?.size ? (
              <button
                className="button primary"
                onClick={() => void writeExport(exportReview.optimized, exportReview.format)}
              >
                Export with smaller textures
              </button>
            ) : (
              <>
                <button className="button" onClick={() => void writeExport(undefined, exportReview.format)}>
                  Export at original quality
                </button>
                {!exportReview.optimized &&
                  exportReview.check.models.some(({ stats }) => stats.canShrinkTextures) && (
                    <button className="button primary" onClick={() => void prepareCompactExport()}>
                      Try smaller textures
                    </button>
                  )}
              </>
            )}
          </div>
        </dialog>
      )}
      {insertDialog && deck && slide && (
        <InsertDialog
          state={insertDialog}
          slides={deck.slides}
          comments={slide.comments ?? []}
          close={() => setInsertDialog(null)}
          save={saveInsertion}
        />
      )}
      {slideDialog && slide && (
        <SlideDialog
          key={slideDialog}
          kind={slideDialog}
          background={slide.background}
          paint={slide.backgroundPaint}
          presets={backgroundPresets}
          layouts={slideLayouts}
          zoom={slideView.zoom}
          close={() => setSlideDialog(null)}
          changeBackground={changeBackgroundFromDialog}
          applyLayout={(layout) => applyLayout(layout as SlideLayout)}
          changeZoom={setZoom}
          fit={fitSlide}
        />
      )}
      {toolsDialog === 'customLayout' && (
        <SlideToolsDialog title="Save Slide as Layout" onClose={() => setToolsDialog(null)}>
          <form
            className="insert-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveCustomLayout(String(new FormData(event.currentTarget).get('name')));
            }}
          >
            <p>
              Use the current slide’s visible text boxes as editable placeholders for new slides. Save with
              the same name to update the template.
            </p>
            <label>
              Layout name
              <input name="name" required autoFocus maxLength={100} />
            </label>
            <div className="insert-dialog-actions">
              <button className="button primary" type="submit">
                Save Layout
              </button>
            </div>
          </form>
        </SlideToolsDialog>
      )}
      {(mediaDialog === 'record' || mediaDialog === 'narration' || mediaDialog === 'camera') && (
        <RecordAudio
          mode={mediaDialog === 'record' ? 'audio' : mediaDialog}
          close={() => setMediaDialog(undefined)}
          insert={(file) => {
            setMediaDialog(undefined);
            void insertMedia(
              file,
              mediaDialog === 'camera' ? 'video' : 'audio',
              mediaDialog === 'record' ? undefined : mediaDialog,
            );
          }}
        />
      )}
      {mediaDialog === 'playback' && object?.asset && project?.assets[object.asset] && (
        <MediaSettings
          object={object}
          asset={project.assets[object.asset]}
          close={() => setMediaDialog(undefined)}
          save={async (settings, file) => {
            if (file) {
              const before = current.current;
              const bytes = new Uint8Array(await file.arrayBuffer());
              if (current.current !== before) return;
              const track = uid();
              setProject(
                (project) =>
                  project && {
                    ...project,
                    assets: { ...project.assets, [track]: makeAsset(bytes, 'text/vtt') },
                  },
              );
              settings.captions = track;
            }
            patch(object.id, { mediaPlayback: settings });
            setMediaDialog(undefined);
          }}
        />
      )}
      {toolsDialog === 'master' && deck && (
        <SlideMaster
          footer={deck.masterObjects?.find((object) => object.name === masterFooterName)?.text || ''}
          hasLogo={!!deck.masterObjects?.some((object) => object.name === masterLogoName)}
          close={() => {
            if (!busy) setToolsDialog(null);
          }}
          busy={!!busy}
          notice={notice}
          save={(footer, file, removeLogo) => void changeMaster(footer, file, removeLogo)}
        />
      )}
      {recognizedInk && (
        <SlideToolsDialog
          title={recognizedInk.math ? 'Review Recognized Math' : 'Review Recognized Text'}
          onClose={() => setRecognizedInk(undefined)}
        >
          <form
            className="insert-form"
            onSubmit={(event) => {
              event.preventDefault();
              insertRecognizedInk(String(new FormData(event.currentTarget).get('text')));
            }}
          >
            <label>
              Recognized {recognizedInk.math ? 'expression' : 'text'}
              <textarea name="text" required defaultValue={recognizedInk.text} />
            </label>
            <div className="insert-dialog-actions">
              <button className="button primary" type="submit">
                Insert
              </button>
            </div>
          </form>
        </SlideToolsDialog>
      )}
      {toolsDialog === 'spacing' && deck && (
        <ObjectSpacing
          objects={selectedObjects}
          apply={(direction, gap) =>
            mutateObjects(arrangeObjects(selectedObjects, deck.width, deck.height, direction, false, gap))
          }
          close={() => setToolsDialog(null)}
        />
      )}
      {toolsDialog === 'picture' && cropImage && (
        <SlideToolsDialog title="Remove Picture Background" onClose={() => setToolsDialog(null)}>
          <form
            className="insert-form"
            onSubmit={(event) => {
              event.preventDefault();
              void removePictureBackground(Number(new FormData(event.currentTarget).get('tolerance')));
            }}
          >
            <p>Remove colors connected to the picture’s edges. This works best with a plain background.</p>
            <label>
              Color tolerance
              <input name="tolerance" type="number" required min="1" max="140" defaultValue="40" />
            </label>
            {notice && <p role="status">{notice}</p>}
            <div className="insert-dialog-actions">
              <button className="button primary" disabled={!!busy} type="submit">
                Remove Background
              </button>
            </div>
          </form>
        </SlideToolsDialog>
      )}
      {toolsDialog === 'size' && deck && (
        <SlideSize
          deck={deck}
          close={() => setToolsDialog(null)}
          save={(width, height, fit) => {
            commit(resizeDeck(deck, width, height, fit));
            setSlideViews({});
          }}
        />
      )}
      {toolsDialog === 'theme' && deck && (
        <ThemeSettings theme={deck.theme} close={() => setToolsDialog(null)} save={changeTheme} />
      )}
      {toolsDialog === 'reuse' && (
        <ReuseSlides
          project={reuseSource}
          close={closeReuse}
          notice={notice}
          load={(file) => void loadReuse(file)}
          insert={(positions) => void addReusedSlides(positions)}
          busy={!!busy}
        />
      )}
      {toolsDialog === 'section' && deck && (
        <SlideToolsDialog
          title={sectionRename ? 'Rename Section' : 'Add Section'}
          onClose={() => setToolsDialog(null)}
        >
          <form
            className="insert-form"
            onSubmit={(event) => {
              event.preventDefault();
              sectionName(String(new FormData(event.currentTarget).get('name')), sectionRename);
              setToolsDialog(null);
            }}
          >
            <label>
              Section name
              <input
                name="name"
                required
                autoFocus
                defaultValue={
                  sectionRename
                    ? deck.sections?.find(({ id }) => id === slide?.sectionId)?.name
                    : 'Untitled Section'
                }
              />
            </label>
            <div className="insert-dialog-actions">
              <button className="button primary" type="submit">
                Save
              </button>
            </div>
          </form>
        </SlideToolsDialog>
      )}
      {(report || help) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setReport(false);
            setHelp(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={report ? 'Compatibility report' : 'Help'}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => {
                setReport(false);
                setHelp(false);
              }}
            >
              <X size={20} />
            </button>
            {report ? (
              <>
                <ShieldCheck size={28} />
                <h2>Compatibility report</h2>
                <p>
                  Original package content is retained. Supported edits update individual slide parts. Browser
                  rendering is approximate.
                </p>
                <div className="report-status">
                  <Box size={18} />
                  <span>
                    <strong>Native 3D & Morph export</strong>
                    <br />
                    Implemented using Office XML extensions. Desktop PowerPoint verification is pending.
                    PowerPoint for the web has its own feature limitations.
                  </span>
                </div>
                {issues.length ? (
                  issues.map((issue, i) => (
                    <div className="report-item" key={i}>
                      <span>Slide {issue.slide}</span>
                      <p>{issue.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="report-item">
                    No additional unsupported slide objects detected. This does not guarantee exact PowerPoint
                    rendering.
                  </p>
                )}
              </>
            ) : (
              <>
                <h2>A few useful shortcuts</h2>
                <p>
                  Import your deck and insert a model, then use Duplicate + Morph to connect two poses. Choose
                  Model Folder or a ZIP when the model uses separate textures.
                </p>
                <dl className="shortcuts">
                  {[
                    ['Undo', 'Ctrl/Cmd + Z'],
                    ['Redo', 'Ctrl/Cmd + Shift + Z'],
                    ['Export PPTX', 'Ctrl/Cmd + S'],
                    ['Open PPTX', 'Ctrl/Cmd + O'],
                    ['Copy / paste object', 'Ctrl/Cmd + C / V'],
                    ['Duplicate object', 'Ctrl/Cmd + D'],
                    ['Move selection', 'Arrow keys'],
                    ['Nudge selection by 1 px', 'Ctrl/Cmd + Arrow'],
                    ['Resize selected object', 'Shift + Arrow'],
                    ['Resize from the center', 'Option (Mac) or Ctrl (Windows) + drag handle'],
                    ['Reorder focused slide', 'Ctrl/Cmd + Up / Down'],
                    ['Move focused slide to start / end', 'Ctrl/Cmd + Shift + Up / Down'],
                    ['Pan the slide view', 'Right-drag'],
                    ['Slow pan', 'Ctrl/Cmd + right-drag'],
                    ['Zoom the slide view', 'Pinch or Ctrl/Shift + scroll'],
                    ['X-ray one layer', 'Hold Ctrl'],
                    ['X-ray two layers', 'Double-tap Ctrl or Shift and hold the second press'],
                    ['Add or edit text', 'Double-click blank space or text'],
                    ['Present', 'F5'],
                    ['Exit / deselect', 'Esc'],
                  ].map(([a, b]) => (
                    <div key={a}>
                      <dt>{a}</dt>
                      <dd>{b}</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  Hold Shift while moving an object to lock it to one axis, while dragging a corner to keep
                  its proportions, or while dragging a line endpoint to snap to 45° increments. Hold Command
                  on Mac or Alt on Windows while moving an object to bypass snapping.
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} close={closeMenu} />}
      {find && (
        <div className="modal-backdrop" onClick={() => setFind(false)}>
          <section
            className="modal find-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Find in presentation"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setFind(false);
            }}
          >
            <button className="modal-close" onClick={() => setFind(false)} aria-label="Close Find">
              <X size={18} />
            </button>
            <h2>Find and Replace</h2>
            <div className="slide-tool-presets">
              {(
                [
                  ['find', 'Find'],
                  ['text', 'Replace Text'],
                  ['font', 'Replace Fonts'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  type="button"
                  className="button"
                  key={mode}
                  aria-pressed={replaceMode === mode}
                  onClick={() => {
                    setReplaceMode(mode);
                    setReplaceStatus('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="field-label">
              <span>{replaceMode === 'font' ? 'Find font' : 'Search slide text'}</span>
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setReplaceStatus('');
                }}
                list={replaceMode === 'font' ? 'deck-fonts' : undefined}
              />
              {replaceMode === 'font' && (
                <datalist id="deck-fonts">
                  {[
                    ...new Set(
                      deck?.slides
                        .flatMap(({ objects }) =>
                          objects.filter((o) => o.kind === 'text').flatMap(objectFonts),
                        )
                        .filter(Boolean),
                    ),
                  ]
                    .sort()
                    .map((font) => (
                      <option key={font} value={font} />
                    ))}
                </datalist>
              )}
            </label>
            {replaceMode !== 'find' && (
              <label className="field-label">
                <span>Replace with</span>
                <input
                  value={replaceWith}
                  onChange={(event) => {
                    setReplaceWith(event.target.value);
                    setReplaceStatus('');
                  }}
                />
              </label>
            )}
            <div className="slide-tool-presets">
              {replaceMode !== 'font' && (
                <label className="insert-check">
                  <input
                    type="checkbox"
                    checked={matchCase}
                    onChange={(event) => setMatchCase(event.target.checked)}
                  />{' '}
                  Match case
                </label>
              )}
              {replaceMode !== 'find' && (
                <button
                  type="button"
                  className="button primary"
                  disabled={!query.trim() || (replaceMode === 'font' && !replaceWith.trim())}
                  onClick={() => replaceAcrossDeck(replaceMode === 'font')}
                >
                  Replace All
                </button>
              )}
            </div>
            {replaceStatus && <p role="status">{replaceStatus}</p>}
            {replaceMode !== 'font' && query.trim() && (
              <p>{findMatches.length ? `${findMatches.length} results` : 'No matches'}</p>
            )}
            {replaceMode !== 'font' &&
              findMatches.map(({ object, index }) => (
                <button
                  className="find-result"
                  key={object.id}
                  onClick={() => {
                    selectSlide(index);
                    setSelected(object.id);
                    openPane('object');
                    setView('normal');
                    setDrawTool('select');
                    setFind(false);
                  }}
                >
                  <strong>Slide {index + 1}</strong>
                  <span>{object.text}</span>
                </button>
              ))}
          </section>
        </div>
      )}
      {showRoom && project && (
        <CollaborationDialog
          status={roomStatus}
          create={() => connectRoom('create')}
          join={(code) => connectRoom('join', code)}
          previous={!!roomOrigin.current}
          leave={leaveRoom}
          close={() => setShowRoom(false)}
          checkpoint={(name) => roomClient.current?.checkpoint(name)}
          restore={(id) => roomClient.current?.restore(id)}
        />
      )}
      {automationOpen && deck && (
        <AutomationTools
          deck={deck}
          busy={!!busy}
          close={() => setAutomationOpen(false)}
          exportShows={() => void exportShows()}
          save={(next, status, position) => {
            commit(next);
            setAutomationOpen(false);
            setNotice(status);
            if (position !== undefined) selectSlide(position);
          }}
        />
      )}
      {accessibilityOpen && deck && (
        <AccessibilityReview
          deck={deck}
          active={index}
          close={() => setAccessibilityOpen(false)}
          jump={(position, id) => {
            setAccessibilityOpen(false);
            selectSlide(position);
            if (id) {
              setSelected(id);
              openPane('object');
            }
            setView('normal');
          }}
        />
      )}
      {printOpen && project && <PrintSlides project={project} close={() => setPrintOpen(false)} />}
      {customShowsOpen && deck && (
        <CustomShows
          deck={deck}
          close={() => setCustomShowsOpen(false)}
          save={(customShows) => commit({ ...deck, customShows, customShowsDirty: true })}
          play={(ids) => {
            setCustomShowsOpen(false);
            setShowOrder(ids);
            setPresenting(0);
          }}
        />
      )}
      {notesOpen && slide && deck && (
        <SpeakerNotesDialog
          key={slide.id}
          initial={slide.speakerNotes ?? ''}
          close={() => setNotesOpen(false)}
          save={(speakerNotes) => {
            if (speakerNotes !== (slide.speakerNotes ?? '')) {
              commit({
                ...deck,
                slides: deck.slides.map((item) =>
                  item.id === slide.id ? { ...item, speakerNotes, speakerNotesDirty: true } : item,
                ),
              });
            }
            setNotesOpen(false);
          }}
        />
      )}
      {presenting !== null && project && (
        <Presentation
          project={project}
          start={presenting}
          reduceMotion={preferences.reduceMotion}
          allowWebLinks={preferences.allowSlideShowLinks}
          presenterWindow={presenterWindow.current}
          showOrder={showOrder}
          rehearse={rehearsing ? saveRehearsal : undefined}
          useTimings={playTimings}
          onClose={closePresentation}
        />
      )}
      {options && (
        <Options
          initial={options}
          current={preferences}
          close={() => setOptions(undefined)}
          apply={(next) => {
            if (next.hiddenTabs.some((tab) => tab === ribbon)) {
              setRibbon('Home');
              setDrawTool('select');
            }
            if (next.initialView !== preferences.initialView) setView(next.initialView);
            setPreferences(next);
          }}
        />
      )}
      {showPreviewSettings && (
        <PreviewSettings
          value={previewSettings}
          onChange={setPreviewSettings}
          close={() => setShowPreviewSettings(false)}
        />
      )}
      {animationSettings && settingsAnimation && slide && (
        <AnimationSettings
          key={animationSettings.id}
          entry={settingsAnimation}
          objects={slide.objects}
          initialTab={animationSettings.tab}
          close={() => setAnimationSettings(undefined)}
          apply={(change) => updateAnimation(change, settingsAnimation.id)}
        />
      )}
    </div>
  );
}
