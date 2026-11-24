import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { createProject, duplicateSlide, exportPptx, importPptx } from './pptx';
import { all, parseXml, relPath, resolvePart } from './xml';

const neverRender = () => {
  throw new Error('Unexpected model render');
};

test('stores speaker notes in native parts and preserves the slide drawing bytes', async () => {
  const project = await createProject();
  const slide = project.deck.slides[0];
  slide.speakerNotes = 'Opening: 3 < 5 & 5 > 3.\n\nNext, mention Élodie.';
  slide.speakerNotesDirty = true;

  const bytes = await exportPptx(project, project.deck, neverRender);
  const [original, exported] = await Promise.all([JSZip.loadAsync(project.original), JSZip.loadAsync(bytes)]);
  expect(await exported.file(slide.part)!.async('string')).toBe(
    await original.file(slide.part)!.async('string'),
  );
  const rels = parseXml(await exported.file(relPath(slide.part))!.async('string'));
  const noteRel = all(rels, 'Relationship').find((r) => r.getAttribute('Type')?.endsWith('/notesSlide'))!;
  expect(noteRel).toBeDefined();
  const notesPart = resolvePart(slide.part, noteRel.getAttribute('Target')!);
  const notesRels = parseXml(await exported.file(relPath(notesPart))!.async('string'));
  const masterRel = all(notesRels, 'Relationship').find((r) =>
    r.getAttribute('Type')?.endsWith('/notesMaster'),
  )!;
  expect(exported.file(resolvePart(notesPart, masterRel.getAttribute('Target')!))).not.toBeNull();

  const opened = await importPptx(bytes, 'Speaker Notes');
  expect(opened.deck.slides[0].speakerNotes).toBe(slide.speakerNotes);
  const untouched = await exportPptx(opened, opened.deck, neverRender);
  expect(untouched).toBe(bytes);

  const duplicate = duplicateSlide(opened.deck, 0, false);
  duplicate.slides[1].speakerNotes = 'Only on the duplicated slide.';
  duplicate.slides[1].speakerNotesDirty = true;
  const returned = await importPptx(await exportPptx(opened, duplicate, neverRender), 'Copied');
  expect(returned.deck.slides.map((s) => s.speakerNotes)).toEqual([
    slide.speakerNotes,
    'Only on the duplicated slide.',
  ]);
});
