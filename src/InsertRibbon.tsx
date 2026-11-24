import {
  ArrowRightToLine,
  BarChart3,
  Box,
  Calendar,
  CalendarClock,
  Camera,
  ChevronDown,
  ClipboardPaste,
  Clock,
  Copy,
  Crop,
  Film,
  FileBox,
  FileImage,
  FileMusic,
  FileVideo,
  FolderOpen,
  Grid2X2,
  Hash,
  Image,
  Link2,
  Library,
  List,
  MessageSquarePlus,
  Music2,
  Mic,
  Monitor,
  Network,
  PanelBottom,
  Plus,
  Repeat,
  Shapes,
  Sigma,
  Table2,
  Type,
  CalendarDays,
  TextCursorInput,
  Triangle,
  Waypoints,
  Workflow,
  Blocks,
  PanelsTopLeft,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Dropdown, RibbonGroup } from './Ribbon';
import { chartPreviews, shapePreviews, slideLayoutPreviews } from './RibbonPreviews';

export type InsertCommand =
  | 'new'
  | 'duplicate'
  | 'reuse'
  | 'table'
  | 'customTable'
  | 'pasteTable'
  | 'picture'
  | 'capture'
  | 'clip'
  | 'pastePicture'
  | 'model'
  | 'folder'
  | 'shape'
  | 'diagram'
  | 'chart'
  | 'zoom'
  | 'link'
  | 'action'
  | 'comment'
  | 'text'
  | 'footer'
  | 'wordArt'
  | 'date'
  | 'number'
  | 'equation'
  | 'symbol'
  | 'video'
  | 'audio'
  | 'online';

type Choices = ReadonlyArray<readonly [string, string]>;
export const diagrams = [
  ['list', 'Vertical list'],
  ['process', 'Basic process'],
  ['cycle', 'Basic cycle'],
  ['hierarchy', 'Organization chart'],
  ['relationship', 'Radial relationship'],
  ['matrix', 'Basic matrix'],
  ['pyramid', 'Pyramid list'],
] as const;

export const equations = [
  ['custom', 'Insert new equation'],
  ['circle', 'Area of a circle'],
  ['binomial', 'Binomial theorem'],
  ['euler', 'Euler’s formula'],
  ['pythagorean', 'Pythagorean theorem'],
  ['quadratic', 'Quadratic formula'],
  ['series', 'Taylor series'],
] as const;

export const chartTypes = [
  ['column', 'Clustered column'],
  ['bar', 'Clustered bar'],
  ['line', 'Line with markers'],
  ['pie', 'Pie'],
  ['stacked', 'Stacked column'],
  ['combo', 'Column and line'],
] as const;

export const symbols = [
  ['©', '© Copyright'],
  ['®', '® Registered'],
  ['™', '™ Trademark'],
  ['°', '° Degree'],
  ['±', '± Plus or minus'],
  ['×', '× Multiply'],
  ['÷', '÷ Divide'],
  ['≈', '≈ Approximately equal'],
  ['≠', '≠ Not equal'],
  ['≤', '≤ Less than or equal'],
  ['≥', '≥ Greater than or equal'],
  ['π', 'π Pi'],
  ['Ω', 'Ω Omega'],
  ['∞', '∞ Infinity'],
  ['→', '→ Right arrow'],
  ['✓', '✓ Check mark'],
] as const;

const diagramPreviews = {
  list: <List size={18} />,
  process: <Workflow size={18} />,
  cycle: <Repeat size={18} />,
  hierarchy: <Network size={18} />,
  relationship: <Waypoints size={18} />,
  matrix: <Grid2X2 size={18} />,
  pyramid: <Triangle size={18} />,
};

const equationPreviews = {
  custom: <Plus size={17} />,
  circle: 'πr²',
  binomial: '(a+b)ⁿ',
  euler: 'e^(iπ)',
  pythagorean: 'a²+b²',
  quadratic: '√Δ',
  series: '∑',
};

function InsertButton({
  label,
  icon,
  action,
  disabled,
  title,
}: {
  label: string;
  icon: ReactNode;
  action?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="tool insert-tool"
      title={title ?? label}
      disabled={disabled}
      onClick={action}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

const tableColumns = 8;
const tableRows = 6;

function TableSizeGrid({ choose }: { choose: (value: string) => void }) {
  const [dimensions, setDimensions] = useState({ columns: 1, rows: 1 });
  return (
    <div className="table-size-picker">
      <span>
        {dimensions.columns} × {dimensions.rows} Table
      </span>
      <div
        role="group"
        aria-label="Quick table sizes"
        className="table-size-grid"
        onKeyDown={(event) => {
          const cell = (event.target as HTMLButtonElement).dataset.cell;
          if (!cell) return;
          const [column, row] = cell.split('x').map(Number);
          const next = {
            ArrowLeft: [column - 1, row],
            ArrowRight: [column + 1, row],
            ArrowUp: [column, row - 1],
            ArrowDown: [column, row + 1],
          }[event.key];
          if (!next) return;
          const button = event.currentTarget.querySelector<HTMLButtonElement>(
            `[data-cell="${next[0]}x${next[1]}"]`,
          );
          if (!button) return;
          event.preventDefault();
          event.stopPropagation();
          button.focus();
        }}
      >
        {Array.from({ length: tableColumns * tableRows }, (_, i) => {
          const columns = (i % tableColumns) + 1,
            rows = Math.floor(i / tableColumns) + 1;
          const value = `${columns}x${rows}`;
          return (
            <button
              key={value}
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-cell={value}
              aria-label={`${columns} columns × ${rows} rows`}
              data-highlighted={columns <= dimensions.columns && rows <= dimensions.rows}
              onPointerEnter={() => setDimensions({ columns, rows })}
              onFocus={() => setDimensions({ columns, rows })}
              onClick={() => choose(value)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function InsertRibbon({
  enabled,
  linkable,
  layouts,
  shapes,
  act: runCommand,
}: {
  enabled: boolean;
  linkable: boolean;
  layouts: Choices;
  shapes: Choices;
  act: (command: InsertCommand, value?: string) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [width, setWidth] = useState(() => window.innerWidth);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (advanced) dialog.current?.showModal();
  }, [advanced]);
  function dismiss() {
    dialog.current?.close();
    setAdvanced(false);
  }
  function act(command: InsertCommand, value?: string) {
    if (advanced) dismiss();
    runCommand(command, value);
  }
  const command = (label: string, icon: ReactNode, choice: InsertCommand) => (
    <InsertButton label={label} icon={icon} disabled={!enabled} action={() => act(choice)} />
  );
  function menu(
    label: string,
    icon: ReactNode,
    choices: Choices,
    select: (value: string) => void,
    options?: {
      groups?: Record<string, string>;
      caption?: string;
      disabledChoices?: string[];
      previews?: Record<string, ReactNode>;
      leading?: (choose: (value: string) => void) => ReactNode;
    },
  ) {
    return (
      <Dropdown
        label={label}
        caption={options?.caption}
        icon={icon}
        choices={choices}
        onChange={select}
        disabled={!enabled}
        groups={options?.groups}
        disabledChoices={options?.disabledChoices}
        previews={options?.previews}
        leading={options?.leading}
      />
    );
  }
  const groups: [number, ReactNode][] = [
    [
      0,
      <RibbonGroup key="Slides" name="Slides">
        {menu(
          'New Slide',
          <Plus size={19} />,
          [...layouts, ['duplicate', 'Duplicate Selected Slide'], ['reuse', 'Reuse Slides']],
          (value) => (value === 'duplicate' || value === 'reuse' ? act(value) : act('new', value)),
          {
            groups: { title: 'Slide layouts', duplicate: 'More options', reuse: 'More options' },
            previews: {
              ...slideLayoutPreviews,
              duplicate: <Copy size={17} />,
              reuse: <FolderOpen size={17} />,
            },
          },
        )}
      </RibbonGroup>,
    ],
    [
      300,
      <RibbonGroup key="Tables" name="Tables">
        {menu(
          'Table',
          <Table2 size={19} />,
          [
            ['custom', 'Insert Table…'],
            ['paste', 'Paste table data…'],
            ['excel', 'Excel Spreadsheet'],
          ],
          (value) =>
            value === 'custom'
              ? act('customTable')
              : value === 'paste'
                ? act('pasteTable')
                : act('table', value),
          {
            groups: {
              custom: 'More options',
              paste: 'More options',
              excel: 'More options',
            },
            disabledChoices: ['excel'],
            leading: (choose) => <TableSizeGrid choose={choose} />,
            previews: {
              custom: <Table2 size={17} />,
              paste: <ClipboardPaste size={17} />,
              excel: <Grid2X2 size={17} />,
            },
          },
        )}
      </RibbonGroup>,
    ],
    [
      530,
      <RibbonGroup key="Images" name="Images">
        {menu(
          'Pictures',
          <Image size={19} />,
          [
            ['file', 'Picture from File…'],
            ['clipboard', 'Paste Picture'],
          ],
          (value) => act(value === 'file' ? 'picture' : 'pastePicture'),
          { previews: { file: <FileImage size={17} />, clipboard: <ClipboardPaste size={17} /> } },
        )}
        {menu(
          'Screenshot',
          <Camera size={19} />,
          [
            ['capture', 'Capture window, tab, or screen…'],
            ['clip', 'Screen Clipping…'],
            ['file', 'Screenshot from File…'],
          ],
          (value) => act(value === 'file' ? 'picture' : value === 'clip' ? 'clip' : 'capture'),
          {
            caption: 'Capture',
            previews: {
              capture: <Monitor size={17} />,
              clip: <Crop size={17} />,
              file: <FileImage size={17} />,
            },
          },
        )}
        {menu(
          '3D Models',
          <Box size={19} />,
          [
            ['file', 'Insert 3D'],
            ['folder', 'Model Folder'],
          ],
          (value) => act(value === 'file' ? 'model' : 'folder'),
          { previews: { file: <Box size={17} />, folder: <FolderOpen size={17} /> } },
        )}
      </RibbonGroup>,
    ],
    [
      730,
      <RibbonGroup key="Illustrations" name="Illustrations">
        {menu('Shapes', <Shapes size={19} />, shapes, (value) => act('shape', value), {
          groups: {
            line: 'Lines',
            rect: 'Rectangles',
            roundRect: 'Rectangles',
            ellipse: 'Basic shapes',
            triangle: 'Basic shapes',
            diamond: 'Basic shapes',
            hexagon: 'Basic shapes',
            parallelogram: 'Basic shapes',
            rightArrow: 'Block arrows',
            downArrow: 'Block arrows',
            chevron: 'Block arrows',
            flowChartDecision: 'Flowchart',
            star5: 'Stars',
          },
          previews: shapePreviews(shapes),
        })}
        {menu('SmartArt', <Network size={19} />, diagrams, (value) => act('diagram', value), {
          groups: { list: 'Editable diagram presets' },
          previews: diagramPreviews,
        })}
        {menu('Chart', <BarChart3 size={19} />, chartTypes, (value) => act('chart', value), {
          previews: chartPreviews,
        })}
      </RibbonGroup>,
    ],
    [
      1040,
      <RibbonGroup key="Links" name="Links">
        {menu('Zoom', <PanelsTopLeft size={19} />, [['slide', 'Slide navigation link…']], () => act('zoom'), {
          previews: { slide: <Link2 size={17} /> },
        })}
        {command('Link', <Link2 size={18} />, 'link')}
        <InsertButton
          label="Action"
          icon={<ArrowRightToLine size={19} />}
          disabled={!enabled || !linkable}
          title="Select an object to assign a slide action"
          action={() => act('action')}
        />
      </RibbonGroup>,
    ],
    [
      1130,
      <RibbonGroup key="Comments" name="Comments">
        {command('Comment', <MessageSquarePlus size={19} />, 'comment')}
      </RibbonGroup>,
    ],
    [
      1300,
      <RibbonGroup key="Text" name="Text">
        {width >= 1300 && command('Text Box', <Type size={19} />, 'text')}
        {command('Header & Footer', <PanelBottom size={19} />, 'footer')}
        {menu(
          'WordArt',
          <TextCursorInput size={19} />,
          [
            ['accent', 'Accent heading'],
            ['serif', 'Serif italic'],
            ['bold', 'Bold display'],
          ],
          (value) => act('wordArt', value),
          {
            previews: {
              accent: <span className="menu-wordart-accent">Aa</span>,
              serif: <span className="menu-wordart-serif">Aa</span>,
              bold: <strong>Aa</strong>,
            },
          },
        )}
        {menu(
          'Date & Time',
          <CalendarDays size={19} />,
          [
            ['long', 'Long date'],
            ['short', 'Short date'],
            ['time', 'Time'],
            ['both', 'Date and time'],
          ],
          (value) => act('date', value),
          {
            previews: {
              long: <CalendarDays size={17} />,
              short: <Calendar size={17} />,
              time: <Clock size={17} />,
              both: <CalendarClock size={17} />,
            },
          },
        )}
        {command('Slide Number', <Hash size={19} />, 'number')}
      </RibbonGroup>,
    ],
    [
      1410,
      <RibbonGroup key="Symbols" name="Symbols">
        {menu('Equation', <Sigma size={19} />, equations, (value) => act('equation', value), {
          previews: equationPreviews,
        })}
        {menu(
          'Symbol',
          <span className="symbol-icon" aria-hidden="true">
            Ω
          </span>,
          symbols,
          (value) => act('symbol', value),
          {
            previews: Object.fromEntries(
              symbols.map(([glyph]) => [glyph, <span className="menu-symbol">{glyph}</span>]),
            ),
          },
        )}
      </RibbonGroup>,
    ],
    [
      880,
      <RibbonGroup key="Media" name="Media">
        {menu(
          'Video',
          <Film size={19} />,
          [
            ['file', 'Video from File…'],
            ['online', 'Online video link…'],
            ['stock', 'Stock Videos'],
          ],
          (value) => act(value === 'file' ? 'video' : 'online'),
          {
            disabledChoices: ['stock'],
            previews: {
              file: <FileVideo size={17} />,
              online: <Link2 size={17} />,
              stock: <Library size={17} />,
            },
          },
        )}
        {menu(
          'Audio',
          <Music2 size={19} />,
          [
            ['file', 'Audio from File…'],
            ['record', 'Record Audio'],
            ['browser', 'Audio Browser'],
          ],
          (value) => act('audio', value),
          {
            disabledChoices: ['browser'],
            previews: {
              file: <FileMusic size={17} />,
              record: <Mic size={17} />,
              browser: <Library size={17} />,
            },
          },
        )}
      </RibbonGroup>,
    ],
  ];
  return (
    <>
      {groups.filter(([minWidth]) => width >= minWidth).map(([, group]) => group)}
      {width < 1300 && (
        <RibbonGroup name="Text">{command('Text Box', <Type size={19} />, 'text')}</RibbonGroup>
      )}
      <RibbonGroup name="More">
        <button
          type="button"
          className="tool insert-tool"
          aria-expanded={advanced}
          aria-haspopup="dialog"
          title="More Insert"
          onClick={() => setAdvanced(true)}
        >
          <ChevronDown size={19} />
          <span>More Insert</span>
        </button>
      </RibbonGroup>
      {advanced && (
        <dialog
          ref={dialog}
          className="modal insert-dialog insert-overflow"
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault();
            dismiss();
          }}
        >
          <header className="transition-gallery-header">
            <h2 id={titleId}>More Insert</h2>
            <button type="button" className="tool" aria-label="Close More Insert" onClick={dismiss}>
              <X size={18} />
            </button>
          </header>
          <div className="insert-ribbon insert-overflow-groups">
            {groups.filter(([minWidth]) => width < minWidth).map(([, group]) => group)}
            <RibbonGroup name="Add-ins and objects">
              <InsertButton
                label="Get Add-ins"
                icon={<Blocks size={19} />}
                disabled
                title="Microsoft 365 add-ins are unavailable in Forma"
              />
              <InsertButton
                label="My Add-ins"
                icon={<FileBox size={19} />}
                disabled
                title="Microsoft 365 add-ins are unavailable in Forma"
              />
              <InsertButton
                label="Object"
                icon={<ClipboardPaste size={19} />}
                disabled
                title="OLE object insertion is unavailable in the browser"
              />
            </RibbonGroup>
          </div>
        </dialog>
      )}
    </>
  );
}
