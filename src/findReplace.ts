import { remapFontSizeRanges, replaceTextRuns } from './textRuns';
import type { SlideObject } from './types';

export function textMatches(text: string, query: string, matchCase: boolean) {
  if (!query) return [];
  const literal = Array.from(query)
    .map((character) => ('\\^$.*+?()[]{}|'.includes(character) ? '\\' + character : character))
    .join('');
  return Array.from(text.matchAll(new RegExp(literal, matchCase ? 'gu' : 'giu')));
}

export function replaceSlideText(
  object: SlideObject,
  query: string,
  replacement: string,
  matchCase: boolean,
) {
  if (object.kind !== 'text' || object.locked || object.slideNumber || !object.text) return object;
  let { text, fontSizeRanges, textFlow } = object;
  const matches = textMatches(text, query, matchCase);
  if (!matches.length) return object;
  for (const match of matches.reverse()) {
    const next = text.slice(0, match.index) + replacement + text.slice(match.index + match[0].length);
    fontSizeRanges = remapFontSizeRanges(fontSizeRanges, text, next);
    text = next;
  }
  if (text === object.text) return object;
  if (
    textFlow &&
    textFlow.paragraphs.map(({ runs }) => runs.map(({ text }) => text).join('')).join('\n') === object.text
  ) {
    textFlow = {
      ...textFlow,
      paragraphs: textFlow.paragraphs.map((paragraph) => {
        let values = paragraph.runs.map(({ text }) => text);
        let original = values.join('');
        for (const match of textMatches(original, query, matchCase).reverse()) {
          const next =
            original.slice(0, match.index) + replacement + original.slice(match.index + match[0].length);
          values = replaceTextRuns(values, next);
          original = next;
        }
        return { ...paragraph, runs: paragraph.runs.map((run, index) => ({ ...run, text: values[index] })) };
      }),
    };
  }
  return {
    ...object,
    text,
    textFlow,
    fontSizeRanges,
    changed: [...new Set([...object.changed, 'text', 'replaceText'])],
  };
}

export function resolvedFont(object: SlideObject, font?: string) {
  const family = font?.startsWith('+mj-')
    ? object.textFlow?.themeFonts.major
    : !font || font.startsWith('+mn-')
      ? (object.textFlow?.themeFonts.minor ?? 'Aptos')
      : font;
  if (!family) return;
  return (
    object.fontReplacements?.find(({ from }) => from.toLowerCase() === family.toLowerCase())?.to ?? family
  );
}

export function objectFonts(object: SlideObject) {
  const inline =
    !object.changed.includes('fontFamily') &&
    object.textFlow?.paragraphs.flatMap(({ runs }) =>
      runs.map(({ fontFamily }) => resolvedFont(object, fontFamily)),
    );
  return inline || [resolvedFont(object, object.fontFamily)];
}

export function replaceSlideFont(object: SlideObject, from: string, to: string) {
  if (
    object.kind !== 'text' ||
    object.locked ||
    !objectFonts(object).some((font) => font?.toLowerCase() === from.toLowerCase())
  )
    return object;
  if (!object.sourceXml || object.changed.includes('fontFamily')) {
    return {
      ...object,
      fontFamily: to,
      fontReplacements: undefined,
      changed: [...new Set([...object.changed, 'fontFamily'])],
    };
  }
  const remaining = (object.fontReplacements ?? []).filter(
    (rule) => rule.from.toLowerCase() !== from.toLowerCase(),
  );
  return {
    ...object,
    fontReplacements: [
      ...remaining.map((rule) => (rule.to.toLowerCase() === from.toLowerCase() ? { ...rule, to } : rule)),
      { from, to },
    ],
    changed: [...new Set([...object.changed, 'fontReplacements'])],
  };
}
