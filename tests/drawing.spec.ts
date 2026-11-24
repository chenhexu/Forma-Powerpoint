import { expect, test, type Page } from '@playwright/test';

async function draw(page: Page, points: [number, number][]) {
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
}

test('selects and styles ink with the lasso, erases part of a stroke, and exports ink shapes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  const canvas = page.getByTestId('slide-canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('tab', { name: 'Draw', exact: true }).click();
  const panel = page.getByRole('tabpanel');
  const stroke = canvas.locator('[data-ink="true"]');
  const { x, y, width, height } = (await canvas.boundingBox())!;
  const lineY = y + height * 0.55;
  const left = x + width * 0.25;
  const right = x + width * 0.75;
  const center = (left + right) / 2;

  await panel.getByRole('button', { name: 'Highlighter', exact: true }).click();
  await draw(page, [
    [left, lineY],
    [right, lineY],
  ]);
  await expect(stroke).toHaveCount(1);
  await expect(stroke.locator('polyline').first()).toHaveAttribute('stroke-opacity', '0.38');

  await panel.getByRole('button', { name: 'Lasso Select', exact: true }).click();
  await draw(page, [
    [left - 15, lineY - 18],
    [right + 15, lineY - 18],
    [right + 15, lineY + 18],
    [left - 15, lineY + 18],
    [left - 15, lineY - 18],
  ]);
  await expect(stroke).toHaveClass(/selected/);
  const opacity = panel.getByRole('spinbutton', { name: 'Ink opacity', exact: true });
  await opacity.fill('45');
  await opacity.press('Enter');
  await expect(stroke.locator('polyline').first()).toHaveAttribute('stroke-opacity', '0.45');

  await panel.getByRole('button', { name: 'Eraser mode', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Small Point Eraser', exact: true }).click();
  await draw(page, [
    [center, lineY - 20],
    [center, lineY + 20],
  ]);
  await expect(stroke).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)' }).click();
  await expect(stroke).toHaveCount(1);

  await panel.getByRole('button', { name: 'Pen', exact: true }).click();
  await draw(page, [
    [left, lineY + 50],
    [right, lineY + 50],
  ]);
  await panel.getByRole('button', { name: 'Lasso Select', exact: true }).click();
  await draw(page, [
    [left - 15, lineY + 35],
    [right + 15, lineY + 35],
    [right + 15, lineY + 72],
    [left - 15, lineY + 72],
    [left - 15, lineY + 35],
  ]);
  await panel.getByRole('button', { name: 'Ink to Shape', exact: true }).click();
  await expect(stroke).toHaveCount(1);
  await expect(canvas.getByRole('group', { name: 'Ink line' }).locator('.polygon-shape')).toBeVisible();

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  await page.getByLabel('Import PPTX file').setInputFiles((await (await pending).path())!);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await expect(stroke).toHaveCount(1);
  await expect(stroke.locator('polyline').first()).toHaveAttribute('stroke-opacity', '0.45');
  await expect(canvas.getByRole('group', { name: 'Ink line' }).locator('.polygon-shape')).toBeVisible();
});
