import { del, get, set } from 'idb-keyval';
import type { User } from '@supabase/supabase-js';

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function photoURL(value: unknown) {
  const source = text(value);
  if (!source) return;
  try {
    const url = new URL(source);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {}
}

export function accountProfile(user?: User) {
  const profiles = [user?.user_metadata, ...(user?.identities ?? []).map((identity) => identity.identity_data)];
  return {
    name: profiles.map((profile) => text(profile?.full_name) ?? text(profile?.name)).find(Boolean),
    picture: profiles.map((profile) => photoURL(profile?.picture) ?? photoURL(profile?.avatar_url)).find(Boolean),
  };
}

const photoKey = (userId: string) => 'forma-microsoft-avatar:' + userId;
export const readMicrosoftPhoto = (userId: string) => get<Blob>(photoKey(userId));

export async function cacheMicrosoftPhoto(userId: string, accessToken: string) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me/photos/48x48/$value', {
    headers: { Authorization: 'Bearer ' + accessToken },
    redirect: 'error',
    signal: AbortSignal.timeout(2500),
  });
  if (response.status === 404) {
    await del(photoKey(userId));
    return;
  }
  if (!response.ok) return;
  const photo = await response.blob();
  if (photo.size > 0 && photo.size <= 256 * 1024 && /^image\/(?:jpeg|jpg|png|webp)$/.test(photo.type)) {
    await set(photoKey(userId), photo);
  }
}
