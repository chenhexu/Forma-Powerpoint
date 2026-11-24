import { expect, test } from '@playwright/test';

test('keeps the ribbon height and canvas area steady between Home and Insert', async ({ page }) => {
  await page.goto('/');
  const home = page.getByRole('tab', { name: 'Home', exact: true });
  const insert = page.getByRole('tab', { name: 'Insert', exact: true });
  const panel = page.getByRole('tabpanel');
  const area = page.locator('.canvas-area');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 640, height: 430 },
  ]) {
    await page.setViewportSize(viewport);
    await home.click();
    const homeHeight = (await panel.boundingBox())!.height;
    const homeArea = await area.boundingBox();
    const find = (await panel.getByRole('button', { name: 'Find', exact: true }).boundingBox())!;
    const replace = (await panel.getByRole('button', { name: 'Replace', exact: true }).boundingBox())!;
    expect(replace.x).toBe(find.x);
    expect(replace.y).toBeGreaterThanOrEqual(find.y + find.height);
    await insert.click();
    await expect(insert).toHaveAttribute('aria-selected', 'true');
    expect((await panel.boundingBox())!.height).toBe(homeHeight);
    expect(await area.boundingBox()).toEqual(homeArea);
  }
});

test('keeps ribbon and status bar in the viewport while editor sections scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 430 });
  await page.goto('/');
  const canvas = page.getByTestId('slide-canvas');
  await expect(canvas).toBeVisible();
  await canvas.getByTestId('object-model').click();
  const panels = page.locator('.properties');
  const slides = page.locator('.slides-list');
  const ribbon = page.getByRole('tablist', { name: 'Ribbon' });
  const footer = page.getByRole('contentinfo');
  const layout = () =>
    page.evaluate(() => ({
      w: innerWidth,
      h: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      x: scrollX,
      y: scrollY,
    }));
  await expect.poll(layout).toEqual({ w: 1000, h: 430, scrollWidth: 1000, scrollHeight: 430, x: 0, y: 0 });
  const ribbonBefore = await ribbon.boundingBox();
  const footerBefore = await footer.boundingBox();
  await panels.hover({ position: { x: 50, y: 95 } });
  await page.mouse.wheel(0, 350);
  await expect.poll(() => panels.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const add = page.getByRole('button', { name: 'Add blank slide' });
  for (let i = 0; i < 8; i++) await add.click();
  await slides.hover({ position: { x: 85, y: 70 } });
  await page.mouse.wheel(0, 450);
  await expect.poll(() => slides.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await ribbon.boundingBox()).toEqual(ribbonBefore);
  expect(await footer.boundingBox()).toEqual(footerBefore);

  const area = page.locator('.canvas-area');
  const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
  for (let i = 0; i < 5; i++) await zoomIn.click();
  await expect.poll(() => area.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(20);
  await area.hover({ position: { x: 20, y: 20 } });
  await page.mouse.wheel(0, 200);
  await expect.poll(() => area.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await footer.boundingBox()).toEqual(footerBefore);

  await page.setViewportSize({ width: 390, height: 650 });
  await expect.poll(layout).toEqual({ w: 390, h: 650, scrollWidth: 390, scrollHeight: 650, x: 0, y: 0 });
  await expect(panels).toBeHidden();
  await page.getByRole('button', { name: 'Fit slide', exact: true }).click();
  await expect.poll(() => canvas.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(250);
  await page.getByRole('button', { name: 'Open properties' }).click();
  await expect(panels).toBeVisible();
  await page.getByRole('button', { name: 'Close properties' }).click();
  await expect(panels).toBeHidden();
  expect(await footer.boundingBox()).toMatchObject({ y: 612 });
});

test('shows unavailable tabs, effects, timing fields and menu choices in gray', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  const panel = page.getByRole('tabpanel');
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  const gray = 'rgb(112, 112, 112)';
  await expect(tab('Record')).toBeEnabled();
  await tab('Slide Show').click();
  await tab('Slide Show').press('ArrowRight');
  await expect(tab('Record')).toBeFocused();

  await tab('Animations').click();
  const entrance = panel.getByRole('button', { name: 'Entrance effects', exact: true });
  const fade = panel.getByRole('button', { name: 'Fade', exact: true });
  const duration = panel.getByRole('spinbutton', { name: 'Animation duration (seconds)' });
  await expect(entrance).toBeDisabled();
  await expect(entrance).toHaveCSS('filter', 'grayscale(1)');
  await expect(fade).toBeDisabled();
  await expect(fade).toHaveCSS('color', gray);
  await expect(duration).toBeDisabled();
  await expect(duration).toHaveCSS('background-color', 'rgb(240, 240, 242)');

  await tab('Insert').click();
  await panel.getByRole('button', { name: 'Video', exact: true }).click();
  const videos = page.getByRole('menu', { name: 'Video', exact: true });
  const stock = videos.getByRole('menuitem', { name: 'Stock Videos', exact: true });
  await expect(stock).toBeDisabled();
  await expect(stock).toHaveCSS('filter', 'grayscale(1)');
  await expect(videos.getByRole('menuitem', { name: 'Video from File…', exact: true })).toHaveCSS(
    'filter',
    'none',
  );
  await page.keyboard.press('Escape');

  await tab('Home').click();
  await panel.getByRole('button', { name: 'Text Box', exact: true }).click();
  await tab('Animations').click();
  await expect(entrance).toBeEnabled();
  await expect(fade).toHaveCSS('filter', 'none');
  await fade.click();
  await expect(duration).toBeEnabled();
  await expect(duration).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('keeps Insert commands within the window and opens overflow commands on small screens', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await page.getByRole('tab', { name: 'Insert', exact: true }).click();
  const panel = page.getByRole('tabpanel');
  const more = panel.getByRole('button', { name: 'More Insert', exact: true });
  for (const width of [320, 390, 530, 640, 730, 880, 1040, 1130, 1300, 1410, 1440, 1920]) {
    await page.setViewportSize({ width, height: 760 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    await expect
      .poll(() => panel.evaluate((node) => node.scrollWidth - node.clientWidth), {
        message: `ribbon overflow at ${width}px`,
      })
      .toBe(0);
  }
  await expect(panel.getByRole('button', { name: 'Pen', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 640, height: 700 });
  await more.click();
  const dialog = page.getByRole('dialog', { name: 'More Insert', exact: true });
  await dialog.getByRole('button', { name: 'Symbol', exact: true }).click();
  await dialog.getByRole('menuitem', { name: '→ Right arrow', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('slide-canvas').getByText('→', { exact: true })).toBeVisible();
});
