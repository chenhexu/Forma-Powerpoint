import { expect, test } from '@playwright/test';

test('customizes Draw and Quick Access through Options and keeps the choices on reload', async ({ page }) => {
  await page.goto('/');
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await tab('Draw').click();
  await expect(panel.getByRole('button', { name: 'Pen', exact: true })).toBeVisible();
  await tab('Draw').click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Ribbon actions' })
    .getByRole('menuitem', { name: 'Customize the Ribbon…' })
    .click();
  const options = page.getByRole('dialog', { name: 'Forma Options' });
  const nav = options.getByRole('navigation', { name: 'Options categories' });
  await expect(nav.getByRole('button', { name: 'Customize Ribbon' })).toHaveAttribute('aria-current', 'true');
  await options.getByRole('checkbox', { name: 'Draw', exact: true }).uncheck();
  await nav.getByRole('button', { name: 'Quick Access Toolbar' }).click();
  await options.getByRole('checkbox', { name: 'Morph', exact: true }).uncheck();
  await options.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(tab('Draw')).toHaveCount(0);
  await expect(tab('Home')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Create Morph pair' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await expect(tab('Draw')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create Morph pair' })).toHaveCount(0);
  await tab('File').click();
  await panel.getByRole('button', { name: 'Options', exact: true }).click();
  await expect(nav.getByRole('button')).toHaveCount(10);
  await options.getByRole('textbox', { name: 'Comment author' }).fill('Slide Planner');
  await nav.getByRole('button', { name: 'Customize Ribbon' }).click();
  await options.getByRole('checkbox', { name: 'Draw', exact: true }).check();
  await options.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(tab('Draw')).toBeVisible();

  await tab('Insert').click();
  await panel.getByRole('button', { name: 'Comment', exact: true }).click();
  const comment = page.getByRole('dialog', { name: 'Slide Comments' });
  await expect(comment.getByRole('textbox', { name: 'Name' })).toHaveValue('Slide Planner');
});

test('opens collapsed ribbon commands from a tab and closes them after returning to the canvas', async ({
  page,
}) => {
  await page.goto('/');
  const canvas = page.getByTestId('slide-canvas');
  await expect(canvas).toBeVisible();
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  await page.getByRole('button', { name: 'Collapse the Ribbon', exact: true }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('tab', { name: 'Draw', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Pen', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Pen', exact: true }).click();
  await canvas.click({ position: { x: 10, y: 10 } });
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Expand the Ribbon', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Pen', exact: true })).toBeVisible();
});

test('reduces transition motion when enabled through Accessibility options', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  const panel = page.locator('.ribbon').getByRole('tabpanel');
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await tab('File').click();
  await panel.getByRole('button', { name: 'Options', exact: true }).click();
  const options = page.getByRole('dialog', { name: 'Forma Options' });
  await options.getByRole('button', { name: 'Accessibility', exact: true }).click();
  await options.getByRole('checkbox', { name: 'Reduce slide transition motion' }).check();
  await options.getByRole('button', { name: 'OK', exact: true }).click();
  await tab('Transitions').click();
  await panel.getByRole('button', { name: 'Fade', exact: true }).click();
  const duration = panel.getByRole('spinbutton', { name: 'Transition seconds', exact: true });
  await duration.fill('30');
  await duration.press('Enter');
  await panel.getByRole('button', { name: 'Preview Transition', exact: true }).click();
  await expect(page.getByTestId('editor-transition-preview')).toBeHidden({ timeout: 3000 });
  await expect(duration).toHaveValue('30');
});
