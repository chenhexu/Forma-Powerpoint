import { expect, test } from '@playwright/test';

test('shares a deck by room code, merges concurrent edits, and restores a version for both editors', async ({
  browser,
}) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const one = await host.newPage();
  const two = await guest.newPage();
  try {
    await Promise.all([one.goto('/'), two.goto('/')]);
    const collaboration = (page: typeof one) =>
      page.getByRole('button', { name: 'Collaborate', exact: true });
    await collaboration(one).click();
    await one.getByRole('button', { name: 'Create Room', exact: true }).click();
    await expect(one.getByLabel('Room code', { exact: true })).toHaveValue(/^[\w-]{32}$/);
    const code = await one.getByLabel('Room code', { exact: true }).inputValue();
    await collaboration(two).click();
    await two.getByLabel('Enter room code').fill(code);
    await two.getByRole('button', { name: 'Join Room' }).click();
    await expect(two.getByText('2 people connected')).toBeVisible();
    await expect(one.getByText('2 people connected')).toBeVisible();
    await one.getByLabel('Version name').fill('Before changes');
    await one.getByRole('button', { name: 'Save Version' }).click();
    await expect(two.getByText('Before changes', { exact: false })).toBeVisible();
    await Promise.all([one.keyboard.press('Escape'), two.keyboard.press('Escape')]);

    const initial = await one.locator('.slide-row[data-slide-id]').count();
    await Promise.all([
      one.getByRole('button', { name: 'Add blank slide' }).click(),
      two.getByRole('button', { name: 'Add blank slide' }).click(),
    ]);
    await expect(one.locator('.slide-row[data-slide-id]')).toHaveCount(initial + 2);
    await expect(two.locator('.slide-row[data-slide-id]')).toHaveCount(initial + 2);
    await one.getByRole('tabpanel').getByRole('button', { name: 'Text Box', exact: true }).click();

    const selected = await one.locator('.slide-row.current').getAttribute('data-slide-id');
    await two.locator(`.slide-row[data-slide-id="${selected}"] .slide-thumb-button`).click();
    await expect(two.getByTestId('slide-canvas').getByTestId('object-text')).toHaveCount(1);

    await collaboration(one).click();
    await one.getByRole('button', { name: 'Restore', exact: true }).click();
    await one.getByRole('button', { name: 'Restore for Everyone' }).click();
    await expect(two.locator('.slide-row[data-slide-id]')).toHaveCount(initial);
    await collaboration(two).click();
    await two.getByRole('button', { name: 'Return to My Presentation' }).click();
    await expect(one.getByText('1 person connected')).toBeVisible();
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});
