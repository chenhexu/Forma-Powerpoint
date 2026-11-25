import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const JSZip: typeof import('jszip') = createRequire(import.meta.url)('jszip');

async function blank(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
}

async function insertShape(page: Page, label: string) {
  await page.locator('.ribbon').getByRole('tabpanel').getByRole('button', { name: 'Insert shape', exact: true }).click();
  await page
    .getByRole('menu', { name: 'Insert shape', exact: true })
    .getByRole('menuitem', { name: label, exact: true })
    .click();
}

async function midpoint(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
  modifiers: string[] = [],
) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
}

async function exportDeck(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const path = await (await pending).path();
  const zip = await JSZip.loadAsync(await readFile(path));
  return { path, slide: await zip.file('ppt/slides/slide1.xml')!.async('string') };
}

test('selects a line by its stroke, edits both slopes and round-trips a native line', async ({ page }) => {
  await blank(page);
  await insertShape(page, 'Line');
  const canvas = page.getByTestId('slide-canvas');
  const line = canvas.getByTestId('object-shape');
  const frame = (await line.boundingBox())!;
  const from = line.getByRole('button', { name: 'Move line start', exact: true });
  const to = line.getByRole('button', { name: 'Move line end', exact: true });
  await expect(from).toBeVisible();
  await expect(line.locator('.selection-outline')).toHaveCount(0);
  await page.mouse.click(frame.x + frame.width * 0.8, frame.y + frame.height * 0.14);
  await expect(from).toHaveCount(0);

  const middle = await midpoint(line);
  await page.mouse.click(middle.x, middle.y);
  await expect(from).toBeVisible();
  const pinned = await midpoint(from);
  await drag(page, await midpoint(to), { x: pinned.x + 115, y: pinned.y - 62 });
  const fixed = await midpoint(from);
  expect(fixed.x).toBeCloseTo(pinned.x, 1);
  expect(fixed.y).toBeCloseTo(pinned.y, 1);
  const moved = await midpoint(to);
  expect(moved.x).toBeGreaterThan(pinned.x + 110);
  expect(moved.y).toBeLessThan(pinned.y - 57);
  const { path, slide } = await exportDeck(page);
  expect(slide).toContain('<p:cxnSp>');
  expect(slide).toContain('flipV="1"');

  await page.getByLabel('Import PPTX file').setInputFiles(path);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  const imported = await midpoint(line);
  await page.mouse.click(imported.x, imported.y);
  await expect(from).toBeVisible();
  const anchor = await midpoint(from);
  expect(anchor.y).toBeGreaterThan((await midpoint(to)).y + 57);
  await drag(page, await midpoint(to), { x: anchor.x - 2, y: anchor.y + 85 }, ['Shift']);
  expect((await midpoint(to)).x).toBeCloseTo((await midpoint(from)).x, 1);
  await expect(line).toHaveCSS('width', '0px');
});

test('resizes one side at a time, preserves the center and exports rounded corners', async ({ page }) => {
  await blank(page);
  await insertShape(page, 'Rounded rectangle');
  const canvas = page.getByTestId('slide-canvas');
  const shape = canvas.getByTestId('object-shape');
  const original = (await shape.boundingBox())!;
  const right = shape.getByRole('button', { name: 'Resize e', exact: true });
  let handle = await midpoint(right);
  await drag(page, handle, { x: handle.x + 35, y: handle.y + 21 });
  const stretched = (await shape.boundingBox())!;
  expect(stretched.x).toBeCloseTo(original.x, 1);
  expect(stretched.height).toBeCloseTo(original.height, 1);
  expect(stretched.width - original.width).toBeCloseTo(35, 0);

  const bottom = shape.getByRole('button', { name: 'Resize s', exact: true });
  handle = await midpoint(bottom);
  await drag(page, handle, { x: handle.x + 23, y: handle.y - 20 }, ['Alt']);
  const centered = (await shape.boundingBox())!;
  expect(centered.width).toBeCloseTo(stretched.width, 1);
  expect(centered.height - stretched.height).toBeCloseTo(-40, 0);
  expect(centered.y + centered.height / 2).toBeCloseTo(stretched.y + stretched.height / 2, 1);
  const initialRadius = await shape.evaluate((element) =>
    parseFloat(getComputedStyle(element).borderTopLeftRadius),
  );
  handle = await midpoint(shape.getByRole('button', { name: 'Adjust corner radius', exact: true }));
  await drag(page, handle, { x: handle.x + 30, y: handle.y });
  const radius = await shape.evaluate((element) => parseFloat(getComputedStyle(element).borderTopLeftRadius));
  expect(radius).toBeGreaterThan(initialRadius + 20);
  const { path, slide } = await exportDeck(page);
  expect(slide).toMatch(/<a:gd name="adj" fmla="val \d+"\/>/);
  await page.getByLabel('Import PPTX file').setInputFiles(path);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  const importedRadius = await shape.evaluate((element) =>
    parseFloat(getComputedStyle(element).borderTopLeftRadius),
  );
  expect(importedRadius).toBeCloseTo(radius, 1);
});

test('keeps a picture centered and proportional with Ctrl and Shift', async ({ page }) => {
  await blank(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 120;
    const paint = canvas.getContext('2d')!;
    paint.fillStyle = '#7350c4';
    paint.fillRect(0, 0, 240, 120);
    return canvas.toDataURL().split(',')[1];
  });
  await page
    .getByLabel('Insert image file')
    .setInputFiles({ name: 'Swatch.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const picture = page.getByTestId('slide-canvas').getByTestId('object-image');
  await expect(picture).toBeVisible();
  const center = await midpoint(picture);
  const initial = (await picture.boundingBox())!;
  const corner = await midpoint(picture.getByRole('button', { name: 'Resize se', exact: true }));
  await drag(page, corner, { x: corner.x + 45, y: corner.y + 35 }, ['Control', 'Shift']);
  const resized = (await picture.boundingBox())!;
  expect(resized.width).toBeGreaterThan(initial.width + 55);
  expect(resized.width / resized.height).toBeCloseTo(initial.width / initial.height, 2);
  const newCenter = await midpoint(picture);
  expect(newCenter.x).toBeCloseTo(center.x, 1);
  expect(newCenter.y).toBeCloseTo(center.y, 1);
});
