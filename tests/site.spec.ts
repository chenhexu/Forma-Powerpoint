import { expect, test } from '@playwright/test';

test('opens the editor from the public home page and keeps the guest draft', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Give it dimension');
  await expect(page.getByRole('img', { name: /Forma editor/ })).toBeVisible();
  await page.getByRole('link', { name: 'Open Editor', exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  const title = page.getByRole('textbox', { name: 'Presentation name' });
  await expect(title).toHaveValue('A new perspective');
  await title.fill('Guest recovery from home');
  await page.getByRole('button', { name: 'Forma home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Open Editor', exact: true }).click();
  await expect(title).toHaveValue('Guest recovery from home');
});
