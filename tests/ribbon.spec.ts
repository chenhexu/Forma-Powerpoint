import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const JSZip: typeof import('jszip') = createRequire(import.meta.url)('jszip');

async function chooseMenu(page: Page, label: string, choice: string) {
  await page.getByRole('tabpanel').getByRole('button', { name: label, exact: true }).click();
  await page
    .getByRole('menu', { name: label, exact: true })
    .getByRole('menuitem', { name: choice, exact: true })
    .or(
      page
        .getByRole('menu', { name: label, exact: true })
        .getByRole('menuitemradio', { name: choice, exact: true }),
    )
    .click();
}

test('grows highlighted text without losing the selection and exports separate font sizes', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const panel = page.getByRole('tabpanel');
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await panel.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  const text = page.getByTestId('slide-canvas').getByTestId('object-text');
  await text.dblclick();
  const editor = text.getByRole('textbox', { name: 'Edit text' });
  await editor.evaluate((element) => {
    const node = element.querySelector('.text-paragraph span')!.firstChild!;
    window.getSelection()!.setBaseAndExtent(node, 5, node, 9);
  });
  await panel.getByRole('button', { name: 'Increase font size', exact: true }).click();
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('next');
  await panel.getByRole('button', { name: 'Increase font size', exact: true }).click();
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('next');
  await expect(editor.getByText('next', { exact: true })).toHaveCSS('font-size', '42px');
  await expect(editor.getByText('Your', { exact: true })).toHaveCSS('font-size', '38px');
  await editor.press('Escape');
  const saving = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const download = await saving;
  const file = testInfo.outputPath('Selected font size.pptx');
  await download.saveAs(file);
  const zip = await JSZip.loadAsync(await readFile(file));
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(xml).toMatch(/<a:rPr[^>]*sz="3150"[^>]*>.*?<\/a:rPr><a:t>next<\/a:t>/s);
  await page.getByLabel('Import PPTX file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await expect(text.getByText('next', { exact: true })).toHaveCSS('font-size', '42px');
});

test('snaps mixed objects to each other and keeps off-slide objects for Morph', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('tabpanel');
  const canvas = page.getByTestId('slide-canvas');
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await panel.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  await chooseMenu(page, 'Insert shape', 'Rectangle');
  const text = canvas.getByTestId('object-text');
  const shape = canvas.getByTestId('object-shape');
  const setPosition = async (axis: string, value: string) => {
    const field = page.getByLabel(axis, { exact: true });
    await field.fill(value);
    await field.press('Enter');
  };
  await setPosition('X', '800');
  await setPosition('Y', '380');
  const initial = (await shape.boundingBox())!;
  const slide = (await canvas.boundingBox())!;
  const scale = slide.width / 1280;
  const center = { x: initial.x + initial.width / 2, y: initial.y + initial.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x, center.y + (216 - 380) * scale + 3, { steps: 8 });
  await expect(canvas.getByTestId('smart-guide').first()).toBeVisible();
  await page.mouse.up();
  expect(await shape.evaluate((el) => parseFloat(el.style.top))).toBeCloseTo(216);
  await text.click({ modifiers: ['Shift'] });
  await chooseMenu(page, 'Alignment reference', 'Align to slide');
  await chooseMenu(page, 'Align and distribute', 'Align right');
  for (const item of [shape, text]) {
    expect(await item.evaluate((el) => parseFloat(el.style.left) + parseFloat(el.style.width))).toBeCloseTo(
      1280,
    );
  }

  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await expect(page.getByLabel('Object name')).toHaveValue('Rectangle');
  await setPosition('X', '-470');
  await expect(shape).toBeVisible();
  expect((await shape.boundingBox())!.x).toBeLessThan((await canvas.boundingBox())!.x);
  await shape.click();
  await expect(page.getByLabel('Object name')).toHaveValue('Rectangle');
  await page.getByRole('button', { name: 'Create Morph pair', exact: true }).click();
  await expect(shape).toHaveAttribute('style', /left: -470px/);
  await shape.click();
  await setPosition('X', '480');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const zip = await JSZip.loadAsync(await readFile(await (await pending).path()));
  const originals = await Promise.all(
    zip.file(/^ppt\/slides\/[^/]+\.xml$/).map((part) => part.async('string')),
  );
  expect(originals.some((xml) => xml.includes('x="-4476750"'))).toBe(true);
  expect(originals.some((xml) => xml.includes('x="4572000"') && xml.includes('<p159:morph'))).toBe(true);
});

test('double-click crops a picture and keeps the full image in the PPTX', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('tabpanel');
  const canvas = page.getByTestId('slide-canvas');
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await panel.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
  const png = Buffer.from(
    await page.evaluate(() => {
      const image = document.createElement('canvas');
      image.width = 240;
      image.height = 120;
      const context = image.getContext('2d')!;
      context.fillStyle = '#db3451';
      context.fillRect(0, 0, 120, 120);
      context.fillStyle = '#305bd9';
      context.fillRect(120, 0, 120, 120);
      return image.toDataURL().split(',')[1];
    }),
    'base64',
  );
  await page
    .getByLabel('Insert image file')
    .setInputFiles({ name: 'Colors.png', mimeType: 'image/png', buffer: png });
  const picture = canvas.getByTestId('object-image');
  await expect(picture).toBeVisible();
  const initial = (await picture.boundingBox())!;
  await picture.dblclick();
  const editor = page.getByRole('group', { name: 'Picture crop editor' });
  await expect(editor).toBeVisible();
  const handle = (await editor.getByRole('button', { name: 'Crop left edge' }).boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + initial.width / 4, y, { steps: 5 });
  await page.mouse.up();
  const newWidth = (await page.getByTestId('crop-frame').boundingBox())!.width;
  expect(newWidth / initial.width).toBeCloseTo(0.75, 1);
  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);
  expect((await picture.boundingBox())!.width).toBeCloseTo(newWidth, 1);

  await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)' }).click();
  expect((await picture.boundingBox())!.width).toBeCloseTo(initial.width, 1);
  await page.getByRole('button', { name: 'Redo (Ctrl/Cmd+Shift+Z)' }).click();
  expect((await picture.boundingBox())!.width).toBeCloseTo(newWidth, 1);
  const exportDeck = async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
    return (await download).path();
  };

  const path = await exportDeck();
  const zip = await JSZip.loadAsync(await readFile(path));
  const model = await zip.file('ppt/slides/slide1.xml')!.async('string');
  const inset = model.match(/<a:srcRect l="(\d+)" t="0" r="0" b="0"/);
  expect(Number(inset?.[1]) / 100000).toBeCloseTo(0.25, 1);
  expect(await zip.file(/^ppt\/media\/.*\.png$/)[0].async('nodebuffer')).toEqual(png);

  await page.getByLabel('Import PPTX file').setInputFiles(path);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  expect((await picture.boundingBox())!.width).toBeCloseTo(newWidth, 1);
  await picture.dblclick();
  await editor.getByRole('button', { name: 'Reset crop' }).click();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  expect((await picture.boundingBox())!.width).toBeCloseTo(newWidth, 1);
  await picture.dblclick();
  await editor.getByRole('button', { name: 'Reset crop' }).click();
  await canvas.click({ position: { x: 12, y: 12 } });
  await expect(editor).toHaveCount(0);
  expect((await picture.boundingBox())!.width).toBeCloseTo(initial.width, 1);
  const reset = await JSZip.loadAsync(await readFile(await exportDeck()));
  expect(await reset.file('ppt/slides/slide1.xml')!.async('string')).not.toContain('srcRect');
});

test('Home layout, formatting and shape controls survive a PPTX round trip', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('tabpanel');
  const canvas = page.getByTestId('slide-canvas');
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await panel.getByRole('button', { name: 'New blank presentation' }).click();
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await chooseMenu(page, 'New slide layout', 'Two Content');
  const boxes = canvas.getByTestId('object-text');
  await expect(boxes).toHaveCount(3);
  await boxes.nth(1).dblclick();
  const editor = boxes.nth(1).getByRole('textbox', { name: 'Edit text' });
  await editor.fill('First item\nSecond item');
  await editor.press('Escape');
  await boxes.first().click();
  await chooseMenu(page, 'Change case', 'UPPERCASE');
  await panel.getByRole('button', { name: 'Strikethrough', exact: true }).click();
  await panel.getByRole('button', { name: 'Superscript', exact: true }).click();
  const listStyle = panel.getByRole('button', { name: 'Bullets and numbering' });
  const listMenu = page.getByRole('menu', { name: 'Bullets and numbering' });
  await listStyle.click();
  await expect(listMenu.getByRole('menuitemradio')).toHaveCount(7);
  await listMenu.getByRole('menuitemradio', { name: 'Filled bullets' }).click();
  await expect(boxes.first().locator('.text-bullet')).toHaveText('•');
  await listStyle.press('ArrowDown');
  const filled = listMenu.getByRole('menuitemradio', { name: 'Filled bullets' });
  await expect(filled).toBeFocused();
  await expect(filled).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(listMenu).toBeHidden();
  await expect(listStyle).toBeFocused();
  await listStyle.press('ArrowUp');
  await expect(listMenu.getByRole('menuitemradio', { name: 'Roman numerals' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(listMenu.getByRole('menuitemradio', { name: 'Numbers', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(listMenu).toBeHidden();
  await expect(listStyle).toHaveText('Numbers');
  await listStyle.click();
  await expect(listMenu.getByRole('menuitemradio', { name: 'Numbers', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const menuBounds = (await listMenu.boundingBox())!;
  const ribbonBounds = (await panel.boundingBox())!;
  expect(menuBounds.y + menuBounds.height).toBeGreaterThan(ribbonBounds.y + ribbonBounds.height);
  await panel.getByRole('button', { name: 'Increase indent', exact: true }).click();
  await expect(listMenu).toBeHidden();
  await chooseMenu(page, 'Line spacing', '1.5');
  await chooseMenu(page, 'Character spacing', 'Loose');
  await chooseMenu(page, 'Vertical text alignment', 'Middle');
  await chooseMenu(page, 'Text columns', 'Two columns');
  await expect(boxes.first().getByText('SLIDE TITLE')).toBeVisible();

  await panel.getByRole('button', { name: 'Format Painter', exact: true }).click();
  await boxes.nth(1).click();
  await expect(boxes.nth(1).locator('.text-bullet')).toHaveText(['1.', '2.']);
  await expect(boxes.nth(1).getByText('First item')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(boxes.nth(1).locator('.text-content')).toHaveCSS('column-count', '2');

  await chooseMenu(page, 'Insert shape', 'Triangle');
  const shape = canvas.getByTestId('object-shape');
  await chooseMenu(page, 'Shape quick styles', 'Ocean');
  await chooseMenu(page, 'Shape outline options', 'Dashed');
  await chooseMenu(page, 'Shape outline options', 'Thick');
  await expect(shape.locator('polygon')).toHaveAttribute('stroke-width', '4');
  await chooseMenu(page, 'Arrange objects', 'Rotate Right 90°');
  await expect(shape).toHaveAttribute('style', /rotate\(90deg\)/);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const path = await (await download).path();
  const zip = await JSZip.loadAsync(await readFile(path));
  const slides = await Promise.all(
    zip.file(/^ppt\/slides\/[^/]+\.xml$/).map((entry) => entry.async('string')),
  );
  const xml = slides.find((slide) => slide.includes('SLIDE TITLE'))!;
  expect(xml).toContain('<a:buAutoNum type="arabicPeriod"/>');
  expect(xml).toContain('<a:lnSpc><a:spcPct val="150000"/></a:lnSpc>');
  expect(xml).toContain('strike="sngStrike" baseline="30000" spc="75"');
  expect(xml).toContain('anchor="ctr" numCol="2"');
  expect(xml).toContain('<a:prstDash val="dash"/>');

  await page.getByLabel('Import PPTX file').setInputFiles(path);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await page.getByRole('button', { name: 'Select slide 2', exact: true }).click();
  await expect(boxes.nth(1).locator('.text-bullet')).toHaveText(['1.', '2.']);
  await expect(boxes.nth(1).getByText('First item')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(shape.locator('polygon')).toHaveAttribute('stroke-width', '4');
});

test('ribbon commands and context menus round-trip slide, text, layout and drawing edits', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const canvas = page.getByTestId('slide-canvas');
  await expect(canvas).toBeVisible();
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  const panel = page.getByRole('tabpanel');
  await expect(page.getByRole('tablist', { name: 'Ribbon' }).getByRole('tab')).toHaveCount(12);
  await tab('Home').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Insert')).toHaveAttribute('aria-selected', 'true');
  await tab('File').click();
  await panel.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');

  const firstSlide = page.getByRole('button', { name: 'Select slide 1', exact: true });
  const menu = page.getByRole('menu', { name: 'Edit actions' });
  await firstSlide.click({ button: 'right' });
  await expect(menu.getByRole('menuitem', { name: 'Delete Slide' })).toBeDisabled();
  await menu.getByRole('menuitem', { name: 'New Slide' }).click();
  await expect(page.getByRole('button', { name: 'Select slide 2', exact: true })).toBeVisible();
  await firstSlide.focus();
  await page.keyboard.press('Shift+F10');
  await menu.getByRole('menuitem', { name: 'Delete Slide' }).click();
  await expect(page.getByRole('button', { name: 'Select slide 2', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)' }).click();
  await expect(page.getByRole('button', { name: 'Select slide 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Redo (Ctrl/Cmd+Shift+Z)' }).click();
  await expect(page.getByRole('button', { name: 'Select slide 2', exact: true })).toHaveCount(0);

  await canvas.click({ button: 'right', position: { x: 30, y: 30 } });
  await menu.getByRole('menuitem', { name: 'Insert Text Box' }).click();
  const text = canvas.getByTestId('object-text');
  await text.click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Edit Text' }).click();
  await text.getByRole('textbox', { name: 'Edit text' }).fill('An editable heading');
  await text.getByRole('textbox', { name: 'Edit text' }).press('Escape');
  await tab('Home').click();
  await chooseMenu(page, 'Font family', 'Georgia');
  await panel.getByRole('button', { name: 'Italic text' }).click();
  await panel.getByRole('button', { name: 'Underline text' }).click();
  await chooseMenu(page, 'Paragraph alignment', 'Center');

  await tab('Insert').click();
  await chooseMenu(page, 'Shapes', 'Triangle');
  const shape = canvas.getByTestId('object-shape').first();
  const yField = page.getByLabel('Y', { exact: true });
  await yField.fill('370');
  await yField.press('Enter');
  const xField = page.getByLabel('X', { exact: true });
  await xField.fill('810');
  await xField.press('Enter');
  await shape.click();
  await text.click({ modifiers: ['Shift'] });
  await expect(canvas.locator('.slide-object.selected')).toHaveCount(2);
  await tab('Home').click();
  await chooseMenu(page, 'Align and distribute', 'Align middle');
  const shapeMiddle = await shape.evaluate(
    (el) => parseFloat(el.style.top) + parseFloat(el.style.height) / 2,
  );
  const textMiddle = await text.evaluate((el) => parseFloat(el.style.top) + parseFloat(el.style.height) / 2);
  expect(textMiddle).toBeCloseTo(shapeMiddle);
  const beforeDrag = await Promise.all(
    [text, shape].map((item) => item.evaluate((el) => parseFloat(el.style.left))),
  );
  const dragBox = (await shape.boundingBox())!;
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + dragBox.width / 2 - 22, dragBox.y + dragBox.height / 2, { steps: 5 });
  await page.mouse.up();
  const afterDrag = await Promise.all(
    [text, shape].map((item) => item.evaluate((el) => parseFloat(el.style.left))),
  );
  expect(afterDrag[0] - beforeDrag[0]).toBeLessThan(-5);
  expect(afterDrag[0] - beforeDrag[0]).toBeCloseTo(afterDrag[1] - beforeDrag[1]);

  await text.click({ button: 'right' });
  await page.keyboard.press('Escape');
  await canvas.click({ position: { x: 10, y: 10 } });
  await text.click();
  await tab('Review').click();
  await panel.getByLabel('Object alt text').fill('A descriptive heading');
  await tab('Design').click();
  await panel.getByRole('button', { name: 'Mint background' }).click();
  await tab('Draw').click();
  await panel.getByRole('button', { name: 'Pen', exact: true }).click();
  const frame = (await canvas.boundingBox())!;
  const x = frame.x + frame.width * 0.68,
    y = frame.y + frame.height * 0.22;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y + 55, { steps: 14 });
  await page.mouse.up();
  const ink = canvas.locator('[data-ink="true"]');
  await expect(ink).toHaveCount(1);
  await panel.getByRole('button', { name: 'Eraser', exact: true }).click();
  await page.mouse.click(x + 32.5, y + 27.5);
  await expect(ink).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)' }).click();
  await expect(ink).toHaveCount(1);

  await tab('View').click();
  await panel.getByRole('button', { name: 'Gridlines' }).click();
  await expect(canvas.locator('.canvas-grid')).toBeVisible();
  await panel.getByRole('button', { name: 'Slide Sorter' }).click();
  await expect(page.getByRole('button', { name: 'Sort slide 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Sort slide 1' }).dblclick();
  await expect(canvas).toBeVisible();
  await tab('Home').click();
  await panel.getByRole('button', { name: 'Find', exact: true }).click();
  const find = page.getByRole('dialog', { name: 'Find in presentation' });
  await find.getByRole('searchbox').fill('editable heading');
  await find.getByRole('button', { name: /Slide 1.*editable heading/i }).click();
  await expect(text).toHaveClass(/selected/);
  await page.screenshot({ path: testInfo.outputPath('ribbon.png') });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const file = await (await download).path();
  const zip = await JSZip.loadAsync(await readFile(file));
  const slides = await Promise.all(zip.file(/^ppt\/slides\/[^/]+\.xml$/).map((part) => part.async('string')));
  const edited = slides.find((xml) => xml.includes('An editable heading'))!;
  expect(edited).toMatch(/<a:custGeom/);
  expect(edited).toContain('typeface="Georgia"');
  expect(edited).toContain('descr="A descriptive heading"');
  expect(edited).toMatch(/<p:bg>/);
  await page.getByLabel('Import PPTX file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await expect(canvas).toHaveCSS('background-color', 'rgb(226, 243, 236)');
  await expect(canvas.locator('[data-ink="true"]')).toHaveCount(1);
  await expect(text).toHaveAccessibleName('A descriptive heading');
});
