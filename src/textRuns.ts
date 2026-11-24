import type { FontSizeRange, SlideObject, TextParagraph } from './types';

// Keep the style and metadata of runs outside the edited range.
export function replaceTextRuns(previous: string[], next: string) {
  const original = previous.join('');
  if (!previous.length || original === next) return previous;
  if (original.length === next.length && original.toLocaleLowerCase() === next.toLocaleLowerCase()) {
    let offset = 0;
    return previous.map((part) => {
      const start = offset;
      offset += part.length;
      return next.slice(start, offset);
    });
  }
  const { start, end, nextEnd } = textChange(original, next);
  const replacement = next.slice(start, nextEnd);
  let cursor = 0;
  let inserted = false;
  return previous.map((part, index) => {
    const from = cursor;
    const to = (cursor += part.length);
    if (to < start || from > end) return part;
    const prefix = part.slice(0, Math.min(part.length, Math.max(0, start - from)));
    const suffix = part.slice(Math.min(part.length, Math.max(0, end - from)));
    if (!inserted && (to > start || index === previous.length - 1)) {
      inserted = true;
      return prefix + replacement + suffix;
    }
    return prefix + suffix;
  });
}
function textChange(original: string, next: string) {
  let start = 0;
  let end = original.length;
  let nextEnd = next.length;
  while (start < end && start < nextEnd && original[start] === next[start]) start++;
  while (end > start && nextEnd > start && original[end - 1] === next[nextEnd - 1]) {
    end--;
    nextEnd--;
  }
  return { start, end, nextEnd };
}

function replaceFontSizeRanges(
  ranges: FontSizeRange[],
  start: number,
  end: number,
  replacement: FontSizeRange[],
) {
  return [
    ...ranges.flatMap((range) => [
      ...(range.start < start ? [{ ...range, end: Math.min(start, range.end) }] : []),
      ...(range.end > end ? [{ ...range, start: Math.max(end, range.start) }] : []),
    ]),
    ...replacement,
  ]
    .sort((a, b) => a.start - b.start)
    .reduce<FontSizeRange[]>((merged, range) => {
      const last = merged.at(-1);
      if (last?.size === range.size && last.end === range.start) last.end = range.end;
      else merged.push(range);
      return merged;
    }, []);
}

export function remapFontSizeRanges(ranges: FontSizeRange[] | undefined, previous: string, next: string) {
  if (
    !ranges?.length ||
    previous === next ||
    (previous.length === next.length && previous.toLocaleLowerCase() === next.toLocaleLowerCase())
  )
    return ranges;
  const { start, end, nextEnd } = textChange(previous, next);
  const delta = nextEnd - end;
  const inherited =
    ranges.find((r) => r.start <= start && start < r.end) ??
    (start === end ? ranges.find((r) => r.end === start) : undefined);
  const remapped = ranges.flatMap((range) => [
    ...(range.start < start ? [{ ...range, end: Math.min(range.end, start) }] : []),
    ...(range.end > end
      ? [{ ...range, start: Math.max(range.start, end) + delta, end: range.end + delta }]
      : []),
  ]);
  return inherited && nextEnd > start
    ? replaceFontSizeRanges(remapped, start, nextEnd, [{ start, end: nextEnd, size: inherited.size }])
    : remapped;
}

export function fontSizedSlices(text: string, start: number, ranges: FontSizeRange[] = []) {
  const end = start + text.length;
  const slices: { text: string; size?: number }[] = [];
  let cursor = start;
  for (const range of ranges) {
    const from = Math.max(range.start, cursor);
    const to = Math.min(range.end, end);
    if (from >= to) continue;
    if (from > cursor) slices.push({ text: text.slice(cursor - start, from - start) });
    slices.push({ text: text.slice(from - start, to - start), size: range.size });
    cursor = to;
  }
  if (cursor < end || !slices.length) slices.push({ text: text.slice(cursor - start) });
  return slices;
}

export function textParagraphs(o: SlideObject): TextParagraph[] {
  const original = o.textFlow?.paragraphs;
  if (!original)
    return (o.text || '').split('\n').map((text) => ({ runs: [{ text }], left: 0, right: 0, indent: 0 }));
  if (
    !o.changed.includes('text') ||
    (o.changed.includes('replaceText') &&
      original.map(({ runs }) => runs.map(({ text }) => text).join('')).join('\n') === o.text)
  )
    return original;
  const lines = (o.text || '').split('\n');
  if (
    lines.length === original.length &&
    original.every((p) => p.runs.every((run) => !run.text.includes('\n')))
  ) {
    return original.map((p, i) => {
      const text = replaceTextRuns(
        p.runs.map((run) => run.text),
        lines[i],
      );
      return { ...p, runs: p.runs.map((run, j) => ({ ...run, text: text[j] })) };
    });
  }
  return lines.map((text, i) => {
    const base = original[i] || original[0];
    return { ...base, runs: [{ ...base?.runs[0], text }] };
  });
}

export function baseFontSizeAt(o: SlideObject, paragraphs: TextParagraph[], offset: number) {
  if (o.textFlow && !o.changed.includes('fontSize')) {
    let cursor = 0;
    for (const paragraph of paragraphs) {
      for (const run of paragraph.runs) {
        cursor += run.text.length;
        if (offset < cursor) return run.fontSize || o.fontSize || 28;
      }
      cursor++;
    }
  }
  return o.fontSize || 28;
}

export function resizeTextSelection(
  o: SlideObject,
  start: number,
  end: number,
  resize: (size: number) => number,
) {
  const replacement: FontSizeRange[] = [];
  let cursor = 0;
  for (const paragraph of textParagraphs(o)) {
    for (const run of paragraph.runs) {
      const base = (o.textFlow && !o.changed.includes('fontSize') ? run.fontSize : o.fontSize) || 28;
      for (const slice of fontSizedSlices(run.text, cursor, o.fontSizeRanges)) {
        const from = Math.max(start, cursor);
        cursor += slice.text.length;
        const to = Math.min(cursor, end);
        if (from < to) replacement.push({ start: from, end: to, size: resize(slice.size ?? base) });
      }
    }
    cursor++;
    if (cursor >= end) break;
  }
  return replaceFontSizeRanges(o.fontSizeRanges ?? [], start, end, replacement);
}
