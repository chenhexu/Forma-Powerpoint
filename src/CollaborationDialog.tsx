import { useState } from 'react';
import { SlideToolsDialog } from './SlideTools';
import { hasRoomCode, type RoomStatus } from './collaboration';
import { parseShareCode, type ShareRole } from './sharedRooms';

export function CollaborationDialog({
  status,
  create,
  join,
  leave,
  previous,
  checkpoint,
  restore,
  close,
  cloud,
}: {
  status: RoomStatus;
  create: () => void;
  join: (code: string) => void;
  leave: (returnToPrevious?: boolean) => void;
  previous: boolean;
  checkpoint: (name: string) => void;
  restore: (id: string) => void;
  close: () => void;
  cloud?: { signedIn: boolean; create: (role: ShareRole | null) => Promise<void>; signIn: () => void };
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [copy, setCopy] = useState('');
  const [version, setVersion] = useState<string>();
  const [mode, setMode] = useState<'invite' | 'link'>('invite');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const connected = status.state === 'connected';
  const destination = cloud && parseShareCode(code);
  return (
    <SlideToolsDialog title="Collaborate" onClose={close} className="collaboration-dialog">
      <div className="insert-form collaboration-form">
        {status.error && (
          <p className="insert-error" role="alert">
            {status.error}
          </p>
        )}
        {error && <p className="insert-error" role="alert">{error}</p>}
        {status.code ? (
          <>
            <p role="status">
              {connected
                ? `${status.people} ${status.people === 1 ? 'person' : 'people'} connected`
                : 'Reconnecting…'}
            </p>
            <label>
              Room code
              <input value={status.code} readOnly onFocus={(event) => event.currentTarget.select()} />
            </label>
            <div className="insert-form-row">
              <button
                type="button"
                className="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(status.code!);
                    setCopy('Code copied.');
                  } catch {
                    setCopy('Select the code to copy it.');
                  }
                }}
              >
                Copy Room Code
              </button>
              <button type="button" className="button" onClick={() => leave()}>
                Leave and Keep a Copy
              </button>
              {previous && (
                <button type="button" className="button" onClick={() => leave(true)}>
                  Return to My Presentation
                </button>
              )}
            </div>
            {copy && <span role="status">{copy}</span>}
            <p>
              Send the code to someone using the same Forma address. Anyone with the code can edit the shared
              deck.
            </p>
            <div className="room-history">
              <h3>Version History</h3>
              <form
                className="insert-form-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!name.trim() || !connected) return;
                  checkpoint(name);
                  setName('');
                }}
              >
                <label>
                  Version name
                  <input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
                </label>
                <button type="submit" className="button" disabled={!connected || !name.trim()}>
                  Save Version
                </button>
              </form>
              {[...status.versions].reverse().map((item) => (
                <div className="room-version" key={item.id}>
                  <span>
                    {item.name}{' '}
                    <small>
                      {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </small>
                  </span>
                  {version === item.id ? (
                    <>
                      <button type="button" className="button" onClick={() => setVersion(undefined)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={!connected}
                        onClick={() => {
                          restore(item.id);
                          setVersion(undefined);
                        }}
                      >
                        Restore for Everyone
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button"
                      disabled={!connected}
                      onClick={() => setVersion(item.id)}
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {cloud ? (
              <section className="room-history room-setup">
                <h3>Share this presentation</h3>
                <p>Create a shared copy with its own version history.</p>
                <div className="room-share-methods">
                  <label className="room-mode-card" data-selected={mode === 'invite'}>
                    <input type="radio" name="share-mode" checked={mode === 'invite'} onChange={() => setMode('invite')} />
                    <span><strong>Invite people</strong><small>Only invited Google accounts can join.</small></span>
                  </label>
                  <label className="room-mode-card" data-selected={mode === 'link'}>
                    <input type="radio" name="share-mode" checked={mode === 'link'} onChange={() => setMode('link')} />
                    <span><strong>Share a link</strong><small>Anyone with the link can join with the access level you choose.</small></span>
                  </label>
                </div>
                <button type="button" className="button primary room-create-button" disabled={creating} onClick={async () => {
                  if (!cloud.signedIn) return cloud.signIn();
                  setError('');
                  setCreating(true);
                  try {
                    await cloud.create(mode === 'link' ? 'viewer' : null);
                  } catch (error) {
                    setError(error instanceof Error ? error.message : 'The room could not be created.');
                  } finally {
                    setCreating(false);
                  }
                }}>{creating ? 'Creating shared workspace…' : cloud.signedIn ? 'Create shared workspace' : 'Sign in to share'}</button>
              </section>
            ) : (
              <>
                <p>Create a room for this presentation or enter a code to open someone else’s deck.</p>
                <button type="button" className="button primary" disabled={status.state === 'connecting'} onClick={create}>Create Room</button>
              </>
            )}
            <form
              className="insert-form room-join-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (destination) location.assign(destination);
                else if (hasRoomCode(code) && status.state !== 'connecting') join(code.trim());
              }}
            >
              <label>
                {cloud ? 'Enter a share link or room code' : 'Enter room code'}
                <input value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} />
              </label>
              <button
                type="submit"
                className="button"
                disabled={creating || (!destination && !hasRoomCode(code)) || status.state === 'connecting'}
              >
                Join Room
              </button>
            </form>
            {status.state === 'connecting' && <p role="status">Connecting…</p>}
            {previous && (
              <button type="button" className="button" onClick={() => leave(true)}>
                Return to My Presentation
              </button>
            )}
          </>
        )}
      </div>
    </SlideToolsDialog>
  );
}
