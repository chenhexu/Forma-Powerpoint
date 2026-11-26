import { CircleUserRound } from 'lucide-react';
import { useState } from 'react';

function AvatarPhoto({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export function AccountAvatar({ name, email, avatar }: { name?: string; email?: string; avatar?: string }) {
  const initials = (name ? name.split(/\s+/).slice(0, 2) : [email || ''])
    .map((word) => Array.from(word)[0] ?? '').join('').toUpperCase();
  if (!avatar && !initials) return <CircleUserRound size={17} aria-hidden="true" />;
  return (
    <span className="account-avatar" aria-hidden="true">
      {initials || <CircleUserRound size={17} />}
      {avatar && <AvatarPhoto key={avatar} src={avatar} />}
    </span>
  );
}
