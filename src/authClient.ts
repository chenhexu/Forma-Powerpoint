import { createClient } from '@supabase/supabase-js';

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloudClient =
  url && key ? createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: false } }) : undefined;

export const deckIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const deckPath = (id: string) => '/editor/' + id;
