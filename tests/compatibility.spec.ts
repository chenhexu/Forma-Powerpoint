import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { prepareCompatibilityDeck as prepareFixture } from './compatibilityDeck';

const JSZip: typeof import('jszip') = createRequire(import.meta.url)('jszip');

test('exports and reimports the PowerPoint compatibility deck', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/editor');
  const manifest = await page.evaluate(async () => {
    const fixture = '/tests/compatibilityDeck.ts';
    const storage = '/src/storage.ts';
    const { prepareCompatibilityDeck } = (await import(/* @vite-ignore */ fixture)) as {
      prepareCompatibilityDeck: typeof prepareFixture;
    };
    const { saveProject } = await import(/* @vite-ignore */ storage);
    const { project, manifest } = await prepareCompatibilityDeck();
    await saveProject(project);
    return manifest;
  });

  await page.reload();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Forma PowerPoint Compatibility');
  await expect(page.getByTestId('slide-canvas').getByText('Forma compatibility suite')).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const file = testInfo.outputPath('Forma PowerPoint Compatibility.pptx');
  await (await pending).saveAs(file);
  const data = await readFile(file);
  const output = process.env.FORMA_COMPAT_OUTPUT;
  if (output) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, data);
    await writeFile(testInfo.outputPath('manifest.json'), JSON.stringify(manifest, null, 2));
  }

  const zip = await JSZip.loadAsync(data, { checkCRC32: true });
  const count = (pattern: RegExp) => zip.file(pattern).length;
  expect(count(/^ppt\/slides\/[^/]+\.xml$/)).toBe(manifest.length);
  expect(count(/^ppt\/charts\/[^/]+\.xml$/)).toBe(4);
  expect(count(/^ppt\/embeddings\/[^/]+\.xlsx$/)).toBe(4);
  expect(count(/^ppt\/media\/[^/]+\.glb$/)).toBe(1);
  expect(count(/^ppt\/media\/[^/]+\.mp4$/)).toBe(1);
  expect(count(/^ppt\/media\/[^/]+\.wav$/)).toBe(1);
  expect(count(/^ppt\/comments\/[^/]+\.xml$/)).toBe(1);
  const slides = (
    await Promise.all(zip.file(/^ppt\/slides\/[^/]+\.xml$/).map((part) => part.async('string')))
  ).join('');
  expect(slides.match(/<am3d:model3d\b/g)).toHaveLength(2);
  expect(slides).toContain('<a:alpha val="38000"');
  expect(slides).toContain('evt="onClick"');
  expect(slides).toContain('uri="http://schemas.openxmlformats.org/drawingml/2006/table"');
  expect(slides).toContain('advTm="3000"');
  expect(slides).toMatch(/<p:checker\b[^>]*dir="horz"/);
  expect(slides).toMatch(/<p:comb\b[^>]*dir="horz"/);
  expect(slides).not.toMatch(/<a:t\b[^>]*xml:space=/);

  const saved = await page.evaluate(
    async (bytes) => {
      const pptx = '/src/pptx.ts';
      const { importPptx } = (await import(/* @vite-ignore */ pptx)) as typeof import('../src/pptx');
      const { deck } = await importPptx(new Uint8Array(bytes), 'Compatibility');
      return deck.slides.map((slide) => ({
        transition: slide.transition,
        main: (slide.animations ?? []).filter((effect) => !effect.trigger).map(({ effect }) => effect),
        triggers: (slide.animations ?? []).filter((effect) => effect.trigger).length,
      }));
    },
    [...data],
  );
  expect(saved).toEqual(
    manifest.map(({ transition, main, trigger }) => ({
      transition,
      main,
      triggers: trigger ? 1 : 0,
    })),
  );
});
