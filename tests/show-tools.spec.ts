import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const JSZip: typeof import('jszip') = createRequire(import.meta.url)('jszip');

test('generates slides, rehearses a show, and exports a native template and show batch', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await tab('File').click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
  await page.getByRole('button', { name: 'Automation', exact: true }).click();
  const automation = page.getByRole('dialog', { name: 'Automation' });
  await automation
    .getByLabel('CSV data')
    .fill('Title,Body\n"Second, slide","List, with comma"\nThird slide,Summary');
  await automation.getByRole('button', { name: 'Generate Slides', exact: true }).last().click();
  await expect(page.getByTestId('slide-canvas')).toContainText('Second, slide');
  await expect(page.locator('.slide-row[data-slide-id]')).toHaveCount(3);

  await tab('Slide Show').click();
  await page.getByRole('button', { name: 'Custom Slide Shows', exact: true }).click();
  const shows = page.getByRole('dialog', { name: 'Custom Slide Shows' });
  await shows.getByLabel('Show name').fill('Team update');
  await shows.getByRole('checkbox', { name: /3\. Third slide/ }).check();
  await shows.getByRole('checkbox', { name: /2\. Second, slide/ }).check();
  await shows.getByRole('button', { name: 'Save Show' }).click();
  await shows.getByRole('button', { name: 'Play Show' }).click();
  const nextSlide = page.getByTestId('presentation').getByRole('button', { name: 'Next slide', exact: true });
  await expect(page.getByTestId('presentation-slide')).toContainText('Third slide');
  await nextSlide.click();
  await expect(page.getByTestId('presentation-slide')).toContainText('Second, slide');
  await page.getByRole('button', { name: 'Exit presentation' }).click();

  await page.getByRole('button', { name: 'Rehearse Timings' }).click();
  await nextSlide.click();
  await page.getByRole('button', { name: 'Save Rehearsed Timings' }).click();
  await expect(page.getByTestId('presentation')).toHaveCount(0);

  await tab('File').click();
  const template = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save Template' }).click();
  const result = await template;
  expect(result.suggestedFilename()).toMatch(/\.potx$/);
  const zip = await JSZip.loadAsync(await readFile(await result.path()));
  expect(await zip.file('[Content_Types].xml')!.async('string')).toContain(
    'presentationml.template.main+xml',
  );
  expect(await zip.file('ppt/presentation.xml')!.async('string')).toContain('name="Team update"');
  expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toMatch(/advTm="[1-9][0-9]*"/);

  await page.getByRole('button', { name: 'Automation', exact: true }).click();
  await automation.getByRole('button', { name: 'Batch Export', exact: true }).click();
  const batch = page.waitForEvent('download');
  await automation.getByRole('button', { name: 'Download Shows as ZIP' }).click();
  const outer = await JSZip.loadAsync(await readFile(await (await batch).path()));
  const deck = await JSZip.loadAsync(await outer.file('1-Team update.pptx')!.async('uint8array'));
  const presentation = await deck.file('ppt/presentation.xml')!.async('string');
  expect(presentation.match(/<p:sldId\s/g)).toHaveLength(2);
});

test('prints notes pages and exposes the accessibility review', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await page.getByRole('tab', { name: 'Slide Show', exact: true }).click();
  await page.getByRole('button', { name: 'Speaker Notes', exact: true }).click();
  await page.getByLabel('Notes for this slide').fill('Private speaker note');
  await page.getByRole('button', { name: 'Save Notes' }).click();
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'Print / Save PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Speaker notes pages', exact: true }).click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open Print Preview', exact: true }).click();
  const print = await opened;
  await expect(print.getByText('Private speaker note')).toBeVisible();
  const pdf = await print.pdf({ printBackground: true });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  await print.close();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Check Accessibility', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Accessibility Checker' }).getByText('Reading order'),
  ).toBeVisible();
});
