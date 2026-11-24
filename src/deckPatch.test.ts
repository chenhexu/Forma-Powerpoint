import { expect, it } from 'vitest';
import { applyDeckPatch, diffDeck } from './deckPatch.mjs';
import type { Deck, Slide } from './types';

function slide(id: string): Slide {
  return {
    id,
    part: `ppt/slides/${id}.xml`,
    sourceXml: '',
    background: '#ffffff',
    duration: 1,
    transition: 'none',
    dirty: false,
    warnings: [],
    objects: [],
  };
}

it('merges slide, object, and comment updates without discarding existing native export flags', () => {
  const first = slide('first');
  first.objects = [
    {
      id: 'o',
      kind: 'text',
      name: 'Text',
      text: 'Before',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      sourceXml: '<p:sp/>',
      changed: [],
    },
  ];
  const base: Deck = { name: 'Before', width: 1280, height: 720, slides: [first, slide('second')] };
  const a = structuredClone(base),
    b = structuredClone(base);
  a.slides[0].objects[0].x = 25;
  a.slides[0].objects[0].changed = ['x'];
  a.slides[0].comments = [{ id: 'a', author: 'A', date: '', text: 'First thread' }];
  a.slides.splice(1, 0, slide('added by A'));
  b.slides[0].objects[0].text = 'After';
  b.slides[0].objects[0].changed = ['text'];
  b.slides[0].comments = [{ id: 'b', author: 'B', date: '', text: 'Second thread' }];
  b.slides.push(slide('added by B'));
  const result = applyDeckPatch(applyDeckPatch(base, diffDeck(base, a)), diffDeck(base, b));
  expect(result.slides.map(({ id }) => id)).toEqual(['first', 'added by A', 'second', 'added by B']);
  expect(result.slides[0].objects[0]).toMatchObject({ x: 25, text: 'After', changed: ['x', 'text'] });
  expect(result.slides[0].comments?.map(({ id }) => id)).toEqual(['a', 'b']);
});

it('keeps one slide when editors remove different slides concurrently', () => {
  const base: Deck = { name: '', width: 1, height: 1, slides: [slide('a'), slide('b')] };
  const a = { ...base, slides: [base.slides[0]] };
  const b = { ...base, slides: [base.slides[1]] };
  expect(applyDeckPatch(a, diffDeck(base, b)).slides).toHaveLength(1);
});
