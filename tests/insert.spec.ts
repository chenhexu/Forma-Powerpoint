import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const JSZip: typeof import('jszip') = createRequire(import.meta.url)('jszip');

async function blank(page: Page) {
  await page.goto('/editor');
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
  await page.getByRole('tab', { name: 'Insert', exact: true }).click();
}

async function choose(page: Page, menu: string, choice: string) {
  await page.getByRole('button', { name: menu, exact: true }).click();
  const popup = page.getByRole('menu', { name: menu, exact: true });
  await popup
    .getByRole('menuitem', { name: choice, exact: true })
    .or(popup.getByRole('menuitemradio', { name: choice, exact: true }))
    .click();
}

async function exportDeck(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const path = await (await pending).path();
  return { path, zip: await JSZip.loadAsync(await readFile(path)) };
}

test('shows shared slide layout previews and distinct Insert icons without changing menu names', async ({
  page,
}) => {
  await blank(page);
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  await panel.getByRole('button', { name: 'New Slide', exact: true }).click();
  const insertMenu = page.getByRole('menu', { name: 'New Slide', exact: true });
  const preview = insertMenu
    .getByRole('menuitem', { name: 'Comparison', exact: true })
    .locator('.menu-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('aria-hidden', 'true');
  const layout = await preview.innerHTML();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await panel.getByRole('button', { name: 'New slide layout', exact: true }).press('ArrowDown');
  const homeMenu = page.getByRole('menu', { name: 'New slide layout', exact: true });
  const homePreview = homeMenu
    .getByRole('menuitem', { name: 'Comparison', exact: true })
    .locator('.menu-preview');
  expect(await homePreview.innerHTML()).toBe(layout);
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Insert', exact: true }).click();
  await panel.getByRole('button', { name: 'Chart', exact: true }).click();
  const chart = page.getByRole('menu', { name: 'Chart', exact: true });
  const column = chart
    .getByRole('menuitem', { name: 'Clustered column', exact: true })
    .locator('.menu-preview svg');
  const pie = chart.getByRole('menuitem', { name: 'Pie', exact: true }).locator('.menu-preview svg');
  expect(await column.getAttribute('class')).not.toBe(await pie.getAttribute('class'));
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Symbol', exact: true }).click();
  const pi = page.getByRole('menuitem', { name: 'π Pi', exact: true });
  await expect(pi.locator('.menu-preview')).toHaveText('π');
});

test('inserts editable tables and native chart data and reloads both from PPTX', async ({ page }) => {
  await blank(page);
  const canvas = page.getByTestId('slide-canvas');
  await choose(page, 'Table', '3 columns × 3 rows');
  const table = canvas.getByTestId('object-table');
  await table.dblclick();
  const editor = page.getByRole('dialog', { name: 'Edit table cells' });
  await editor.getByRole('textbox', { name: 'Row 1, column 1', exact: true }).fill('Product');
  await editor.getByRole('textbox', { name: 'Row 2, column 1', exact: true }).fill('Forma');
  await editor.getByRole('button', { name: 'Save Table', exact: true }).click();
  await expect(table.getByRole('columnheader', { name: 'Product' })).toBeVisible();

  await choose(page, 'New Slide', 'Comparison');
  await expect(canvas.getByText('Option A', { exact: true })).toBeVisible();
  await choose(page, 'Chart', 'Clustered column');
  const chartDialog = page.getByRole('dialog', { name: 'Insert Chart' });
  await choose(page, 'Chart type', 'Pie');
  await chartDialog.getByRole('textbox', { name: 'Category 1' }).fill('Research & design');
  await chartDialog.getByRole('spinbutton', { name: 'Value 1' }).fill('42');
  await chartDialog.getByRole('button', { name: 'Insert Chart' }).click();
  await expect(canvas.getByRole('img', { name: 'Pie chart' })).toBeVisible();

  const { path, zip } = await exportDeck(page);
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(xml).toContain('<a:tbl>');
  expect(xml).toContain('Product');
  const chart = await zip.file(/^ppt\/charts\/forma_chart_.*\.xml$/)[0].async('string');
  expect(chart).toContain('<c:pieChart>');
  expect(chart).toContain('Research &amp; design');
  const workbook = await JSZip.loadAsync(
    await zip.file(/^ppt\/embeddings\/forma_data_.*\.xlsx$/)[0].async('uint8array'),
  );
  const cells = await workbook.file('xl/worksheets/sheet1.xml')!.async('string');
  expect(cells).toContain('<c r="B2"><v>42</v></c>');
  await page.getByLabel('Import PPTX file').setInputFiles(path);
  await expect(table.getByRole('cell', { name: 'Forma', exact: true })).toBeVisible();
  await table.dblclick();
  await page.getByRole('textbox', { name: 'Row 2, column 1', exact: true }).fill('Edited after import');
  await page.getByRole('button', { name: 'Save Table', exact: true }).click();
  await page.getByRole('button', { name: 'Select slide 2', exact: true }).click();
  await expect(canvas.getByRole('img', { name: 'Pie chart' })).toBeVisible();
  await canvas.getByTestId('object-chart').dblclick();
  await page.getByRole('spinbutton', { name: 'Value 1' }).fill('51');
  await page.getByRole('button', { name: 'Save Chart', exact: true }).click();
  const second = await exportDeck(page);
  expect(await second.zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('Edited after import');
  const charts = await Promise.all(
    second.zip.file(/^ppt\/charts\/forma_chart_.*\.xml$/).map((file) => file.async('string')),
  );
  expect(charts.some((xml) => xml.includes('<c:v>51</c:v>'))).toBe(true);
});

test('follows slide links and keeps slide numbers, comments and embedded audio through export', async ({
  page,
}) => {
  await blank(page);
  const canvas = page.getByTestId('slide-canvas');
  await choose(page, 'New Slide', 'Blank');
  await choose(page, 'New Slide', 'Blank');
  await page.getByRole('button', { name: 'Slide Number', exact: true }).click();
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  const comments = page.getByRole('dialog', { name: 'Slide Comments' });
  await comments.getByLabel('Name', { exact: true }).fill('Alex');
  await comments.getByLabel('Comment', { exact: true }).fill('Check this soundtrack.');
  await comments.getByRole('button', { name: 'Add Comment', exact: true }).click();

  const sample = Buffer.alloc(44 + 1600);
  sample.write('RIFF');
  sample.writeUInt32LE(sample.length - 8, 4);
  sample.write('WAVEfmt ', 8);
  sample.writeUInt32LE(16, 16);
  sample.writeUInt16LE(1, 20);
  sample.writeUInt16LE(1, 22);
  sample.writeUInt32LE(8000, 24);
  sample.writeUInt32LE(16000, 28);
  sample.writeUInt16LE(2, 32);
  sample.writeUInt16LE(16, 34);
  sample.write('data', 36);
  sample.writeUInt32LE(1600, 40);
  await page
    .getByLabel('Insert audio file')
    .setInputFiles({ name: 'Sound.wav', mimeType: 'audio/wav', buffer: sample });
  await expect(canvas.getByTestId('object-media')).toBeVisible();

  await page.getByRole('button', { name: 'Select slide 1', exact: true }).click();
  await choose(page, 'Zoom', 'Slide navigation link…');
  await choose(page, 'Destination slide', 'Slide 3');
  const link = page.getByRole('dialog', { name: 'Slide navigation link' });
  await link.getByLabel('Display text').fill('Go to the audio slide');
  await link.getByRole('button', { name: 'Insert Link' }).click();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const presentation = page.getByTestId('presentation');
  await presentation.getByRole('button', { name: 'Follow Go to the audio slide' }).click();
  await expect(presentation.getByText('3 / 3', { exact: true })).toBeVisible();
  await expect(presentation.locator('audio[controls]')).toBeVisible();
  await presentation.getByRole('button', { name: 'Exit presentation' }).click();

  const { path, zip } = await exportDeck(page);
  const slides = await Promise.all(zip.file(/^ppt\/slides\/[^/]+\.xml$/).map((file) => file.async('string')));
  expect(slides.some((xml) => xml.includes('ppaction://hlinksldjump'))).toBe(true);
  expect(
    slides.some(
      (xml) => xml.includes('type="slidenum"') && xml.includes('<p:audio>') && xml.includes('audioFile'),
    ),
  ).toBe(true);
  expect(await zip.file(/^ppt\/media\/forma_.*\.wav$/)[0].async('nodebuffer')).toEqual(sample);
  expect(await zip.file(/^ppt\/comments\/forma_comments_.*\.xml$/)[0].async('string')).toContain(
    'Check this soundtrack.',
  );
  await page.getByLabel('Import PPTX file').setInputFiles(path);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await page.getByRole('button', { name: 'Select slide 3', exact: true }).click();
  await expect(canvas.getByTestId('object-media')).toBeVisible();
  await page.getByRole('tab', { name: 'Insert', exact: true }).click();
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(comments.getByText('Check this soundtrack.')).toBeVisible();
  await comments.getByRole('button', { name: 'Close dialog' }).click();
  await canvas.getByTestId('object-media').click();
  await page.keyboard.press('Delete');
  await expect(canvas.getByTestId('object-media')).toHaveCount(0);
  const afterDeletion = await exportDeck(page);
  const remaining = await Promise.all(
    afterDeletion.zip.file(/^ppt\/slides\/[^/]+\.xml$/).map((file) => file.async('string')),
  );
  expect(remaining.some((xml) => xml.includes('<p:audio>'))).toBe(false);
});

test('screen clipping uses the chosen screen stream and opens picture crop', async ({ page }) => {
  await blank(page);
  await page.evaluate(() => {
    const media = navigator.mediaDevices;
    media.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 160;
      const context = canvas.getContext('2d')!;
      const stream = canvas.captureStream(30);
      let frame = 0;
      const paint = () => {
        if (stream.getVideoTracks()[0].readyState === 'ended') return;
        context.fillStyle = frame % 2 === 0 ? '#d859a0' : '#5589be';
        context.fillRect(0, 0, canvas.width, canvas.height);
        frame++;
        requestAnimationFrame(paint);
      };
      paint();
      return stream;
    };
  });
  await choose(page, 'Screenshot', 'Screen Clipping…');
  await expect(page.getByRole('group', { name: 'Picture crop editor' })).toBeFocused();
  await page.keyboard.press('Enter');
  const image = page.getByTestId('slide-canvas').getByTestId('object-image');
  await expect(image.getByAltText('Screenshot.png')).toBeVisible();
});
