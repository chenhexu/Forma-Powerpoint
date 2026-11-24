import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  BringToFront,
  ChartBar,
  ChartLine,
  ChartNoAxesColumnIncreasing,
  ChartPie,
  Columns2,
  Columns3,
  FileText,
  Globe,
  Presentation,
  RotateCcw,
  RotateCw,
  SendToBack,
  SkipBack,
  SkipForward,
  Square,
  Zap,
} from 'lucide-react';

// Positions are percentages of a slide. The first region represents the title.
const layouts: Record<string, [number, number, number, number][]> = {
  title: [
    [15, 37, 70, 13],
    [27, 61, 46, 9],
  ],
  content: [
    [10, 14, 58, 11],
    [10, 34, 80, 52],
  ],
  section: [
    [10, 51, 64, 13],
    [10, 73, 47, 10],
  ],
  'two-content': [
    [10, 14, 58, 11],
    [10, 34, 37, 52],
    [53, 34, 37, 52],
  ],
  comparison: [
    [10, 14, 58, 11],
    [10, 34, 37, 9],
    [53, 34, 37, 9],
    [10, 50, 37, 36],
    [53, 50, 37, 36],
  ],
  'title-only': [[10, 14, 58, 11]],
  blank: [],
  'content-caption': [
    [10, 19, 29, 11],
    [10, 41, 29, 34],
    [45, 19, 45, 63],
  ],
  'picture-caption': [
    [10, 19, 29, 11],
    [10, 41, 29, 34],
    [45, 19, 45, 63],
  ],
};

export const slideLayoutPreviews = Object.fromEntries(
  Object.entries(layouts).map(([layout, regions]) => [
    layout,
    <span className="layout-preview" data-layout={layout}>
      {regions.map(([x, y, width, height], index) => (
        <span key={index} style={{ left: x + '%', top: y + '%', width: width + '%', height: height + '%' }} />
      ))}
    </span>,
  ]),
);

export const shapePreviews = (choices: ReadonlyArray<readonly [string, string]>) =>
  Object.fromEntries(choices.map(([shape]) => [shape, <span className={`shape-icon shape-${shape}`} />]));

export const chartPreviews = {
  column: <ChartNoAxesColumnIncreasing size={18} />,
  bar: <ChartBar size={18} />,
  line: <ChartLine size={18} />,
  pie: <ChartPie size={18} />,
};

export const paragraphAlignmentPreviews = {
  left: <AlignLeft size={17} />,
  center: <AlignCenter size={17} />,
  right: <AlignRight size={17} />,
  justify: <AlignJustify size={17} />,
};

export const verticalAlignmentPreviews = {
  top: <AlignStartHorizontal size={17} />,
  middle: <AlignCenterHorizontal size={17} />,
  bottom: <AlignEndHorizontal size={17} />,
};

export const textColumnPreviews = {
  '1': <FileText size={17} />,
  '2': <Columns2 size={17} />,
  '3': <Columns3 size={17} />,
};

export const objectAlignmentPreviews = {
  left: <AlignStartVertical size={17} />,
  center: <AlignCenterVertical size={17} />,
  right: <AlignEndVertical size={17} />,
  ...verticalAlignmentPreviews,
  horizontal: <AlignHorizontalDistributeCenter size={17} />,
  vertical: <AlignVerticalDistributeCenter size={17} />,
};

export const alignmentReferencePreviews = {
  selection: <AlignCenterVertical size={17} />,
  slide: <Presentation size={17} />,
};

export const arrangePreviews = {
  front: <BringToFront size={17} />,
  forward: <ArrowUp size={17} />,
  back: <SendToBack size={17} />,
  backward: <ArrowDown size={17} />,
  clockwise: <RotateCw size={17} />,
  counterclockwise: <RotateCcw size={17} />,
};

export const casePreviews = {
  sentence: 'Aa',
  lower: 'aa',
  upper: 'AA',
  title: 'Aa Aa',
  toggle: 'aA',
};

export const characterSpacingPreviews = Object.fromEntries(
  [-1, 0, 1, 2].map((spacing) => [
    spacing,
    <span className="menu-type-sample" style={{ letterSpacing: spacing * 2 }}>
      AV
    </span>,
  ]),
);

export const lineSpacingPreviews = Object.fromEntries(
  [1, 1.15, 1.5, 2, 2.5, 3].map((spacing) => [
    spacing,
    <span className="line-spacing-preview" style={{ gap: spacing * 3 }}>
      <span />
      <span />
      <span />
    </span>,
  ]),
);

export function ShapeSwatch({ fill, outline }: { fill: string; outline?: string }) {
  return <span className="menu-shape-swatch" style={{ backgroundColor: fill, borderColor: outline }} />;
}

export const outlinePreviews = {
  none: <Ban size={17} />,
  ...Object.fromEntries(
    [1, 2, 4].map((width) => [
      width,
      <span className="menu-outline-sample" style={{ borderTopWidth: width }} />,
    ]),
  ),
  solid: <span className="menu-outline-sample" />,
  dash: <span className="menu-outline-sample" style={{ borderTopStyle: 'dashed' }} />,
  dot: <span className="menu-outline-sample" style={{ borderTopStyle: 'dotted' }} />,
};

export const linkTargetPreviews = {
  web: <Globe size={17} />,
  slide: <Presentation size={17} />,
  action: <Zap size={17} />,
};

export const slideActionPreviews = {
  nextslide: <ArrowRight size={17} />,
  previousslide: <ArrowLeft size={17} />,
  firstslide: <SkipBack size={17} />,
  lastslide: <SkipForward size={17} />,
  endshow: <Square size={17} />,
};
