import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const JSZip: typeof import('jszip') = createRequire(import.meta.url)('jszip');
const fixture = process.env.FORMA_OFFICE_FIXTURE;

test('preserves an Office-authored 3D model while adding a new native Morph pair', async ({ page }) => {
  test.skip(!fixture, 'Set FORMA_OFFICE_FIXTURE to a PowerPoint-authored deck containing a native 3D model.');
  await page.goto('/editor');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await page.getByLabel('Import PPTX file').setInputFiles(fixture!);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await expect(page.getByTestId('object-model').locator('img').first()).toBeVisible();

  await page.getByRole('button', { name: 'Create Morph pair', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX' }).click();
  const original = await JSZip.loadAsync(await readFile(fixture!));
  const exported = await JSZip.loadAsync(await readFile(await (await downloaded).path()));
  for (const [part, entry] of Object.entries(original.files)) {
    if (entry.dir || /presentation\.xml(?:\.rels)?$/.test(part) || part === '[Content_Types].xml') continue;
    expect(await exported.file(part)!.async('uint8array'), part).toEqual(await entry.async('uint8array'));
  }
  const slides = await Promise.all(exported.file(/^ppt\/slides\/[^/]+\.xml$/).map((part) => part.async('string')));
  expect(slides.filter((xml) => xml.includes('<am3d:model3d'))).toHaveLength(2);
  expect(slides.filter((xml) => xml.includes('<p159:morph option="byObject"'))).toHaveLength(1);
});
