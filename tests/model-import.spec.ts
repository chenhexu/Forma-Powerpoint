import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { sampleGlb } from './sampleGlb';
const JSZip: typeof import('jszip') = createRequire(import.meta.url)('jszip');

async function blankDeck(page: Page) {
  await page.goto('/editor');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
}
async function exportedModel(page: Page) {
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  if (await page.getByRole('dialog', { name: 'Review 3D performance' }).isVisible())
    await page.getByRole('button', { name: 'Export at original quality' }).click();
  const file = await (await wait).path();
  const zip = await JSZip.loadAsync(await readFile(file));
  const model = zip.file(/\.glb$/)[0];
  expect(model).toBeTruthy();
  const bytes = await model.async('nodebuffer');
  const json = JSON.parse(bytes.toString('utf-8', 20, 20 + bytes.readUInt32LE(12)));
  return { json, file };
}

test('reviews heavy models and exports smaller textures without altering native models or Morph', async ({
  page,
}) => {
  await blankDeck(page);
  const png = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 2112;
      canvas.height = 64;
      const context = canvas.getContext('2d')!;
      for (let x = 0; x < canvas.width; x++) {
        context.fillStyle = `rgba(${x % 256}, ${(x * 61) % 256}, 90, 0.7)`;
        context.fillRect(x, 0, 1, canvas.height);
      }
      return canvas.toDataURL().split(',')[1];
    }),
    'base64',
  );
  const pngLength = Math.ceil(png.length / 4) * 4;
  const bytes = Buffer.from(
    sampleGlb({
      bufferViews: [
        { buffer: 0, byteLength: 36, byteOffset: pngLength },
        { buffer: 0, byteLength: png.length },
      ],
      buffers: [{ byteLength: pngLength + 36 }],
      images: [{ bufferView: 1, mimeType: 'image/png' }],
      textures: [{ source: 0 }],
      materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    }),
  );
  const start = 28 + bytes.readUInt32LE(12);
  const source = Buffer.concat([
    bytes.subarray(0, start),
    png,
    Buffer.alloc(pngLength - png.length),
    bytes.subarray(start),
  ]);
  source.writeUInt32LE(source.length, 8);
  source.writeUInt32LE(source.length - start, start - 8);
  await page.getByLabel('3D model files').setInputFiles({
    name: 'textured-triangle.glb',
    mimeType: 'model/gltf-binary',
    buffer: source,
  });
  await expect(page.getByRole('status')).toContainText('may run slowly in PowerPoint');
  await page.getByRole('button', { name: 'Create Morph pair' }).click();
  const exportButton = page.getByRole('button', { name: 'Export PPTX', exact: true });
  const review = page.getByRole('dialog', { name: 'Review 3D performance' });
  await exportButton.click();
  await expect(review).toContainText('Slides 1, 2');
  await expect(review).toContainText('heavy textures');
  await page.keyboard.press('Escape');
  await expect(review).toBeHidden();
  const { file } = await exportedModel(page);
  const original = await JSZip.loadAsync(await readFile(file));
  expect(await original.file(/\.glb$/)[0].async('nodebuffer')).toEqual(source);

  // Re-import the original export to also exercise replacing an existing native media part.
  await page.getByLabel('Import PPTX file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await exportButton.click();
  await review.getByRole('button', { name: 'Try smaller textures' }).click();
  await expect(review).toContainText('reduced the embedded 3D data');
  await expect(review).toContainText('within Forma’s 3D performance targets');
  const wait = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Export with smaller textures' }).click();
  const optimized = await JSZip.loadAsync(await readFile(await (await wait).path()));
  const glbs = optimized.file(/\.glb$/);
  expect(glbs).toHaveLength(1);
  expect(glbs[0].name).toBe(original.file(/\.glb$/)[0].name);
  const shrunken = await glbs[0].async('nodebuffer');
  expect(shrunken.length).toBeLessThan(source.length);
  const length = shrunken.readUInt32LE(12);
  const gltf = JSON.parse(shrunken.toString('utf-8', 20, 20 + length));
  const imageStart = 28 + length + gltf.bufferViews[1].byteOffset;
  expect(shrunken.readUInt32BE(imageStart + 16)).toBe(1024);
  const vertexStart = 28 + length + gltf.bufferViews[0].byteOffset;
  expect(shrunken.subarray(vertexStart, vertexStart + 36)).toEqual(source.subarray(start + pngLength));
  for (const part of original.file(/\.xml$|\.rels$/)) {
    expect(await optimized.file(part.name)!.async('string')).toBe(await part.async('string'));
  }
  const unchanged = await exportedModel(page);
  expect(await readFile(unchanged.file)).toEqual(await readFile(file));
});

test('imports OBJ, MTL and an external texture from a ZIP and embeds them in a native GLB', async ({
  page,
}) => {
  await blankDeck(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 4;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e6485b';
    ctx.fillRect(0, 0, 4, 4);
    return canvas.toDataURL().split(',')[1];
  });
  const zip = new JSZip();
  zip.file(
    'model/source/triangle.obj',
    'mtllib triangle.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl red\nf 1/1 2/2 3/3\n',
  );
  zip.file('model/source/triangle.mtl', 'newmtl red\nKd 1 1 1\nmap_Kd ../textures/red.png\n');
  zip.file('model/textures/red.png', png, { base64: true });
  await page.getByLabel('3D model files').setInputFiles({
    name: 'triangle.zip',
    mimeType: 'application/zip',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  });
  await expect(page.getByRole('status')).toContainText('Native 3D model inserted');
  await expect(page.getByTestId('object-model').locator('canvas')).toBeVisible();
  const { json, file } = await exportedModel(page);
  expect(json.materials[0].pbrMetallicRoughness.baseColorTexture).toBeDefined();
  expect(json.images[0].bufferView).toBeDefined();
  await page.getByLabel('Import PPTX file').setInputFiles(file);
  await expect(page.getByTestId('object-model').locator('canvas')).toBeVisible();
});

test('attaches a texture folder to the selected model and its Morph copy', async ({ page }, testInfo) => {
  await blankDeck(page);
  await page.getByLabel('3D model files').setInputFiles([
    {
      name: 'texture-test.obj',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'mtllib texture-test.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl red\nf 1/1 2/2 3/3\n',
      ),
    },
    {
      name: 'texture-test.mtl',
      mimeType: 'text/plain',
      buffer: Buffer.from('newmtl red\nKd 1 1 1\nmap_Kd red.png\n'),
    },
  ]);
  await expect(page.getByRole('status')).toContainText('1 unresolved resources');
  await page.getByRole('button', { name: 'Create Morph pair' }).click();
  await page.getByTestId('object-model').click();
  await expect(page.getByRole('button', { name: 'Add Texture Folder' })).toBeVisible();
  const x = await page.getByLabel('X', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Right', exact: true }).click();
  const folder = testInfo.outputPath('textures');
  await mkdir(folder, { recursive: true });
  await writeFile(
    testInfo.outputPath('textures/red.png'),
    Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 4;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ec4054';
        ctx.fillRect(0, 0, 4, 4);
        return canvas.toDataURL().split(',')[1];
      }),
      'base64',
    ),
  );
  await page.getByLabel('Texture folder for selected model').setInputFiles(folder);
  await expect(page.getByRole('status')).toContainText('Textures applied');
  await expect(page.getByLabel('X', { exact: true })).toHaveValue(x);
  await expect(page.getByLabel('Yaw', { exact: true })).toHaveValue('90');
  const { json, file } = await exportedModel(page);
  expect(json.materials[0].pbrMetallicRoughness.baseColorTexture).toBeDefined();
  const zip = await JSZip.loadAsync(await readFile(file));
  expect(zip.file(/\.glb$/)).toHaveLength(1);
  const slides = await Promise.all(zip.file(/^ppt\/slides\/[^/]+\.xml$/).map((part) => part.async('string')));
  expect(slides.filter((xml) => xml.includes('<am3d:model3d'))).toHaveLength(2);
  expect(slides.find((xml) => xml.includes('<p159:morph'))).toMatch(/ay="5400000"/);
  if (process.env.FORMA_MODEL_EXPORT) await writeFile(process.env.FORMA_MODEL_EXPORT, await readFile(file));
});

test('opens glTF with a sibling binary and imports STL geometry', async ({ page }) => {
  await blankDeck(page);
  const glb = Buffer.from(sampleGlb());
  const length = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.toString('utf-8', 20, 20 + length));
  gltf.buffers[0].uri = 'triangle.bin';
  await page.getByLabel('3D model files').setInputFiles([
    { name: 'triangle.gltf', mimeType: 'model/gltf+json', buffer: Buffer.from(JSON.stringify(gltf)) },
    { name: 'triangle.bin', mimeType: 'application/octet-stream', buffer: glb.subarray(28 + length) },
  ]);
  await expect(page.getByTestId('object-model').locator('canvas')).toHaveCount(1);
  const stl =
    'solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle';
  await page.getByLabel('3D model files').setInputFiles({
    name: 'triangle.stl',
    mimeType: 'model/stl',
    buffer: Buffer.from(stl),
  });
  await expect(page.getByTestId('object-model').locator('canvas')).toHaveCount(2);
});

test('imports the supplied FBX ZIP and exports its resolved textures', async ({ page }) => {
  const fixture = process.env.FORMA_MODEL_ZIP;
  test.skip(!fixture, 'Set FORMA_MODEL_ZIP to a model ZIP with an FBX and companion textures.');
  test.setTimeout(150_000);
  await blankDeck(page);
  await page.getByLabel('3D model files').setInputFiles(fixture!);
  await expect(page.getByTestId('object-model').locator('canvas')).toBeVisible({ timeout: 85_000 });
  await expect(page.getByRole('status')).toContainText('Native 3D model inserted');
  const { json } = await exportedModel(page);
  expect(json.images.length).toBeGreaterThan(10);
  expect(json.images.every((image: { bufferView?: number }) => image.bufferView !== undefined)).toBe(true);
});

test('uses the PowerPoint layout to center title and subtitle text', async ({ page }) => {
  const fixture = process.env.FORMA_CENTER_DECK;
  test.skip(!fixture, 'Set FORMA_CENTER_DECK to the title-slide PPTX fixture.');
  await page.goto('/editor');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await page.getByLabel('Import PPTX file').setInputFiles(fixture!);
  const canvas = page.getByTestId('slide-canvas');
  const title = canvas.getByText('Did this text got preserved?', { exact: true });
  const subtitle = canvas.getByText('By Tester', { exact: true });
  await expect(title).toHaveCSS('text-align', 'center');
  const baseline = await title.evaluate((text) => {
    const box = text.getBoundingClientRect();
    const frame = text.closest('.text-frame')!.getBoundingClientRect();
    return (box.bottom - frame.top) / frame.height;
  });
  expect(baseline).toBeGreaterThan(0.9);
  await expect(title).toHaveCSS('font-family', /Aptos Display/);
  const lineCount = await title.evaluate((text) => {
    const range = document.createRange();
    range.selectNodeContents(text);
    return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
  });
  expect(lineCount).toBe(1);
  const box = canvas.getByTestId('object-text').first();
  const bounds = await box.boundingBox();
  const fontSize = await title.evaluate((node) => getComputedStyle(node).fontSize);
  await title.dblclick();
  const textInput = box.getByRole('textbox', { name: 'Edit text' });
  await expect(textInput).toBeFocused();
  await expect(textInput.getByText('Did this text got preserved?', { exact: true })).toHaveCSS(
    'font-size',
    fontSize,
  );
  await expect(textInput).toHaveCSS('outline-style', 'none');
  expect(await box.boundingBox()).toEqual(bounds);
  const countRows = (el: Element) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
  };
  expect(await textInput.getByText('Did this text got preserved?', { exact: true }).evaluate(countRows)).toBe(
    1,
  );
  await canvas.click({ position: { x: 12, y: 12 } });
  await expect(textInput).toHaveCount(0);
  await expect(subtitle).toHaveCSS('text-align', 'center');
  await expect(subtitle).toHaveCSS('font-size', '32px');
  const unchanged = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  expect(await readFile(await (await unchanged).path())).toEqual(await readFile(fixture!));
  await title.dblclick();
  await textInput.press('End');
  await textInput.pressSequentially(' Add enough words to start the next line.', { delay: 10 });
  const extended = textInput.getByText(/Add enough words/);
  await expect(extended).toHaveCSS('font-size', fontSize);
  expect(await extended.evaluate(countRows)).toBeGreaterThan(1);
  await textInput.press('Escape');
  await expect(canvas.getByText(/Add enough words/)).toHaveCSS('font-size', fontSize);
  await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)' }).click();
  await page.getByRole('button', { name: 'Select slide 2', exact: true }).click();
  await expect(canvas.getByText('Seems good', { exact: true })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 0)',
  );
  await page.getByRole('button', { name: 'Select slide 1', exact: true }).click();

  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('keyval', 'readwrite');
          const store = tx.objectStore('keyval');
          const get = store.get('forma-project-v1');
          get.onsuccess = () => {
            const project = get.result;
            const [title, subtitle] = project.deck.slides[0].objects;
            for (const o of [title, subtitle]) {
              delete o.textAnchor;
              delete o.textInsets;
              delete o.textFlow;
              o.fontSize = 20;
            }
            title.alignment = undefined;
            subtitle.alignment = 'right';
            subtitle.changed = ['alignment'];
            store.put(project, 'forma-project-v1');
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
  await page.reload();
  await expect(title).toHaveCSS('text-align', 'center');
  await expect(title).toHaveCSS('font-family', /Aptos Display/);
  await expect(subtitle).toHaveCSS('text-align', 'right');
});
