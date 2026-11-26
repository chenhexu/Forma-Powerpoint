import { useState } from 'react';
import { ChevronDown, Copy, Link2, LockKeyhole, Mail, Users } from 'lucide-react';
import { SlideToolsDialog } from './SlideTools';
import { guestShape, participantName, sharePath, type RoomParticipant, type ShareRole, type SharedRoom, type SharedRoomInfo } from './sharedRooms';

export const roleNames = { owner: 'Owner', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer' };
const roles = ['viewer', 'commenter', 'editor'] as const;
const shapes = ['●', '▲', '■', '◆', '⬟', '⬢', '★', '☾'];
const colors = ['#8054bf', '#176481', '#884669', '#25664f', '#935525', '#4f59a4', '#9b3a52', '#505c73'];

function Avatar({ person }: { person: RoomParticipant }) {
  const index = guestShape(person.id);
  const name = participantName(person);
  return (
    <span className="room-avatar" aria-hidden="true" style={{ background: colors[parseInt(person.id.slice(2, 4), 16) % colors.length] }}>
      {person.name ? person.name.trim().charAt(0).toUpperCase() : shapes[index]}
    </span>
  );
}

export function RoomPeople({ participants, open }: { participants: RoomParticipant[]; open: () => void }) {
  return (
    <button type="button" className="button room-people" onClick={open} aria-label={`People in this workspace (${participants.length})`}>
      {participants.slice(0, 4).map((person) => <span key={person.id} title={participantName(person)}><Avatar person={person} /></span>)}
      {participants.length > 4 && <small>+{participants.length - 4}</small>}
      {!participants.length && <Users size={16} />}
    </button>
  );
}

export function RolePicker({ value, change, label, disabled }: {
  value: ShareRole; change: (role: ShareRole) => void; label: string; disabled?: boolean;
}) {
  return (
    <span className="room-select">
      <select value={value} onChange={(event) => change(event.target.value as ShareRole)} aria-label={label} disabled={disabled}>
        {roles.map((role) => <option key={role} value={role}>{roleNames[role]}</option>)}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </span>
  );
}

export function ShareDialog({ room, info, close, error, retrying }: {
  room: SharedRoom; info: SharedRoomInfo; close: () => void; error?: string; retrying?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('editor');
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const [working, setWorking] = useState(false);
  const [mailRecipient, setMailRecipient] = useState('');
  const [versionName, setVersionName] = useState('');
  const [restore, setRestore] = useState<string>();
  const owner = info.self.role === 'owner';
  const editor = owner || info.self.role === 'editor';
  const inviteURL = new URL(sharePath(room.id), location.origin).toString();
  const canCopyToken = owner && !!info.linkRole && !!info.token;
  const linkURL = new URL(sharePath(room.id, canCopyToken ? info.token : null), location.origin).toString();
  const code = canCopyToken ? room.id + '.' + info.token : '';

  async function run(action: () => Promise<void>) {
    setProblem('');
    setNotice('');
    setMailRecipient('');
    setWorking(true);
    try {
      await action();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The request could not be completed.');
    } finally {
      setWorking(false);
    }
  }

  function copy(value: string, label: string) {
    void run(async () => {
      await navigator.clipboard.writeText(value);
      setNotice(label + ' copied.');
    });
  }

  const mailto = (address: string) => 'mailto:' + encodeURIComponent(address) + '?' + new URLSearchParams({
    subject: 'You’re invited to collaborate in Forma',
    body: 'You’ve been invited to collaborate on a presentation in Forma. Open the link and sign in with this Google account:\n\n' + inviteURL,
  }).toString().replace(/\+/g, '%20');

  return (
    <SlideToolsDialog title="Share presentation" onClose={close} className="share-dialog">
      <div className="insert-form share-form">
        {owner && (
          <>
            <section className="room-history share-section">
              <h3>General access</h3>
              <div className="share-access-row">
                {info.linkRole ? <Link2 size={18} /> : <LockKeyhole size={18} />}
                <span className="room-select">
                  <select aria-label="General access" value={info.linkRole ? 'link' : 'invite'} disabled={working}
                    onChange={(event) => void run(() => room.access(event.target.value === 'link' ? 'viewer' : null))}>
                    <option value="invite">Invite only</option>
                    <option value="link">Anyone with the link</option>
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </span>
                {info.linkRole && <RolePicker label="Link permission" disabled={working} value={info.linkRole}
                  change={(next) => void run(() => room.access(next))} />}
              </div>
              <p>{info.linkRole ? 'People outside your Google Workspace appear under a shape name.' : 'Only invited Google accounts can open this workspace.'}</p>
              <label>
                {canCopyToken ? 'Share link' : 'Invitation link'}
                <input value={linkURL} readOnly onFocus={(event) => event.currentTarget.select()} />
              </label>
              <div className="insert-form-row">
                <button type="button" className="button" disabled={working} onClick={() => copy(linkURL, 'Link')}>
                  <Copy size={14} /> Copy link
                </button>
                {canCopyToken && <>
                  <button type="button" className="button" disabled={working} onClick={() => copy(code, 'Room code')}>Copy room code</button>
                  <button type="button" className="button" disabled={working} onClick={() => {
                    if (window.confirm('Replace the share link and disconnect guests using the old link?')) void run(() => room.access(info.linkRole, true));
                  }}>Reset link</button>
                </>}
              </div>
            </section>
            <section className="room-history share-section">
              <h3>Invite by email</h3>
              <form className="insert-form-row share-invite-form" onSubmit={(event) => {
                event.preventDefault();
                const recipient = email.trim().toLowerCase();
                if (!recipient) return;
                void run(async () => {
                  await room.invite(recipient, role);
                  setEmail('');
                  setMailRecipient(recipient);
                  if (await room.sendEmail(recipient)) {
                    setMailRecipient('');
                    setNotice('Invitation email sent.');
                  } else {
                    setNotice('Access granted. Use your email app to send the invitation.');
                  }
                });
              }}>
                <label>Google account email
                  <input type="email" required maxLength={254} autoComplete="email" value={email}
                    onChange={(event) => setEmail(event.target.value)} />
                </label>
                <RolePicker label="Invitation permission" value={role} change={setRole} disabled={working} />
                <button type="submit" className="button primary" disabled={working}><Mail size={15} /> Invite</button>
              </form>
              <p className="share-email-hint">Access is granted in Forma. Automatic email delivery needs an email sender; otherwise, use your email app below.</p>
              {mailRecipient && <a className="button" href={mailto(mailRecipient)}><Mail size={15} /> Open email app</a>}
              {info.invites?.map((invite) => (
                <div className="room-version" key={invite.email}>
                  <span>{invite.email}<small className="room-person-email">{invite.joined ? 'Joined' : 'Awaiting sign-in'}</small></span>
                  <RolePicker label={`Permission for ${invite.email}`} value={invite.role} disabled={working}
                    change={(next) => void run(() => room.invite(invite.email, next))} />
                  <a className="button" href={mailto(invite.email)} title="Open email app" aria-label={`Email ${invite.email}`}>
                    <Mail size={15} />
                  </a>
                  <button type="button" className="button" disabled={working} aria-label={`Remove ${invite.email}`}
                    onClick={() => void run(() => room.invite(invite.email, null))}>Remove</button>
                </div>
              ))}
            </section>
          </>
        )}
        <section className="room-history">
          <h3>Here now <small>· {info.participants.length}</small></h3>
          {info.participants.map((person) => (
            <div className="room-person" key={person.id}>
              <Avatar person={person} />
              <span>{participantName(person)} {info.self.id === person.id && <small>(you)</small>}
                {person.email && person.email !== person.name && <small className="room-person-email">{person.email}</small>}
              </span>
              <small>{roleNames[person.role]}</small>
            </div>
          ))}
        </section>
        {editor && <details className="room-history">
          <summary>Version history</summary>
          <form className="insert-form-row" onSubmit={(event) => {
            event.preventDefault();
            if (versionName.trim()) void run(async () => { await room.checkpoint(versionName); setVersionName(''); });
          }}>
            <label>Version name<input maxLength={100} value={versionName} onChange={(event) => setVersionName(event.target.value)} /></label>
            <button className="button" type="submit" disabled={working || !versionName.trim()}>Save version</button>
          </form>
          {[...info.versions].reverse().map((version) => (
            <div key={version.id} className="room-version">
              <span>{version.name} <small>{new Date(version.date).toLocaleString()}</small></span>
              {restore === version.id
                ? <>
                    <button className="button" type="button" onClick={() => setRestore(undefined)}>Cancel</button>
                    <button type="button" className="button primary" disabled={working}
                      onClick={() => void run(async () => { await room.checkpoint(null, version.id); setRestore(undefined); })}>Restore for everyone</button>
                  </>
                : <button className="button" type="button" onClick={() => setRestore(version.id)}>Restore</button>}
            </div>
          ))}
        </details>}
        {notice && <p role="status">{notice}</p>}
        {(problem || error) && <p className="insert-error" role="alert">{problem || (retrying ? 'Reconnecting. ' + error : error)}</p>}
      </div>
    </SlideToolsDialog>
  );
}
