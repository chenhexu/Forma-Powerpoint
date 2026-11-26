import { createClient } from '@supabase/supabase-js';

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloudClient =
  url && key ? createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: false } }) : undefined;

let guestClient: ReturnType<typeof createClient> | undefined;
export function collaborationGuestClient() {
  if (!url || !key) throw new Error('Cloud collaboration is unavailable on this server.');
  return guestClient ??= createClient(url, key, {
    auth: { storageKey: 'forma-room-guest-auth', detectSessionInUrl: false },
  });
}

export const deckIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const deckPath = (id: string) => '/editor/' + id;
