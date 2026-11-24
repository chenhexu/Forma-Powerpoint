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

async function slideXml(page: Page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const zip = await JSZip.loadAsync(await readFile(await (await waiting).path()));
  return Promise.all(zip.file(/^ppt\/slides\/[^/]+\.xml$/).map((part) => part.async('string')));
}

test('updates background and layout from the canvas menu and skips a hidden slide', async ({ page }) => {
  await blank(page);
  const canvas = page.getByTestId('slide-canvas');
  const editMenu = page.getByRole('menu', { name: 'Edit actions' });
  const open = () => canvas.click({ button: 'right', position: { x: 16, y: 16 } });
  await open();
  await editMenu.getByRole('menuitem', { name: 'Format Background…', exact: true }).click();
  const background = page.getByRole('dialog', { name: 'Format Background' });
  await background.getByRole('button', { name: 'Mint background' }).click();
  await background.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(canvas).toHaveCSS('background-color', 'rgb(226, 243, 236)');
  await open();
  await editMenu.getByRole('menuitem', { name: 'Slide Layout…', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Slide Layout' })
    .getByRole('button', { name: 'Title Only', exact: true })
    .click();
  await expect(canvas.getByText('Slide title', { exact: true })).toBeVisible();
  await open();
  await editMenu.getByRole('menuitemradio', { name: 'Ruler', exact: true }).click();
  await expect(page.locator('.canvas-ruler.horizontal')).toBeVisible();
  const add = page.getByRole('button', { name: 'Add blank slide', exact: true });
  await add.click();
  await add.click();
  await page.getByRole('button', { name: 'Select slide 2', exact: true }).click();
  await open();
  await editMenu.getByRole('menuitem', { name: 'Hide Slide', exact: true }).click();
  await expect(page.locator('.slide-row[data-hidden]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Select slide 1', exact: true }).click();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const show = page.getByTestId('presentation');
  await show.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(show.getByText('3 / 3', { exact: true })).toBeVisible();
  await show.getByRole('button', { name: 'Exit presentation', exact: true }).click();
  const slides = await slideXml(page);
  expect(slides.some((xml) => /<p:sld\s[^>]*\bshow="0"/.test(xml))).toBe(true);
  expect(slides[0]).toMatch(/e2f3ec/i);
});

test('previews gallery effects and exports native direction and advance settings', async ({ page }) => {
  await blank(page);
  await page.getByRole('button', { name: 'Add blank slide', exact: true }).click();
  await page.getByRole('tab', { name: 'Transitions', exact: true }).click();
  const ribbon = page.getByRole('tabpanel');
  const gallery = page.getByRole('dialog', { name: 'Transitions', exact: true });
  await ribbon.getByRole('button', { name: 'All transitions', exact: true }).click();
  await expect(gallery.locator('.transition-tile')).toHaveCount(49);
  await gallery.getByRole('button', { name: 'Origami', exact: true }).click();
  const duration = ribbon.getByRole('spinbutton', { name: 'Transition seconds', exact: true });
  await duration.fill('3');
  await duration.press('Enter');
  await ribbon.getByRole('button', { name: 'Preview Transition', exact: true }).click();
  const show = page.getByTestId('editor-transition-preview');
  await expect(show).toBeVisible();
  await expect(show.locator('.presentation-layer').first()).toHaveCSS('clip-path', /polygon/);
  await expect(page.getByTestId('presentation')).toHaveCount(0);
  await expect(show).toBeHidden();
  const origami = await slideXml(page);
  expect(origami.some((xml) => xml.includes('<p15:prstTrans prst="origami"'))).toBe(true);
  await ribbon.getByRole('button', { name: 'All transitions', exact: true }).click();
  await gallery.getByRole('button', { name: 'Clock', exact: true }).click();
  await ribbon.getByRole('button', { name: 'Effect Options', exact: true }).click();
  await page
    .getByRole('menu', { name: 'Effect Options', exact: true })
    .getByRole('menuitemradio', { name: 'Counterclockwise' })
    .click();
  await ribbon.getByRole('checkbox', { name: 'On Mouse Click' }).uncheck();
  await ribbon.getByRole('checkbox', { name: 'After', exact: true }).check();
  await ribbon.getByRole('spinbutton', { name: 'Advance after (seconds)' }).fill('2.5');
  await ribbon.getByRole('spinbutton', { name: 'Advance after (seconds)' }).press('Enter');
  await ribbon.getByRole('button', { name: 'Apply to All', exact: true }).click();
  const clock = await slideXml(page);
  expect(clock).toHaveLength(2);
  for (const slide of clock) {
    expect(slide).toContain('<p14:wheelReverse spokes="1"');
    expect(slide).toMatch(/advClick="0" advTm="2500"/);
  }
});

test('contains every transition thumbnail and keeps the gallery header visible while scrolling', async ({
  page,
}) => {
  await blank(page);
  await page.getByRole('tab', { name: 'Transitions', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'All transitions', exact: true });
  const gallery = page.getByRole('dialog', { name: 'Transitions', exact: true });
  const close = gallery.getByRole('button', { name: 'Close transitions' });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 760, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await trigger.click();
    await expect(gallery.locator('.transition-thumbnail')).toHaveCount(49);
    const overflow = await gallery.locator('.transition-thumbnail').evaluateAll((thumbnails) =>
      thumbnails.flatMap((thumbnail) => {
        const tile = thumbnail.closest('button')!;
        const icon = thumbnail.getBoundingClientRect();
        const button = tile.getBoundingClientRect();
        const fits =
          icon.left >= button.left &&
          icon.right <= button.right &&
          icon.top >= button.top &&
          icon.bottom <= button.bottom &&
          tile.scrollWidth === tile.clientWidth;
        return fits ? [] : [tile.textContent];
      }),
    );
    expect(overflow).toEqual([]);
    const content = gallery.locator('.transition-gallery-body');
    expect(await content.evaluate((el) => el.scrollWidth)).toBe(
      await content.evaluate((el) => el.clientWidth),
    );

    const initialClose = await close.boundingBox();
    await gallery.getByRole('button', { name: 'Fly Through', exact: true }).scrollIntoViewIfNeeded();
    if (viewport.height === 480) expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await close.boundingBox()).toEqual(initialClose);
    await page.keyboard.press('Escape');
    await expect(gallery).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});
