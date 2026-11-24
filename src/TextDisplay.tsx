import { resolvedFont } from './findReplace';
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { fontSizedSlices, textParagraphs } from './textRuns';
import {
  readTextSelection,
  restoreTextSelection,
  type TextEditSession,
  type TextSelection,
} from './textSelection';
import { listMarker, paragraphMargins } from './textFormat';
import type { SlideObject, TextParagraph, TextRun } from './types';

function textFrameStyle(o: SlideObject): CSSProperties {
  return {
    padding: o.textInsets?.map((inset) => `${inset}px`).join(' '),
    justifyContent:
      o.textAnchor === 'bottom' ? 'flex-end' : o.textAnchor === 'middle' ? 'center' : 'flex-start',
  };
}

function fontStack(o: SlideObject, font?: string) {
  const family = o.fontReplacements?.length
    ? resolvedFont(o, font)
    : font?.startsWith('+mj-')
      ? o.textFlow?.themeFonts.major
      : font?.startsWith('+mn-')
        ? o.textFlow?.themeFonts.minor
        : font;
  if (!family) return undefined;
  const quoted = JSON.stringify(family);
  return /^Aptos Display$/i.test(family)
    ? `${quoted}, Aptos, Arial, sans-serif`
    : /^Aptos$/i.test(family)
      ? `${quoted}, Arial, sans-serif`
      : `${quoted}, sans-serif`;
}

function textStyle(o: SlideObject): CSSProperties {
  return {
    fontSize: (o.fontSize || 28) * (o.textFlow?.fontScale || 1),
    color: o.color,
    fontWeight: o.bold ? 700 : 400,
    fontStyle: o.italic ? 'italic' : undefined,
    textDecoration: decorations(o.underline, o.strike),
    fontFamily: fontStack(o, o.fontFamily),
    textAlign: o.alignment,
    whiteSpace: o.textFlow?.noWrap && !o.changed.includes('text') ? 'pre' : undefined,
    letterSpacing: o.letterSpacing,
    lineHeight: o.lineSpacing ? o.lineSpacing * 1.14 : undefined,
  };
}

function decorations(underline?: boolean, strike?: boolean) {
  return [underline && 'underline', strike && 'line-through'].filter(Boolean).join(' ') || 'none';
}

function paragraphLineHeight(o: SlideObject, paragraph: TextParagraph) {
  if (!o.textFlow || o.changed.includes('lineSpacing')) return (o.lineSpacing ?? 1) * 1.14;
  const lineHeight = paragraph.lineHeight;
  const reduction = 1 - o.textFlow.lineReduction;
  return lineHeight?.unit === 'px'
    ? `${lineHeight.value * reduction}px`
    : reduction * (lineHeight?.value ?? 1) * 1.14;
}

function runStyle(o: SlideObject, run: TextRun, override?: number): CSSProperties {
  const changed = (key: keyof TextRun) => !o.textFlow || o.changed.includes(key);
  const size = override ?? ((changed('fontSize') ? o.fontSize : run.fontSize) || 28);
  const baseline = (changed('baseline') ? o.baseline : run.baseline) ?? 0;
  return {
    fontFamily: fontStack(o, changed('fontFamily') ? o.fontFamily : run.fontFamily),
    fontSize: `calc(${size * (o.textFlow?.fontScale || 1)}px * var(--text-fit, 1))`,
    fontWeight: (changed('bold') ? o.bold : run.bold) ? 700 : 400,
    fontStyle: (changed('italic') ? o.italic : run.italic) ? 'italic' : 'normal',
    textDecoration: decorations(
      changed('underline') ? o.underline : run.underline,
      changed('strike') ? o.strike : run.strike,
    ),
    color: changed('color') ? o.color : run.color,
    background: run.highlight,
    letterSpacing: changed('letterSpacing') ? o.letterSpacing : run.letterSpacing,
    position: baseline ? 'relative' : undefined,
    top: baseline ? `${-baseline / 100}em` : undefined,
  };
}

function displayRuns(
  o: SlideObject,
  paragraph: TextParagraph,
  offset: number,
  editing = false,
  measuring = false,
  appearance?: CSSProperties,
) {
  const chunks: { text: string; style: CSSProperties; key: string }[] = [];
  for (const run of paragraph.runs) {
    for (const slice of fontSizedSlices(run.text, offset, o.fontSizeRanges)) {
      const style = { ...runStyle(o, run, slice.size), ...appearance };
      const key = JSON.stringify(style);
      const last = chunks.at(-1);
      if (last?.key === key) last.text += slice.text;
      else chunks.push({ text: slice.text, style, key });
    }
    offset += run.text.length;
  }
  if (editing && chunks.every(({ text }) => !text)) return <br />;
  return chunks.map(({ text, style }, i) => (
    <span key={i} style={style} data-fit-sample={measuring ? text : undefined}>
      {measuring ? undefined : text || (chunks.length === 1 ? '\u00a0' : '')}
    </span>
  ));
}

export function TextDisplay({
  object: o,
  edit,
  appearance,
  paragraphAppearance,
}: {
  object: SlideObject;
  appearance?: CSSProperties;
  paragraphAppearance?: (index: number) => CSSProperties;
  edit?: {
    spellCheck: boolean;
    finish: (text: string) => void;
    session: RefObject<TextEditSession | null>;
    selection?: TextSelection;
  };
}) {
  const [revision, setRevision] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const selectionToRestore = useRef<TextSelection | undefined>(edit?.selection);
  const sessionRef = edit?.session;
  const flow = o.textFlow;
  const paragraphs =
    flow ||
    o.listStyle ||
    o.indentLevel ||
    o.baseline ||
    o.fontSizeRanges?.length ||
    paragraphAppearance ||
    edit ||
    (o.columns ?? 1) > 1
      ? textParagraphs(o)
      : null;
  const originalTitle =
    flow?.fitTitle &&
    flow.paragraphs.length === 1 &&
    !flow.paragraphs[0].runs.some((run) => run.text.includes('\n')) &&
    !o.changed.includes('fontFamily') &&
    (o.columns ?? 1) === 1
      ? flow.paragraphs[0]
      : undefined;
  useLayoutEffect(() => {
    const element = content.current;
    if (!sessionRef || !element) return;
    const session: TextEditSession = {
      id: o.id,
      read: () => readTextSelection(element),
      restore: (selection) => {
        selectionToRestore.current = selection;
        setRevision((value) => value + 1);
      },
    };
    sessionRef.current = session;
    if (selectionToRestore.current) {
      restoreTextSelection(element, selectionToRestore.current);
      selectionToRestore.current = undefined;
    } else element.focus({ preventScroll: true });
    return () => {
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [o.id, revision, sessionRef]);
  useLayoutEffect(() => {
    const sample = measure.current;
    const wrapper = frame.current;
    if (!sample || !wrapper) return;
    let active = true;
    const fit = () => {
      if (!active) return;
      wrapper.style.removeProperty('--text-fit');
      const needed = sample.scrollWidth;
      const ratio = sample.clientWidth / needed;
      // Calibrate font fallback against the imported title, independently of edits to its text.
      if (ratio >= 0.84 && ratio < 1) wrapper.style.setProperty('--text-fit', String(ratio * 0.995));
    };
    fit();
    void document.fonts.ready.then(fit);
    return () => {
      active = false;
      wrapper.style.removeProperty('--text-fit');
    };
  }, [o.w, originalTitle, flow, o.textInsets]);

  let offset = 0;
  return (
    <div ref={frame} className="text-frame" style={textFrameStyle(o)}>
      {originalTitle && (
        <div
          ref={measure}
          aria-hidden="true"
          className="text-fit-sample"
          style={{
            insetInlineStart: (o.textInsets?.[3] ?? 0) + originalTitle.left,
            width: Math.max(
              1,
              (flow?.fitWidth ?? o.w) -
                (o.textInsets?.[1] ?? 0) -
                (o.textInsets?.[3] ?? 0) -
                originalTitle.left -
                originalTitle.right,
            ),
          }}
        >
          {displayRuns({ ...o, changed: [], fontSizeRanges: undefined }, originalTitle, 0, false, true)}
        </div>
      )}
      <div
        key={revision}
        className={`text-content ${flow ? 'text-formatted' : ''}${edit ? ' inline-text' : ''}`}
        ref={content}
        role={edit ? 'textbox' : undefined}
        aria-label={edit ? 'Edit text' : undefined}
        aria-multiline={edit ? true : undefined}
        contentEditable={edit ? 'plaintext-only' : undefined}
        suppressContentEditableWarning={!!edit}
        spellCheck={edit?.spellCheck}
        onPointerDown={edit ? (event) => event.stopPropagation() : undefined}
        onBlur={edit ? (event) => edit.finish(readTextSelection(event.currentTarget).text) : undefined}
        onKeyDown={
          edit
            ? (event) => {
                event.stopPropagation();
                if (event.key === 'Escape') event.currentTarget.blur();
              }
            : undefined
        }
        style={{
          ...textStyle(o),
          ...(edit && { whiteSpace: 'pre-wrap' }),
          ...((o.columns ?? 1) > 1 && {
            height: Math.max(1, o.h - (o.textInsets?.[0] ?? 0) - (o.textInsets?.[2] ?? 0)),
            columnCount: o.columns,
            columnGap: 16,
            columnFill: 'auto',
          }),
          textDecoration: paragraphs ? undefined : decorations(o.underline, o.strike),
          ...appearance,
        }}
      >
        {edit && !o.text ? (
          <br />
        ) : paragraphs ? (
          paragraphs.map((paragraph, i) => {
            const { color, fontFamily, fontWeight, textDecoration, backgroundColor, ...paragraphMotion } =
              paragraphAppearance?.(i) ?? {};
            const paragraphText = Object.fromEntries(
              Object.entries({ color, fontFamily, fontWeight, textDecoration, backgroundColor }).filter(
                ([, value]) => value !== undefined,
              ),
            );
            const start = offset;
            offset += paragraph.runs.reduce((sum, run) => sum + run.text.length, 1);
            const spacing = (value?: TextParagraph['before']) =>
              value && (value.unit === 'px' ? value.value : `${value.value}em`);
            const bullet =
              !flow || o.changed.includes('listStyle') ? listMarker(o.listStyle, i + 1) : paragraph.bullet;
            const margins =
              !flow || o.changed.includes('listStyle') || o.changed.includes('indentLevel')
                ? paragraphMargins(o, !!bullet)
                : paragraph;
            return (
              <div
                className="text-paragraph"
                data-playback-paragraph={paragraphAppearance ? i : undefined}
                key={i}
                style={{
                  textAlign: o.changed.includes('alignment') ? o.alignment : paragraph.alignment,
                  marginInlineStart: margins.left,
                  marginInlineEnd: paragraph.right,
                  textIndent: bullet ? undefined : margins.indent,
                  paddingBlockStart: i > 0 ? spacing(paragraph.before) : undefined,
                  paddingBlockEnd: i < paragraphs.length - 1 ? spacing(paragraph.after) : undefined,
                  lineHeight: paragraphLineHeight(o, paragraph),
                  fontSize: `calc(${(paragraph.runs[0]?.fontSize || o.fontSize || 28) * (flow?.fontScale ?? 1)}px * var(--text-fit, 1))`,
                  ...paragraphMotion,
                }}
              >
                {bullet && (
                  <span
                    aria-hidden
                    data-editor-art=""
                    contentEditable={edit ? false : undefined}
                    className="text-bullet"
                    style={{ insetInlineStart: margins.indent }}
                  >
                    {bullet}
                  </span>
                )}
                {displayRuns(o, paragraph, start, !!edit, false, { ...appearance, ...paragraphText })}
              </div>
            );
          })
        ) : (
          o.text
        )}
      </div>
    </div>
  );
}
