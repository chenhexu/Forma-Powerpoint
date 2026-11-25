import { expect, test } from '@playwright/test';
import { sampleGlb } from './sampleGlb';
import { createRequire } from 'node:module';
const JSZip: typeof import('jszip') = createRequire(import.meta.url)('jszip');
import { readFile } from 'node:fs/promises';

test('imports a deck, inserts a GLB, previews and exports native Morph, and recovers local edits', async ({
  page,
}) => {
  const uncaught: string[] = [];
  page.on('pageerror', (e) => uncaught.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');

  const template = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX' }).click();
  await page.getByLabel('Import PPTX file').setInputFiles(await (await template).path());
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await page
    .getByLabel('3D model files')
    .setInputFiles({ name: 'Triangle.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from(sampleGlb()) });
  await expect(page.getByTestId('object-model').locator('canvas')).toBeVisible();

  const modelFrame = await page.getByTestId('object-model').boundingBox();
  expect(modelFrame).toBeTruthy();
  const center = { x: modelFrame!.x + modelFrame!.width / 2, y: modelFrame!.y + modelFrame!.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  const ring = page.getByRole('button', { name: 'Rotate around X axis' }).locator('.ring-track');
  const beforeTurn = await ring.getAttribute('transform');
  await page.mouse.move(center.x + 50, center.y + 20, { steps: 5 });
  await expect(ring).not.toHaveAttribute('transform', beforeTurn!);
  await page.mouse.up();
  await expect(page.getByLabel('Yaw')).toHaveValue('30');

  await page.getByRole('button', { name: 'Create Morph pair', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Transition', exact: true })).toHaveText('Morph');
  await page.getByTestId('slide-canvas').getByTestId('object-model').click();
  await page.getByRole('button', { name: 'Right', exact: true }).click();
  await expect(page.getByLabel('Yaw')).toHaveValue('90');
  await page.getByRole('button', { name: 'Center on slide' }).click();
  await expect(page.getByLabel('X', { exact: true })).toHaveValue('416');
  await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)' }).click();
  await page.getByRole('button', { name: 'Redo (Ctrl/Cmd+Shift+Z)' }).click();
  await page.getByRole('tab', { name: 'Transition', exact: true }).click();
  await page.getByRole('button', { name: 'Preview from previous slide' }).click();
  const preview = page.getByTestId('editor-transition-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toBeHidden();

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX' }).click();
  const file = await (await pending).path();
  const zip = await JSZip.loadAsync(await readFile(file));
  const slides = zip.file(/^ppt\/slides\/[^/]+\.xml$/);
  const xml = await Promise.all(slides.map((s) => s.async('string')));
  expect(xml.filter((s) => s.includes('<am3d:model3d'))).toHaveLength(2);
  expect(xml.filter((s) => s.includes('<p159:morph option="byObject"'))).toHaveLength(1);
  expect(zip.file(/\.glb$/)).toHaveLength(1);
  expect(zip.file(/preview_.*\.png$/)).toHaveLength(2);
  for (const preview of zip.file(/preview_.*\.png$/)) {
    expect(Array.from((await preview.async('uint8array')).slice(0, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
  }
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Recovered');
  await page.getByRole('button', { name: 'Select slide 2' }).click();
  await page.getByTestId('slide-canvas').getByTestId('object-model').click();
  await expect(page.getByLabel('Yaw')).toHaveValue('90');
  await page.getByLabel('Import PPTX file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await expect(page.getByTestId('object-model').locator('canvas')).toBeVisible();
  expect(uncaught).toEqual([]);
});

test('reports invalid file and unavailable WebGL without losing the deck', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type === 'webgl2' ? null : Reflect.apply(getContext, this, [type, ...args]);
    } as typeof getContext;
  });
  await page.goto('/');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await page
    .getByLabel('Import PPTX file')
    .setInputFiles({ name: 'bad.pptx', mimeType: 'application/zip', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByLabel('Presentation name')).toHaveValue('A new perspective');
  await page
    .getByLabel('3D model files')
    .setInputFiles({ name: 'Triangle.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from(sampleGlb()) });
  await expect(page.getByRole('status')).toContainText('WebGL is required');
  await expect(page.getByLabel('Presentation name')).toHaveValue('A new perspective');
});

test('model-axis rings snap, cancel, and commit an undoable native pose', async ({ page }) => {
  await page.goto('/');
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await tab('File').click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
  await page.getByLabel('3D model files').setInputFiles({
    name: 'Model.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(sampleGlb()),
  });
  await expect(page.getByTestId('object-model').locator('canvas')).toBeVisible();
  const rings = page.locator('.rotation-gizmo svg');
  await expect(rings).toBeVisible();
  const bounds = (await rings.boundingBox())!;
  const c = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const radius = (bounds.width * 64) / 168;
  const roll = page.getByLabel('Roll', { exact: true });

  const xRing = page.getByRole('button', { name: 'Rotate around X axis' }).locator('.ring-track');
  const initialRing = await xRing.getAttribute('transform');
  const model = page.getByTestId('object-model');
  const frame = await model.boundingBox();
  const zoom = page.getByRole('group', { name: '3D view zoom' });
  await zoom.getByRole('button', { name: 'Zoom in 3D view' }).click();
  await expect(zoom.getByRole('button', { name: 'Reset 3D view zoom (110%)', exact: true })).toBeVisible();
  await model.locator('.model-view').dispatchEvent('wheel', {
    clientX: c.x,
    clientY: c.y,
    deltaY: -70,
    shiftKey: true,
  });
  await expect.poll(async () => (await model.boundingBox())!.width).toBeGreaterThan(frame!.width * 1.2);
  await expect(zoom.getByRole('button', { name: 'Reset 3D view zoom (110%)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fit slide', exact: true }).click();
  await page.mouse.move(c.x, c.y);
  await page.mouse.wheel(0, -120);
  await expect(zoom.getByRole('button', { name: 'Reset 3D view zoom (120%)', exact: true })).toBeVisible();
  expect(await model.boundingBox()).toEqual(frame);
  await expect(page.getByTestId('object-model').locator('.selection-outline')).toHaveCount(0);
  await zoom.getByRole('button', { name: 'Reset 3D view zoom (120%)', exact: true }).click();

  const startRing = async () => {
    await page.mouse.move(c.x + radius, c.y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(c.x + radius * 0.6, c.y - radius * 0.8, { steps: 8 });
    await expect(page.locator('.rotation-angle')).toHaveText('Z 60°');
    await expect(xRing).not.toHaveAttribute('transform', initialRing!);
    await expect(page.getByRole('button', { name: 'Rotate around Z axis' })).toHaveCSS(
      'outline-style',
      'none',
    );
    await page.keyboard.up('Shift');
  };
  await startRing();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(roll).toHaveValue('0');
  await expect(xRing).toHaveAttribute('transform', initialRing!);

  await startRing();
  await page.mouse.up();
  await expect(roll).toHaveValue('60');
  await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)' }).click();
  await page.getByTestId('object-model').click();
  await expect(roll).toHaveValue('0');
  await page.getByRole('button', { name: 'Redo (Ctrl/Cmd+Shift+Z)' }).click();
  await page.getByTestId('object-model').click();
  await expect(roll).toHaveValue('60');

  await page.getByRole('button', { name: 'Create Morph pair' }).click();
  await page.getByTestId('object-model').click();
  await tab('3D Model').click();
  await page.locator('.ribbon').getByRole('tabpanel').getByRole('button', { name: 'Rotate in 3D' }).click();
  await page.getByRole('button', { name: 'Rotate around Z axis' }).focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(roll).toHaveValue('75');
  await tab('Transitions').click();
  await page.getByRole('button', { name: 'Preview Transition' }).click();
  const preview = page.getByTestId('editor-transition-preview');
  await expect(preview).toBeVisible();
  await page.getByRole('button', { name: 'Stop Preview' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const file = await (await download).path();
  const zip = await JSZip.loadAsync(await readFile(file));
  const slides = await Promise.all(zip.file(/^ppt\/slides\/[^/]+\.xml$/).map((part) => part.async('string')));
  const morph = slides.find((xml) => xml.includes('<p159:morph'))!;
  expect(morph).toMatch(/<am3d:rot[^>]*az="4500000"/);
  await page.getByLabel('Import PPTX file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await page.getByRole('button', { name: 'Select slide 2', exact: true }).click();
  await page.getByTestId('object-model').click();
  await expect(roll).toHaveValue('75');
});

test('carries model zoom through Morph, previews and PPTX while keeping the editing hitbox', async ({
  page,
}) => {
  await page.goto('/');
  const canvas = page.getByTestId('slide-canvas');
  const model = canvas.getByTestId('object-model');
  const live = model.locator('.model-view');
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  const slide1 = page.getByRole('button', { name: 'Select slide 1', exact: true });
  const slide2 = page.getByRole('button', { name: 'Select slide 2', exact: true });
  const thumbnail = slide1.locator('img');
  await expect(live.locator('canvas')).toBeVisible();
  await expect(thumbnail).toHaveAttribute('src', /^blob:/);
  const before = (await thumbnail.getAttribute('src'))!;
  const baseThumb = (await thumbnail.boundingBox())!;
  const originalWidth = await model.evaluate((element) => Number.parseFloat(element.style.width));

  async function rotateModel() {
    await model.click();
    await tab('3D Model').click();
    await page.locator('.ribbon').getByRole('tabpanel').getByRole('button', { name: 'Rotate in 3D' }).click();
  }
  await rotateModel();
  const baseModel = (await model.boundingBox())!;
  const zoom = page.getByRole('group', { name: '3D view zoom' });
  const zoomIn = zoom.getByRole('button', { name: 'Zoom in 3D view' });
  await zoom.getByRole('button', { name: 'Zoom out 3D view' }).click();
  await expect(live).toHaveAttribute('data-view-zoom', '0.9');
  const hitsOriginalEdge = await model.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.contains(
      document.elementFromPoint(bounds.right - bounds.width * 0.02, bounds.top + bounds.height / 2),
    );
  });
  expect(hitsOriginalEdge).toBe(false);
  await zoom.getByRole('button', { name: 'Reset 3D view zoom (90%)' }).click();
  await zoomIn.click();
  await zoomIn.click();
  await expect(live).toHaveAttribute('data-view-zoom', '1.2');
  expect((await thumbnail.boundingBox())!.width / baseThumb.width).toBeCloseTo(1.2);
  expect((await live.locator('canvas').boundingBox())!.width / baseModel.width).toBeCloseTo(1.2);
  expect((await model.boundingBox())!.width).toBeCloseTo(baseModel.width);
  const hitsZoomedModel = await model.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const x = bounds.right + bounds.width * 0.05;
    const y = bounds.top + bounds.height / 2;
    return element.contains(document.elementFromPoint(x, y));
  });
  expect(hitsZoomedModel).toBe(false);

  await page.getByRole('button', { name: 'Right', exact: true }).click();
  await expect(thumbnail).not.toHaveAttribute('src', before);
  const after = (await thumbnail.getAttribute('src'))!;

  await canvas.click({ position: { x: 10, y: 10 } });
  await expect(zoom).toHaveCount(0);
  await expect(live).toHaveAttribute('data-view-zoom', '1.2');
  await slide2.click();
  await expect(live).toHaveAttribute('data-view-zoom', '1');
  await slide1.click();
  await expect(live).toHaveAttribute('data-view-zoom', '1.2');

  await tab('View').click();
  await page.getByRole('button', { name: 'Slide Sorter' }).click();
  const sorterThumb = page.getByRole('button', { name: 'Sort slide 1', exact: true }).locator('img');
  await expect(sorterThumb).toHaveAttribute('src', after);
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(live).toHaveAttribute('data-view-zoom', '1.2');
  await expect(thumbnail).toHaveAttribute('src', after);

  await page.getByRole('button', { name: 'Create Morph pair', exact: true }).click();
  await expect(live).toHaveAttribute('data-view-zoom', '1.2');
  await rotateModel();
  await zoomIn.click();
  await zoomIn.click();
  await zoomIn.click();
  await expect(live).toHaveAttribute('data-view-zoom', '1.5');
  await tab('Transitions').click();
  const duration = page.getByLabel('Transition seconds', { exact: true });
  await duration.fill('2');
  await duration.press('Enter');
  await page.locator('.ribbon').getByRole('tabpanel').getByRole('button', { name: 'Preview Transition', exact: true }).click();
  const preview = page.getByTestId('editor-transition-preview');
  const previewWidth = preview.locator('.model-view').evaluate((el) => el.parentElement!.style.width);
  expect(parseFloat(await previewWidth) / originalWidth).toBeGreaterThanOrEqual(1.2);
  await expect(preview).toBeHidden();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const presentation = page.getByTestId('presentation');
  await expect(presentation.getByText('2 / 3')).toBeVisible();
  const stage = (await page.getByTestId('presentation-slide').boundingBox())!;
  await page.mouse.click(stage.x + stage.width / 4, stage.y + stage.height / 2);
  await expect(presentation.getByText('1 / 3')).toBeVisible();
  const measureWidth = () =>
    presentation.locator('.model-view').evaluate((el) => Number.parseFloat(el.parentElement!.style.width));
  await expect
    .poll(async () => {
      const ratio = (await measureWidth()) / originalWidth;
      return ratio > 1.25 && ratio < 1.45;
    })
    .toBe(true);
  await expect.poll(measureWidth).toBeCloseTo(originalWidth * 1.2);
  await page.mouse.click(stage.x + (3 * stage.width) / 4, stage.y + stage.height / 2);
  await expect(presentation.getByText('2 / 3')).toBeVisible();
  await expect.poll(measureWidth).toBeCloseTo(originalWidth * 1.5);
  await presentation.getByRole('button', { name: 'Exit presentation' }).click();

  const saving = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const file = await (await saving).path();
  const zip = await JSZip.loadAsync(await readFile(file));
  const transforms = await Promise.all(
    zip.file(/^ppt\/slides\/[^/]+\.xml$/).map(async (entry) => {
      const xml = await entry.async('string');
      const offset = xml.match(/<p:xfrm[^>]*><a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"/);
      if (!offset) return;
      const [x, y, w, h] = offset.slice(1).map(Number);
      expect(xml).toContain(`<a:ext cx="${w}" cy="${h}"`);
      return { x, y, w, h };
    }),
  );
  const [unzoomed, source, target] = transforms
    .filter((frame) => frame !== undefined)
    .sort((a, b) => a.w - b.w);
  expect(source.w / unzoomed.w).toBeCloseTo(1.2);
  expect(target.w / unzoomed.w).toBeCloseTo(1.5);
  expect(source.x + source.w / 2).toBeCloseTo(target.x + target.w / 2);
  expect(source.y + source.h / 2).toBeCloseTo(target.y + target.h / 2);

  await page.getByLabel('Import PPTX file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await slide2.click();
  await expect(live).toHaveAttribute('data-view-zoom', '1');
  expect(await model.evaluate((element) => Number.parseFloat(element.style.width))).toBeCloseTo(
    originalWidth * 1.5,
  );
});
