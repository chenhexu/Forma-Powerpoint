import { expect, test, type Page } from '@playwright/test';

async function blankPresentation(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
}

test('places slides at the shown insertion edge and animates deletion', async ({ page }) => {
  await blankPresentation(page);
  const sidebar = page.locator('.slides-sidebar');
  const add = sidebar.getByRole('button', { name: 'Add blank slide' });
  await add.click();
  await add.click();
  const rows = sidebar.locator('.slide-row[data-slide-id]');
  const ids = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-slide-id')),
  );

  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const first = rows.first();
  const last = rows.last();
  const bounds = (await last.boundingBox())!;
  await first.dispatchEvent('dragstart', { dataTransfer: transfer });
  const drop = { dataTransfer: transfer, clientY: bounds.y + bounds.height - 1 };
  await last.dispatchEvent('dragover', drop);
  await expect(last).toHaveAttribute('data-drop', 'after');
  expect(await last.evaluate((element) => getComputedStyle(element, '::after').height)).toBe('3px');
  await last.dispatchEvent('drop', drop);
  expect(await last.getAttribute('data-slide-id')).toBe(ids[0]);
  await expect(sidebar.locator('[data-drop]')).toHaveCount(0);

  const moved = last.getByRole('button', { name: 'Select slide 3' });
  await moved.press('Meta+Shift+ArrowUp');
  await expect(first).toHaveAttribute('data-slide-id', ids[0]!);
  await first.getByRole('button', { name: 'Select slide 1' }).press('Delete');
  await expect(rows).toHaveCount(2);
  await expect(sidebar.locator('.slide-exit')).toHaveAttribute('aria-hidden', 'true');
  await expect(sidebar.locator('.slide-exit')).toHaveCount(0);
});

test('pans from an object and edits or drags each slide zoom independently', async ({ page }) => {
  await blankPresentation(page);
  const canvas = page.getByTestId('slide-canvas');
  await page.getByRole('tabpanel').getByRole('button', { name: 'Text Box', exact: true }).click();
  const object = canvas.getByTestId('object-text');
  const initial = (await canvas.boundingBox())!;
  const original = (await object.boundingBox())!;
  const start = { x: original.x + original.width / 2, y: original.y + original.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(start.x + 60, start.y + 25, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  const panned = (await canvas.boundingBox())!;
  expect(panned.x - initial.x).toBeCloseTo(60);
  expect(panned.y - initial.y).toBeCloseTo(25);
  expect((await object.boundingBox())!.x - original.x).toBeCloseTo(60);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await object.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Edit Text' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fit slide', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resize slide view' })).toHaveCount(0);
  const zoom = page.getByRole('button', { name: /^Slide zoom,/ });
  await zoom.click();
  const field = page.getByRole('textbox', { name: 'Slide zoom percentage' });
  const typed = Math.round(initial.width / 12.8) - 5;
  await field.fill(String(typed));
  await field.press('Enter');
  await expect(zoom).toHaveText(`${typed}%`);
  expect((await canvas.boundingBox())!.width).toBeCloseTo(typed * 12.8, 1);
  const handle = (await zoom.boundingBox())!;
  const center = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x - 24, center.y, { steps: 6 });
  await page.mouse.up();
  await expect(field).toHaveCount(0);
  await expect(zoom).toHaveText(`${typed - 12}%`);
  const resized = (await canvas.boundingBox())!.width;
  expect(resized).toBeLessThan(initial.width - 30);
  await expect(canvas).toHaveCSS('width', '1280px');
  await page.getByRole('button', { name: 'Add blank slide' }).click();
  expect((await canvas.boundingBox())!.width).toBeCloseTo(initial.width);
  await page.getByRole('button', { name: 'Select slide 1' }).click();
  expect((await canvas.boundingBox())!.width).toBeCloseTo(resized);
  await object.click();
  const x = (await object.boundingBox())!.x;
  await page.keyboard.press('Meta+ArrowRight');
  expect((await object.boundingBox())!.x - x).toBeCloseTo(1, 1);
  await page.keyboard.press('ArrowRight');
  expect((await object.boundingBox())!.x - x).toBeCloseTo(11, 1);
});

test('zooms around the cursor with a pinch or modified wheel', async ({ page }) => {
  await blankPresentation(page);
  const canvas = page.getByTestId('slide-canvas');
  const initial = (await canvas.boundingBox())!;
  const cursor = { x: initial.x + initial.width * 0.4, y: initial.y + initial.height * 0.4 };
  await page.mouse.move(cursor.x, cursor.y);
  // Chromium exposes a trackpad pinch as a wheel event with Control set.
  await canvas.dispatchEvent('wheel', { clientX: cursor.x, clientY: cursor.y, deltaY: -70, ctrlKey: true });
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(initial.width * 1.2);
  const enlarged = (await canvas.boundingBox())!;
  expect(Math.abs(enlarged.x + enlarged.width * 0.4 - cursor.x)).toBeLessThan(2);
  expect(Math.abs(enlarged.y + enlarged.height * 0.4 - cursor.y)).toBeLessThan(2);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 90);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeLessThan(enlarged.width - 20);
  const reduced = (await canvas.boundingBox())!.width;
  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event('gesturestart', { bubbles: true, cancelable: true }));
    element.dispatchEvent(
      Object.assign(new Event('gesturechange', { bubbles: true, cancelable: true }), { scale: 1.25 }),
    );
    element.dispatchEvent(new Event('gestureend', { bubbles: true, cancelable: true }));
  });
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(reduced * 1.2);
});

test('temporarily exposes one or two layers and keeps small overlaps intact', async ({ page }) => {
  await blankPresentation(page);
  const canvas = page.getByTestId('slide-canvas');
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Insert shape', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Rectangle', exact: true }).click();
  }
  const shapes = canvas.getByTestId('object-shape');
  await expect(shapes).toHaveCount(4);
  const width = page.getByLabel('Width', { exact: true });
  await width.fill('40');
  await width.press('Enter');
  await canvas.click({ position: { x: 10, y: 10 } });
  const dimmed = canvas.locator('[data-xray]');
  await page.keyboard.down('Control');
  await expect(dimmed).toHaveCount(1);
  await expect(shapes.nth(2)).toHaveAttribute('data-xray', 'true');
  await expect(shapes.nth(3)).not.toHaveAttribute('data-xray');
  await shapes.nth(1).click();
  await expect(shapes.nth(1)).toHaveClass(/selected/);
  await page.keyboard.up('Control');
  await expect(dimmed).toHaveCount(0);
  await page.keyboard.press('Shift');
  await page.keyboard.down('Shift');
  await expect(dimmed).toHaveCount(2);
  await expect(shapes.nth(1)).toHaveAttribute('data-xray', 'true');
  await expect(shapes.nth(2)).toHaveAttribute('data-xray', 'true');
  await page.keyboard.up('Shift');
  await expect(dimmed).toHaveCount(0);
});

test('creates a text box on double-click, keeps preset selection and shows text past the original height', async ({
  page,
}) => {
  await blankPresentation(page);
  const canvas = page.getByTestId('slide-canvas');
  await canvas.dblclick({ position: { x: 65, y: 70 } });
  const object = canvas.getByTestId('object-text');
  const editor = object.getByRole('textbox', { name: 'Edit text' });
  await expect(editor).toBeFocused();
  const content =
    'Bright ideas and several more words to make this text wrap over several lines of the text box.';
  await page.keyboard.insertText(content);
  await editor.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode()!;
    window.getSelection()!.setBaseAndExtent(node, 0, node, 6);
  });
  await page.getByRole('button', { name: 'Font size presets' }).click();
  const presets = page.getByRole('menu', { name: 'Font size presets' });
  await expect(presets.getByRole('menuitemradio', { name: '8 pt', exact: true })).toBeVisible();
  await presets.getByRole('menuitemradio', { name: '72 pt', exact: true }).click();
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('Bright');
  await expect(editor.getByText('Bright', { exact: true })).toHaveCSS('font-size', '96px');
  await editor.press('Escape');
  await expect(object).toContainText(content);
  const frame = object.locator('.text-frame');
  expect((await frame.boundingBox())!.height).toBeGreaterThan((await object.boundingBox())!.height);
  await expect(frame).toHaveCSS('overflow', 'visible');
});
