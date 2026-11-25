import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const JSZip: typeof import('jszip') = createRequire(import.meta.url)('jszip');
async function blank(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
}

async function choice(page: Page, label: string, value: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page
    .getByRole('menu', { name: label })
    .getByRole('menuitemradio', { name: value, exact: true })
    .click();
}
async function number(page: Page, label: string, value: string) {
  const field = page.getByRole('spinbutton', { name: label, exact: true });
  await field.fill(value);
  await field.press('Enter');
}

test('plays the previous slide in the editor and stops a long transition without modifying it', async ({
  page,
}) => {
  await blank(page);
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  await page.getByRole('button', { name: 'Add blank slide', exact: true }).click();
  await page.getByRole('tab', { name: 'Transitions', exact: true }).click();
  await panel.getByRole('button', { name: 'Fade', exact: true }).click();
  await number(page, 'Transition seconds', '60');
  await panel.getByRole('button', { name: 'Preview Transition', exact: true }).click();
  const preview = page.getByTestId('editor-transition-preview');
  await expect(preview.getByText('Your next big idea')).toBeVisible();
  await expect(page.getByTestId('slide-canvas')).toBeHidden();
  await expect(page.getByTestId('presentation')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Stop Preview', exact: true }).click();
  await expect(preview).toBeHidden();
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Transition seconds' })).toHaveValue('60');
});

test('adds multiple effects, honors start and timing, and previews native effects after export', async ({
  page,
}, testInfo) => {
  await blank(page);
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  await page.getByRole('tab', { name: 'Animations', exact: true }).click();
  const pane = page.getByRole('region', { name: 'Animation Pane', exact: true });
  await expect(pane).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Exit effects', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1110, height: 760 });
  await expect(panel.getByRole('button', { name: 'Exit effects', exact: true })).toBeHidden();
  await panel.getByRole('button', { name: 'Fade', exact: true }).click();
  await number(page, 'Animation duration (seconds)', '0.1');

  await panel.getByRole('button', { name: 'Add Animation' }).click();
  const gallery = page.getByRole('dialog', { name: 'Add Animation' });
  await expect(gallery.getByRole('region', { name: 'Motion Paths', exact: true })).toBeVisible();
  await expect(gallery.locator('.animation-effect-tile').count()).resolves.toBeGreaterThan(175);
  await gallery
    .getByRole('region', { name: 'Emphasis', exact: true })
    .getByRole('button', { name: 'Spin', exact: true })
    .click();
  await choice(page, 'Animation Start', 'With Previous');
  await number(page, 'Animation delay (seconds)', '0.1');
  await number(page, 'Animation duration (seconds)', '0.2');

  await panel.getByRole('button', { name: 'Add Animation' }).click();
  await gallery
    .getByRole('region', { name: 'Exit', exact: true })
    .getByRole('button', { name: 'Disappear', exact: true })
    .click();
  await expect(pane.locator('.animation-pane-row')).toHaveCount(3);
  await pane.getByRole('button', { name: 'Preview Animations' }).click();
  const preview = page.getByTestId('editor-animation-preview');
  const text = preview.locator('[data-playback-object]');
  await expect(preview.getByRole('status')).toHaveText('Click to play step 1 of 2');
  await expect(text).toHaveCSS('visibility', 'hidden');
  await preview.click();
  await expect(preview.getByRole('status')).toHaveText('Click to play step 2 of 2');
  await expect(text).toHaveCSS('visibility', 'visible');
  await preview.click();
  await expect(preview.getByRole('status')).toHaveText('Preview finished');
  await expect(text).toHaveCSS('visibility', 'hidden');
  await page.keyboard.press('Escape');
  await expect(preview).toBeVisible();
  await panel.getByRole('button', { name: 'Stop Preview', exact: true }).click();
  await expect(preview).toBeHidden();

  await panel.getByRole('button', { name: 'Preview Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Preview Settings' });
  await choice(page, 'Preview speed', '2×');
  await settings.getByRole('checkbox', { name: 'Wait for clicks in animation previews' }).uncheck();
  await settings.getByRole('button', { name: 'Done', exact: true }).click();
  await pane.getByRole('button', { name: 'Preview Animations' }).click();
  await expect(preview.getByRole('status')).toHaveText('Preview finished');
  await pane.getByRole('button', { name: 'Stop Preview' }).click();

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const file = testInfo.outputPath('Animation.pptx');
  await (await pending).saveAs(file);
  const zip = await JSZip.loadAsync(await readFile(file));
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(xml).toContain('presetID="10" presetClass="entr"');
  expect(xml).toContain('presetID="8" presetClass="emph"');
  expect(xml).toContain('presetID="1" presetClass="exit"');
  expect(xml).toContain('nodeType="withEffect"');
  expect(xml).toMatch(/nodeType="withEffect"><p:stCondLst><p:cond delay="100"/);
  expect(xml).not.toContain('evt="onBegin"');

  await page.getByLabel('Import PPTX file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await page.getByRole('tab', { name: 'Animations', exact: true }).click();
  await expect(pane.locator('.animation-pane-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const presentation = page.getByTestId('presentation');
  const presented = presentation.locator('[data-playback-object]');
  await expect(presented).toHaveCSS('visibility', 'hidden');
  await presentation.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(presented).toHaveCSS('visibility', 'visible');
  await presentation.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(presented).toHaveCSS('visibility', 'hidden');
  await presentation.getByRole('button', { name: 'Exit presentation' }).click();
});

test('draws and previews a custom motion path', async ({ page }) => {
  await blank(page);
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  await page.getByRole('tab', { name: 'Animations', exact: true }).click();
  await panel.getByRole('button', { name: 'All animations', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Animation Effects' })
    .getByRole('button', { name: 'Custom Path', exact: true })
    .click();
  const canvas = page.getByTestId('animation-path-canvas');
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width * 0.25,
    y = bounds.y + bounds.height * 0.35;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y - 35, { steps: 8 });
  await page.mouse.move(x + 140, y + 25, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.getByRole('region', { name: 'Animation Pane' }).getByText('Custom Path', { exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Preview Animations' }).click();
  const preview = page.getByTestId('editor-animation-preview');
  const object = preview.locator('[data-playback-object]');
  const before = (await object.boundingBox())!;
  await preview.click();
  await expect(preview.getByRole('status')).toHaveText('Preview finished');
  const after = (await object.boundingBox())!;
  expect(after.x - before.x).toBeCloseTo(140, 0);
  expect(after.y - before.y).toBeCloseTo(25, 0);
});

test('previews a PowerPoint-authored paragraph animation and preserves its timing when adding an effect', async ({
  page,
}) => {
  const fixture = process.env.FORMA_CENTER_DECK;
  test.skip(!fixture, 'Set FORMA_CENTER_DECK to the PowerPoint-authored sample presentation.');
  await page.goto('/');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await page.getByLabel('Import PPTX file').setInputFiles(fixture!);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await page.getByRole('button', { name: 'Select slide 2', exact: true }).click();
  await page.getByRole('tab', { name: 'Animations', exact: true }).click();
  const pane = page.getByRole('region', { name: 'Animation Pane', exact: true });
  await expect(pane.getByText('Fade', { exact: true })).toBeVisible();
  await pane.getByRole('button', { name: 'Preview Animations' }).click();
  const preview = page.getByTestId('editor-animation-preview');
  const animated = preview.getByText('How about some animation?', { exact: true });
  await expect(animated).toHaveCSS('visibility', 'hidden');
  await preview.click();
  await expect(animated).toHaveCSS('visibility', 'visible');
  await pane.getByRole('button', { name: 'Stop Preview' }).click();

  await pane.getByRole('button', { name: 'Fade How about some animation?', exact: true }).click();
  await page.locator('.ribbon').getByRole('tabpanel').getByRole('button', { name: 'Add Animation' }).click();
  await page
    .getByRole('dialog', { name: 'Add Animation', exact: true })
    .getByRole('button', { name: 'Spin', exact: true })
    .click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const zip = await JSZip.loadAsync(await readFile(await (await pending).path()));
  const xml = await zip.file('ppt/slides/slide2.xml')!.async('string');
  expect(xml).toContain('<p:pRg st="0" end="0"');
  expect(xml).toContain('presetID="10" presetClass="entr"');
  expect(xml).toContain('<p:animRot by="21600000"');
});

test('opens category galleries with bigger controls and keeps timing inside the ribbon', async ({ page }) => {
  await blank(page);
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  await page.getByRole('tab', { name: 'Animations', exact: true }).click();
  const exit = panel.getByRole('button', { name: 'Exit effects', exact: true });
  const category = (await exit.boundingBox())!;
  const ribbon = (await panel.boundingBox())!;
  expect(category.height).toBeGreaterThanOrEqual(29);
  expect(category.y).toBeGreaterThanOrEqual(ribbon.y);
  expect(category.y + category.height).toBeLessThanOrEqual(ribbon.y + ribbon.height - 4);
  await exit.click();
  const gallery = page.getByRole('dialog', { name: 'Animation Effects', exact: true });
  await expect(gallery.getByRole('region', { name: 'Exit', exact: true })).toBeVisible();
  await expect(gallery.getByRole('region', { name: 'Entrance', exact: true })).toHaveCount(0);
  await expect(gallery.locator('.animation-search')).toHaveCSS('border-radius', '9px');
  const search = gallery.getByRole('searchbox', { name: 'Find an effect' });
  await search.fill('swivel');
  await expect(gallery.getByRole('button', { name: 'Swivel', exact: true })).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Disappear', exact: true })).toHaveCount(0);
  await gallery.getByRole('button', { name: 'Clear animation search' }).click();
  const vanish = gallery.getByRole('button', { name: 'Disappear', exact: true });
  await expect(vanish.locator('svg')).toHaveClass(/eye-off/);
  await vanish.click();
  const timing = panel.getByRole('region', { name: 'Timing', exact: true });
  for (const width of [1440, 980]) {
    await page.setViewportSize({ width, height: 760 });
    const labels = await timing.locator('.number-field').evaluateAll((items) => {
      const group = items[0].closest('.ribbon-group')!;
      const caption = group.querySelector('.ribbon-group-label')!.getBoundingClientRect();
      const ribbon = group.closest('.ribbon-panel')!.getBoundingClientRect();
      return items.every(
        (item) =>
          item.getBoundingClientRect().top >= ribbon.top &&
          item.getBoundingClientRect().bottom <= caption.top,
      );
    });
    expect(labels).toBe(true);
  }
});

test('edits timing from the pane menu and plays object-triggered effects after PPTX reimport', async ({
  page,
}, testInfo) => {
  await blank(page);
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await tab('Home').click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  await tab('Animations').click();
  await panel.getByRole('button', { name: 'Fade', exact: true }).click();
  await tab('Home').click();
  await panel.getByRole('button', { name: 'Insert shape', exact: true }).click();
  await page
    .getByRole('menu', { name: 'Insert shape', exact: true })
    .getByText('Rectangle', { exact: true })
    .click();
  await number(page, 'X', '820');

  await tab('Animations').click();
  const pane = page.getByRole('region', { name: 'Animation Pane', exact: true });
  const row = pane.getByRole('button', { name: /^Fade Your next big idea/ });
  await row.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Animation actions', exact: true });
  await menu.getByRole('menuitem', { name: 'Timing…', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Fade', exact: true });
  await settings.getByRole('spinbutton', { name: 'Duration (seconds)' }).fill('0.2');
  await settings.getByRole('spinbutton', { name: 'Delay (seconds)' }).fill('0.1');
  await choice(page, 'Repeat', '2 times');
  await settings.getByRole('checkbox', { name: 'Rewind when done playing' }).check();
  await choice(page, 'Trigger on click of', 'Rectangle');
  await settings.getByRole('button', { name: 'Effect', exact: true }).click();
  await settings.getByRole('spinbutton', { name: 'Smooth start (seconds)' }).fill('0.05');
  await choice(page, 'After animation', 'Hide');
  await settings.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(pane.getByRole('region', { name: 'On click of Rectangle', exact: true })).toBeVisible();
  await expect(pane.locator('.animation-timeline-bar[data-group="entr"]')).toBeVisible();

  const preview = page.getByTestId('editor-animation-preview');
  await pane.getByRole('button', { name: 'Preview Animations', exact: true }).click();
  await expect(preview.getByRole('status')).toHaveText('Click a trigger object');
  await preview.click({ position: { x: 20, y: 20 } });
  await expect(preview.getByRole('status')).toHaveText('Click a trigger object');
  await preview.getByRole('button', { name: 'Trigger animation on Rectangle' }).click();
  await expect(preview.getByRole('status')).toHaveText('Preview finished');
  await expect(preview.getByText('Your next big idea')).toHaveCSS('visibility', 'hidden');
  await pane.getByRole('button', { name: 'Stop Preview', exact: true }).click();

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const file = testInfo.outputPath('Triggered animation.pptx');
  await (await pending).saveAs(file);
  const zip = await JSZip.loadAsync(await readFile(file));
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(xml).toContain('nodeType="interactiveSeq"');
  expect(xml).toContain('evtFilter="cancelBubble"');
  expect(xml).toContain('repeatCount="2000" accel="25000"');
  expect(xml).toContain('dur="200" fill="remove" nodeType="clickEffect"');
  expect(xml).toContain('afterEffect="1"');

  await page.getByLabel('Import PPTX file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await tab('Animations').click();
  await expect(pane.getByRole('region', { name: 'On click of Rectangle', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const show = page.getByTestId('presentation');
  await show.getByRole('button', { name: 'Trigger animation on Rectangle' }).click();
  await expect(show.getByText('Your next big idea')).toHaveCSS('visibility', 'hidden');
});

test('duplicates, reorders, and previews an effect from the animation pane', async ({ page }) => {
  await blank(page);
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  await page.getByRole('tab', { name: 'Animations', exact: true }).click();
  await panel.getByRole('button', { name: 'Fade', exact: true }).click();
  await panel.getByRole('button', { name: 'Add Animation', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add Animation', exact: true })
    .getByRole('button', { name: 'Spin', exact: true })
    .click();
  const pane = page.getByRole('region', { name: 'Animation Pane', exact: true });
  await pane.getByRole('button', { name: /^Actions for Spin on / }).click();
  const menu = page.getByRole('menu', { name: 'Animation actions', exact: true });
  await menu.getByRole('menuitem', { name: 'Move Earlier', exact: true }).click();
  await expect(pane.locator('.animation-pane-row').first()).toContainText('Spin');
  await pane.getByRole('button', { name: /^Fade Your next big idea/ }).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Duplicate Animation', exact: true }).click();
  await expect(pane.locator('.animation-pane-row')).toHaveCount(3);
  await pane.getByRole('button', { name: 'Hide Timeline', exact: true }).click();
  await expect(pane.locator('.animation-timeline-track')).toHaveCount(0);
  await pane.getByRole('button', { name: 'Play From selected animation' }).click();
  await expect(page.getByTestId('editor-animation-preview').getByRole('status')).toHaveText(
    'Preview finished',
  );
  await pane.getByRole('button', { name: 'Stop Preview', exact: true }).click();
  await pane.getByRole('button', { name: 'Remove animation', exact: true }).click();
  await expect(pane.locator('.animation-pane-row')).toHaveCount(2);
});

test('copies effects to another slide with Animation Painter and opens Add Animation from the object menu', async ({
  page,
}) => {
  await blank(page);
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await tab('Home').click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  const object = page.getByTestId('slide-canvas').getByTestId('object-text');
  await object.click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Edit actions' })
    .getByRole('menuitem', { name: 'Add Animation…', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Add Animation', exact: true })
    .getByRole('region', { name: 'Entrance', exact: true })
    .getByRole('button', { name: 'Fade', exact: true })
    .click();
  await number(page, 'Animation duration (seconds)', '1.25');
  await panel.getByRole('button', { name: 'Animation Painter', exact: true }).click();
  await page.getByRole('button', { name: 'Add blank slide', exact: true }).click();
  await tab('Home').click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  await object.click();
  const pane = page.getByRole('region', { name: 'Animation Pane', exact: true });
  await expect(pane.locator('.animation-pane-row')).toHaveCount(1);
  await expect(pane.getByRole('button', { name: 'Fade Your next big idea', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await tab('Animations').click();
  await expect(panel.getByRole('spinbutton', { name: 'Animation duration (seconds)' })).toHaveValue('1.25');
});

test('zooms and scrolls animation tracks, edits clips, and exports their native timing', async ({
  page,
}, testInfo) => {
  await blank(page);
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await tab('Home').click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  await tab('Animations').click();
  await panel.getByRole('button', { name: 'Fade', exact: true }).click();

  const pane = page.getByRole('region', { name: 'Animation Pane', exact: true });
  const row = pane.locator('.animation-pane-row');
  const clip = row.locator('.animation-timeline-bar');
  const ruler = pane.getByRole('slider', { name: 'Timeline playhead' });
  const scroll = pane.locator('.animation-pane-list');
  const start = pane.getByRole('spinbutton', { name: 'Start time (seconds)' });
  const end = pane.getByRole('spinbutton', { name: 'End time (seconds)' });

  await expect(row).toHaveCSS('height', '26px');
  await expect(row.locator('[title="On Click"]')).toHaveText('1');
  await expect(start).toHaveValue('0');
  await expect(end).toHaveValue('0.5');

  const tick = ruler.locator('.animation-ruler-tick').nth(1);
  const scale = async () => {
    const label = Number((await tick.textContent())!.replace('s', ''));
    return (await tick.evaluate((node) => parseFloat(node.style.left))) / label;
  };
  const initialScale = await scale();
  await pane.getByRole('button', { name: 'Zoom in timeline', exact: true }).click();
  await expect.poll(scale).toBeGreaterThan(initialScale);
  await expect.poll(() => scroll.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
  const label = row.locator('.animation-track-label');
  const left = (await label.boundingBox())!.x;
  await scroll.evaluate((node) => {
    node.scrollLeft = 50;
  });
  await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(async () => (await label.boundingBox())!.x).toBe(left);
  await scroll.evaluate((node) => {
    node.scrollLeft = 0;
  });

  async function drag(handle: typeof clip, distance: number) {
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + distance, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
  }

  await drag(clip, Math.round((await scale()) * 0.15));
  await expect.poll(async () => Number(await start.inputValue())).toBeGreaterThan(0.12);
  expect(Number(await end.inputValue()) - Number(await start.inputValue())).toBeCloseTo(0.5, 3);
  const previousEnd = Number(await end.inputValue());
  await drag(clip.locator('[data-trim="end"]'), Math.round((await scale()) * 0.1));
  await expect.poll(async () => Number(await end.inputValue())).toBeGreaterThan(previousEnd + 0.07);
  const extendedEnd = await end.inputValue();
  await drag(clip.locator('[data-trim="start"]'), Math.round((await scale()) * 0.05));
  await expect.poll(async () => Number(await start.inputValue())).toBeGreaterThan(0.17);
  await expect(end).toHaveValue(extendedEnd);

  await number(page, 'Start time (seconds)', '0.25');
  await number(page, 'End time (seconds)', '0.75');
  await expect(panel.getByRole('spinbutton', { name: 'Animation duration (seconds)' })).toHaveValue('0.5');
  await expect(panel.getByRole('spinbutton', { name: 'Animation delay (seconds)' })).toHaveValue('0.25');

  await ruler.press('Home');
  await ruler.press('ArrowRight');
  await ruler.press('ArrowRight');
  await ruler.press('ArrowRight');
  await pane.getByRole('button', { name: /^Actions for Fade on / }).click();
  await page.getByRole('menuitem', { name: 'Move to Playhead', exact: true }).click();
  await expect(start).toHaveValue('0.3');
  await expect(end).toHaveValue('0.8');

  await ruler.press('End');
  await expect(ruler).toHaveAttribute('aria-valuenow', '0.8');
  await pane.getByRole('button', { name: 'Play from playhead' }).click();
  await expect(page.getByTestId('editor-animation-preview').getByRole('status')).toHaveText(
    'Preview finished',
  );
  await pane.getByRole('button', { name: 'Stop Preview', exact: true }).click();

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const file = testInfo.outputPath('Timeline timing.pptx');
  await (await pending).saveAs(file);
  const zip = await JSZip.loadAsync(await readFile(file));
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(xml).toMatch(
    /presetID="10" presetClass="entr"[^>]+dur="500"[^>]+nodeType="clickEffect"><p:stCondLst><p:cond delay="300"/,
  );

  await page.setViewportSize({ width: 640, height: 620 });
  await expect(pane).toBeVisible();
  const canvas = await page.locator('.canvas-area').boundingBox();
  expect((await pane.boundingBox())!.y).toBeGreaterThan(canvas!.y);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(640);
});
