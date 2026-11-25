import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const JSZip: typeof import('jszip') = createRequire(import.meta.url)('jszip');

async function newPresentation(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
}

test('pastes separate objects across slides and selects Morph without duplicating the slide', async ({
  page,
}) => {
  await newPresentation(page);
  const canvas = page.getByTestId('slide-canvas');
  const home = page.locator('.ribbon').getByRole('tabpanel');
  await home.getByRole('button', { name: 'Text Box', exact: true }).click();
  await home.getByRole('button', { name: 'Insert shape', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rectangle', exact: true }).click();
  await home.getByRole('button', { name: 'Selection pane', exact: true }).click();
  await page
    .locator('.layer-section')
    .getByRole('button', { name: 'Text box', exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(canvas.locator('.slide-object.selected')).toHaveCount(2);
  await page.keyboard.press('Meta+c');
  await page.getByRole('button', { name: 'Add blank slide', exact: true }).click();
  await page.keyboard.press('Meta+v');
  const pasted = await canvas
    .locator('[data-testid^="object-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
  expect(pasted).toHaveLength(2);
  expect(pasted.every((name) => name?.startsWith('!!Forma_'))).toBe(true);
  await page.getByRole('tab', { name: 'Transitions', exact: true }).click();
  await page.locator('.ribbon').getByRole('tabpanel').getByRole('button', { name: 'Morph', exact: true }).click();
  await expect(page.locator('.slides-sidebar .slide-row[data-slide-id]')).toHaveCount(2);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const file = await (await pending).path();
  const zip = await JSZip.loadAsync(await readFile(file));
  const slides = Object.values(zip.files).filter((entry) => /^ppt\/slides\/[^/]+\.xml$/.test(entry.name));
  expect(slides).toHaveLength(2);
  for (const slide of slides) {
    const xml = await slide.async('string');
    for (const name of pasted) expect(xml).toContain(`name="${name}"`);
  }
});

test('sets slide size and native branding, creates a layout, and reuses the chosen slide', async ({
  page,
}, info) => {
  await newPresentation(page);
  const canvas = page.getByTestId('slide-canvas');
  await page.locator('.ribbon').getByRole('tabpanel').getByRole('button', { name: 'Text Box', exact: true }).click();
  await page.getByRole('tab', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Save Slide as Layout', exact: true }).click();
  await page.getByLabel('Layout name').fill('Review Template');
  await page.getByRole('button', { name: 'Save Layout', exact: true }).click();
  await page.getByRole('button', { name: 'Slide Master', exact: true }).click();
  await page.getByLabel('Footer text').fill('Forma review');
  await page.getByRole('button', { name: 'Apply to Master' }).click();
  await expect(canvas).toContainText('Forma review');

  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Slide Size', exact: true }).click();
  await page.getByRole('button', { name: 'Standard (4:3)', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Slide Size' })
    .getByRole('button', { name: 'Apply', exact: true })
    .click();
  await expect(canvas).toHaveCSS('width', '960px');
  await page.getByRole('button', { name: 'Format Background', exact: true }).click();
  await page.getByRole('button', { name: 'Gradient', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Format Background' })
    .getByRole('button', { name: 'Apply', exact: true })
    .click();
  await expect(canvas).toHaveCSS('background-image', /linear-gradient/);
  await page.getByRole('tab', { name: 'Insert', exact: true }).click();
  await page.getByRole('button', { name: 'New Slide', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Review Template', exact: true }).click();
  await expect(canvas.getByTestId('object-text')).toContainText('Your next big idea');

  await page.getByRole('button', { name: 'Select slide 2', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add Section Here', exact: true }).click();
  await page.getByLabel('Section name').fill('Review');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Review 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select slide 2' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review 1', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const output = info.outputPath('Forma Slide Authoring.pptx');
  await (await pending).saveAs(output);

  await page.getByRole('button', { name: 'New Slide', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reuse Slides', exact: true }).click();
  await page.getByLabel('Choose a PPTX').setInputFiles(output);
  const reuse = page.getByRole('dialog', { name: 'Reuse Slides' });
  await reuse.getByRole('checkbox', { name: /Slide 1/ }).check();
  await reuse.getByRole('button', { name: 'Insert Selected Slides' }).click();
  await expect(page.locator('.slides-sidebar .slide-row[data-slide-id]')).toHaveCount(3);
  await expect(canvas).toHaveCSS('background-image', /linear-gradient/);
  const reused = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  await (await reused).saveAs(info.outputPath('Forma Reused Slide.pptx'));
});

test('groups and hides objects, then merges and edits editable freeforms', async ({ page }) => {
  await newPresentation(page);
  const canvas = page.getByTestId('slide-canvas');
  const layers = page.locator('.layer-section');
  const home = page.locator('.ribbon').getByRole('tabpanel');
  for (const shape of ['Rectangle', 'Ellipse']) {
    await home.getByRole('button', { name: 'Insert shape', exact: true }).click();
    await page.getByRole('menuitem', { name: shape, exact: true }).click();
  }
  await home.getByRole('button', { name: 'Selection pane', exact: true }).click();
  await layers.getByRole('button', { name: 'Rectangle', exact: true }).click({ modifiers: ['Shift'] });
  await home.getByRole('button', { name: 'Arrange objects', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Group', exact: true }).click();
  await expect(layers.locator('.layer-row[title="Grouped object"]')).toHaveCount(2);
  await layers.getByRole('button', { name: 'Hide Rectangle', exact: true }).click();
  await expect(canvas.getByTestId('object-shape')).toHaveCount(1);
  await layers.getByRole('button', { name: 'Show Rectangle', exact: true }).click();
  await home.getByRole('button', { name: 'Arrange objects', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Ungroup', exact: true }).click();
  await page.getByRole('tab', { name: 'Shape Format', exact: true }).click();
  await page.getByRole('button', { name: 'Merge Shapes', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Union', exact: true }).click();
  await expect(canvas.getByTestId('object-shape')).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit Points', exact: true }).click();
  await expect(canvas.getByRole('button', { name: 'Move shape point 1', exact: true })).toBeVisible();
});
