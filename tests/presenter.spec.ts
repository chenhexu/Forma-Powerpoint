import { expect, test } from '@playwright/test';

test('edits native notes and keeps them in a separate presenter window', async ({ page }, testInfo) => {
  await page.goto('/editor');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await page.getByRole('tab', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page.getByLabel('Presentation name')).toHaveValue('Untitled presentation');
  await page.getByRole('button', { name: 'Add blank slide', exact: true }).click();
  await page.getByRole('button', { name: 'Select slide 1', exact: true }).click();
  await page.getByRole('tab', { name: 'Slide Show', exact: true }).click();
  await page.getByRole('button', { name: 'Speaker Notes', exact: true }).click();
  const notes = page.getByRole('dialog', { name: 'Speaker Notes' });
  await notes.getByRole('textbox', { name: 'Notes for this slide' }).fill('Private reminder\nSecond paragraph');
  await notes.getByRole('button', { name: 'Save Notes' }).click();
  await expect(notes).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PPTX', exact: true }).click();
  const file = testInfo.outputPath('Forma Speaker Notes.pptx');
  await (await download).saveAs(file);
  await page.getByLabel('Import PPTX file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Presentation imported');
  await page.getByRole('tab', { name: 'Slide Show', exact: true }).click();
  await page.getByRole('button', { name: 'Speaker Notes', exact: true }).click();
  await expect(notes.getByRole('textbox')).toHaveValue('Private reminder\nSecond paragraph');
  await notes.getByRole('button', { name: 'Cancel' }).click();

  const popupEvent = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Presenter View', exact: true }).click();
  const popup = await popupEvent;
  await expect(popup.getByRole('heading', { name: 'Slide 1 of 2' })).toBeVisible();
  await expect(popup.getByText('Private reminder', { exact: false })).toBeVisible();
  await expect(page.getByTestId('presentation')).not.toContainText('Private reminder');
  await expect(popup.getByRole('region', { name: 'Upcoming slide' })).toBeVisible();
  await popup.getByRole('button', { name: 'Advance', exact: true }).click();
  await expect(popup.getByRole('heading', { name: 'Slide 2 of 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Exit presentation' }).click();
  await expect.poll(() => popup.isClosed()).toBe(true);
});
