const idPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export default async function invite(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Use POST to send invitations.' });
  }
  const supabaseURL = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FORMA_INVITE_FROM;
  const origin = process.env.FORMA_SITE_URL || (
    process.env.VERCEL_PROJECT_PRODUCTION_URL && 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
  );
  if (!apiKey || !from || !origin || !supabaseURL || !publishableKey)
    return response.status(503).json({ error: 'Invitation email delivery is unavailable.' });
  if (!/^Bearer \S+$/.test(request.headers.authorization || ''))
    return response.status(401).json({ error: 'Sign in to send invitations.' });
  const { roomId, email } = request.body ?? {};
  if (typeof roomId !== 'string' || !idPattern.test(roomId) || typeof email !== 'string' || email.length > 254)
    return response.status(400).json({ error: 'Enter a valid email and shared presentation.' });

  try {
    const permission = await fetch(new URL('/rest/v1/rpc/forma_room_prepare_email', supabaseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publishableKey,
        Authorization: request.headers.authorization,
      },
      body: JSON.stringify({ p_id: roomId, p_email: email }),
      signal: AbortSignal.timeout(8000),
    });
    const recipient = await permission.json();
    if (!permission.ok) {
      return response.status(permission.status === 401 ? 401 : 403)
        .json({ error: recipient.message || 'The invitation could not be sent.' });
    }
    const link = new URL('/share/' + roomId, origin).toString();
    const title = recipient.title.replace(/[\r\n]/g, ' ').slice(0, 160);
    const delivery = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [recipient.email],
        subject: 'Forma invitation: ' + title,
        text: 'You were invited to “' + title + '” in Forma. Open the presentation and sign in with the Google account at ' +
          recipient.email + '.\n\n' + link,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!delivery.ok) return response.status(502).json({ error: 'Email delivery failed. You can send the link from your email app.' });
    return response.status(200).json({ sent: true });
  } catch {
    return response.status(502).json({ error: 'Email delivery failed. You can send the link from your email app.' });
  }
}
