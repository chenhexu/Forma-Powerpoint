import { replaceSlideFont, replaceSlideText } from './findReplace';
import { insertBlankSlide, newObject } from './pptx';
import { defaultTransitionOption, transitions } from './transitions';
import type { Deck, Slide, Transition } from './types';

type RecipeAction =
  | { action: 'replaceText'; find: string; replace: string; matchCase?: boolean }
  | { action: 'replaceFont'; from: string; to: string }
  | { action: 'setBackground'; color: string }
  | { action: 'setTransition'; effect: Exclude<Transition, 'preserve'>; duration?: number };

function readActions(source: string): RecipeAction[] {
  const items: unknown = JSON.parse(source);
  if (!Array.isArray(items) || !items.length || items.length > 50)
    throw new Error('Enter an array with 1 to 50 actions.');
  return items.map((entry, index) => {
    const valid =
      entry &&
      ((entry.action === 'replaceText' &&
        typeof entry.find === 'string' &&
        entry.find.trim() &&
        typeof entry.replace === 'string' &&
        (entry.matchCase === undefined || typeof entry.matchCase === 'boolean')) ||
        (entry.action === 'replaceFont' &&
          typeof entry.from === 'string' &&
          entry.from.trim() &&
          typeof entry.to === 'string' &&
          entry.to.trim()) ||
        (entry.action === 'setBackground' && /^#[\da-f]{6}$/i.test(entry.color)) ||
        (entry.action === 'setTransition' &&
          Object.hasOwn(transitions, entry.effect) &&
          (entry.duration === undefined ||
            (Number.isFinite(entry.duration) && entry.duration >= 0.1 && entry.duration <= 60))));
    if (!valid) throw new Error(`Action ${index + 1} has an unknown command or invalid values.`);
    return entry as RecipeAction;
  });
}

export function runRecipe(deck: Deck, source: string) {
  const actions = readActions(source);
  const apply = (slide: Slide, entry: RecipeAction): Slide => {
    switch (entry.action) {
      case 'setBackground':
        if (slide.background === entry.color && !slide.backgroundPaint) return slide;
        return {
          ...slide,
          background: entry.color,
          backgroundPaint: undefined,
          backgroundDirty: true,
          dirty: true,
        };
      case 'setTransition':
        return {
          ...slide,
          dirty: true,
          transitionDirty: true,
          transition: entry.effect,
          transitionOption: defaultTransitionOption(entry.effect),
          duration: entry.duration ?? slide.duration,
        };
      case 'replaceText':
      case 'replaceFont': {
        const objects = slide.objects.map((object) =>
          entry.action === 'replaceFont'
            ? replaceSlideFont(object, entry.from, entry.to)
            : replaceSlideText(object, entry.find, entry.replace, !!entry.matchCase),
        );
        return objects.some((object, i) => object !== slide.objects[i])
          ? { ...slide, objects, dirty: true }
          : slide;
      }
    }
  };
  const slides = deck.slides.map((slide) => actions.reduce(apply, slide));
  return {
    deck: { ...deck, slides },
    changed: slides.filter((item, index) => item !== deck.slides[index]).length,
  };
}

function parseCsv(source: string) {
  const input = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  function pushField() {
    row.push(field);
    field = '';
    closed = false;
  }
  function pushRow() {
    pushField();
    if (row.some((cell) => cell.trim())) rows.push(row);
    row = [];
  }
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (input[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === ',') pushField();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      pushRow();
    } else if (!field && !closed && char === '"') quoted = true;
    else if (!closed) field += char;
    else if (char.trim()) throw new Error('Check the quoted fields in the CSV.');
  }
  if (quoted) throw new Error('A CSV field is missing its closing quotation mark.');
  pushRow();
  return rows;
}

export function slidesFromCsv(deck: Deck, csv: string, titleTemplate: string, bodyTemplate: string) {
  if (csv.length > 1000000) throw new Error('Choose a CSV under 1 MB.');
  const [header, ...rows] = parseCsv(csv);
  if (!header?.length || !rows.length) throw new Error('Add a header row and at least one row of data.');
  if (rows.length > 250) throw new Error('A batch can create up to 250 slides.');
  if (rows.some((row) => row.length !== header.length))
    throw new Error('Every row must have the same number of columns.');
  const columns = header.map((column) => column.trim().toLowerCase());
  if (new Set(columns).size !== columns.length || columns.some((column) => !column))
    throw new Error('Give each column a unique name.');
  const render = (template: string, row: string[]) =>
    template.replace(/\{\{([^{}]+)\}\}/g, (_, column: string) => {
      const index = columns.indexOf(column.trim().toLowerCase());
      if (index < 0) throw new Error(`The CSV is missing the column "${column.trim()}".`);
      return row[index];
    });

  let result = deck;
  const start = deck.slides.length;
  const scale = Math.min(deck.width / 1280, deck.height / 720);
  for (const row of rows) {
    const title = render(titleTemplate, row),
      body = render(bodyTemplate, row);
    result = insertBlankSlide(result, result.slides.length - 1);
    const slide = result.slides.at(-1)!;
    const x = deck.width * 0.08,
      w = deck.width * 0.84;
    slide.objects = [
      {
        ...newObject('text', deck),
        name: 'Title',
        text: title,
        x,
        w,
        y: deck.height * 0.1,
        h: deck.height * 0.16,
        fontFamily: deck.theme?.heading,
        fontSize: Math.max(12, 54 * scale),
        bold: true,
      },
      {
        ...newObject('text', deck),
        name: 'Content',
        text: body,
        x,
        w,
        y: deck.height * 0.32,
        h: deck.height * 0.57,
        fontFamily: deck.theme?.body,
        fontSize: Math.max(10, 30 * scale),
      },
    ].filter(({ text }) => text.trim());
  }
  return { deck: result, start, count: rows.length };
}
