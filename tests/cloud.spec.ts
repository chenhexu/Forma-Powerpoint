import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { CloudDeckRow } from '../src/cloudStore';

const backend = 'https://forma-test.supabase.co';
const ownerId = '0609a0e3-3e4c-4530-8244-cf6653282be4';
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  'access-control-allow-headers': '*',
};

function fakeSupabase() {
  const decks = new Map<string, CloudDeckRow>();
  const parts = new Map<string, Buffer>();
  const providerCalls: string[] = [];
  let uploads = 0;
  let failedUpload = false;

  async function attach(context: BrowserContext) {
    await context.route(backend + '/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const json = (json: unknown, status = 200) => route.fulfill({ status, headers: cors, json });
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

      if (url.pathname === '/auth/v1/authorize') {
        providerCalls.push(url.searchParams.get('provider') ?? '');
        const callback = new URL(url.searchParams.get('redirect_to')!);
        callback.searchParams.set('code', 'mock-oauth-code');
        return route.fulfill({ status: 302, headers: { ...cors, location: callback.toString() } });
      }
      if (url.pathname === '/auth/v1/token') {
        expect(request.postDataJSON().code_verifier).toBeTruthy();
        return json({
          access_token: 'mock-supabase-session',
          refresh_token: 'mock-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: ownerId,
            email: 'writer@example.test',
            aud: 'authenticated',
            app_metadata: {},
            user_metadata: {},
          },
        });
      }
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
      if (request.headers().authorization !== 'Bearer mock-supabase-session')
        return json({ message: 'Unauthorized' }, 401);

      if (url.pathname === '/rest/v1/presentations') {
        const id = url.searchParams.get('id')?.slice(3);
        if (method === 'POST') {
          const value = request.postDataJSON();
          expect(value.owner_id).toBe(ownerId);
          const row = { ...value, revision: 1, trashed_at: null, updated_at: new Date().toISOString() };
          decks.set(row.id, row);
          return json(row, 201);
        }
        const row = id ? decks.get(id) : undefined;
        if (method === 'GET') return json(id ? (row ? [row] : []) : [...decks.values()]);
        if (method === 'PATCH') {
          if (!row || url.searchParams.get('revision') !== 'eq.' + row.revision) return json([]);
          if (url.searchParams.get('trashed_at') === 'is.null' && row.trashed_at) return json([]);
          Object.assign(row, request.postDataJSON(), {
            revision: row.revision + 1,
            updated_at: new Date().toISOString(),
          });
          return json([row]);
        }
      }
      if (url.pathname.startsWith('/storage/v1/object/forma-parts/')) {
        const part = url.pathname.split('/').slice(-3).join('/');
        expect(part.startsWith(ownerId + '/')).toBe(true);
        if (method === 'POST') {
          if (failedUpload) {
            return json({ message: 'Simulated failed upload' }, 500);
          }
          if (parts.has(part)) return json({ message: 'The resource already exists' }, 409);
          const body = new Response(new Uint8Array(request.postDataBuffer()!), {
            headers: { 'content-type': request.headers()['content-type'] },
          });
          const file = (await body.formData()).get('');
          expect(file).toBeInstanceOf(Blob);
          parts.set(part, Buffer.from(await (file as Blob).arrayBuffer()));
          uploads++;
          return json({ Key: 'forma-parts/' + part, Id: part }, 200);
        }
        const body = parts.get(part);
        if (!body) return json({ message: 'Missing storage part' }, 404);
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/octet-stream', body });
      }
      return json({ message: 'Unhandled test endpoint ' + url.pathname }, 404);
    });
  }

  return {
    attach,
    decks,
    providerCalls,
    uploads: () => uploads,
    blockUploads: (blocked: boolean) => {
      failedUpload = blocked;
    },
  };
}

async function account(page: Page) {
  await page.getByLabel('Account', { exact: true }).click();
}

test('uses the private cloud library while retaining guest edits and conflicting copies', async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(process.env.VITE_SUPABASE_URL !== backend, 'Start Vite with the mock Supabase settings.');
  test.setTimeout(90000);
  const mock = fakeSupabase();
  await mock.attach(page.context());
  let second: BrowserContext | undefined;
  const title = (page: Page) => page.getByRole('textbox', { name: 'Presentation name' });
  try {
    await page.goto('/editor');
    await expect(title(page)).toHaveValue('A new perspective');
    await title(page).fill('Cloud model deck');
    await account(page);
    await page.getByRole('button', { name: 'Save to My Decks', exact: true }).click();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page).toHaveURL(/\/editor$/);
    await expect(title(page)).toHaveValue('Cloud model deck');

    await account(page);
    await page.getByRole('button', { name: 'Save to My Decks', exact: true }).click();
    await expect(page).toHaveURL(/\/editor\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('slide-canvas').getByTestId('object-model')).toBeVisible();
    const firstId = new URL(page.url()).pathname.split('/').at(-1)!;
    const initialUploads = mock.uploads();
    expect(initialUploads).toBeGreaterThan(1);

    await title(page).fill('Synced model deck');
    await expect.poll(() => mock.decks.get(firstId)?.title).toBe('Synced model deck');
    expect(mock.uploads()).toBe(initialUploads);

    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      return canvas.toDataURL().split(',')[1];
    });
    mock.blockUploads(true);
    await page.getByLabel('Insert image file').setInputFiles({
      name: 'Image.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image, 'base64'),
    });
    await expect(page.getByRole('alert')).toContainText('Cloud save failed');
    expect(mock.uploads()).toBe(initialUploads);
    mock.blockUploads(false);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect.poll(() => mock.uploads()).toBe(initialUploads + 1);
    await expect(page.getByRole('alert')).toHaveCount(0);

    second = await browser.newContext({ baseURL, acceptDownloads: true });
    await mock.attach(second);
    const other = await second.newPage();
    await other.goto('/decks');
    await other.getByRole('button', { name: 'Continue with Microsoft' }).click();
    await other.getByRole('link', { name: 'Synced model deck', exact: true }).click();
    await expect(title(other)).toHaveValue('Synced model deck');
    await expect(other.getByTestId('slide-canvas').getByTestId('object-model')).toBeVisible();
    await expect(other.getByTestId('slide-canvas').getByTestId('object-image')).toBeVisible();
    expect(mock.providerCalls).toEqual(['google', 'azure']);
    const downloaded = other.waitForEvent('download');
    await other.getByRole('button', { name: 'Export PPTX', exact: true }).click();
    expect((await downloaded).suggestedFilename()).toMatch(/\.pptx$/);

    await page.context().setOffline(true);
    await title(page).fill('Offline changes');
    await expect(page.getByRole('alert')).toContainText('draft on this device');
    await title(other).fill('Other device changes');
    await expect.poll(() => mock.decks.get(firstId)?.title).toBe('Other device changes');
    await page.context().setOffline(false);
    await expect(page.getByRole('alert')).toContainText('Cloud save conflict');
    await page.getByRole('button', { name: 'Save a Copy', exact: true }).click();
    await expect.poll(() => mock.decks.size).toBe(2);
    await expect(title(page)).toHaveValue('Offline changes');
    expect(mock.decks.get(firstId)?.title).toBe('Other device changes');

    await page.getByRole('button', { name: 'Collaborate', exact: true }).click();
    await page.getByRole('button', { name: 'Create Room', exact: true }).click();
    await expect(page.getByLabel('Room code', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await title(page).fill('Temporary room changes');
    await page.getByRole('button', { name: 'Collaborate', exact: true }).click();
    await page.getByRole('button', { name: 'Return to My Presentation', exact: true }).click();
    await expect(title(page)).toHaveValue('Offline changes');

    await account(page);
    await page.getByRole('button', { name: 'My Decks', exact: true }).click();
    await page.getByRole('button', { name: 'Move Offline changes to Trash' }).click();
    await expect(page.getByRole('link', { name: 'Offline changes', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Trash', exact: true }).click();
    await page.getByRole('button', { name: 'Restore Offline changes' }).click();
    await expect(page.getByRole('heading', { name: 'Trash is empty' })).toBeVisible();
    await page.getByRole('button', { name: 'Presentations', exact: true }).click();
    await page.getByRole('link', { name: 'Other device changes', exact: true }).click();
    await expect(title(page)).toHaveValue('Other device changes');
    await account(page);
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/editor/' + firstId);
    await expect(page.getByRole('heading', { name: 'Sign in to Forma' })).toBeVisible();
  } finally {
    await second?.close();
  }
});
