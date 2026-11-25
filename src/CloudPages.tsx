import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FilePlus2, Presentation, RotateCcw, Trash2, Upload } from 'lucide-react';
import Editor from './App';
import { Brand, SiteHeader, type EditorAccount } from './Site';
import { deckPath } from './authClient';
import { createCloudDeck, listCloudDecks, moveCloudDeck, type CloudDeckInfo } from './cloudStore';
import { openCloudWorkspace, type CloudWorkspace } from './cloudWorkspace';
import { createProject, importPptx, releaseProject } from './pptx';
import type { Project } from './types';

const detail = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';

export function Library({ account, ownerId }: { account: EditorAccount; ownerId: string }) {
  const [decks, setDecks] = useState<CloudDeckInfo[]>();
  const [trash, setTrash] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);

  async function refresh() {
    setError('');
    try {
      setDecks(await listCloudDecks());
    } catch (error) {
      setError(detail(error));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create(input?: File) {
    setBusy(input ? 'Importing presentation…' : 'Creating presentation…');
    setError('');
    let project: Project | undefined;
    try {
      if (input && input.size > 150 * 1024 * 1024)
        throw new Error('Please use a presentation smaller than 150 MB.');
      project = input
        ? await importPptx(new Uint8Array(await input.arrayBuffer()), input.name)
        : await createProject();
      const deck = await createCloudDeck(ownerId, project);
      location.assign(deckPath(deck.id));
    } catch (error) {
      setError(detail(error));
      setBusy('');
    } finally {
      if (project) releaseProject(project);
    }
  }

  async function move(deck: CloudDeckInfo) {
    setError('');
    setBusy(trash ? 'Restoring deck…' : 'Moving deck to Trash…');
    try {
      const updated = await moveCloudDeck(deck, !trash);
      setDecks((items) => items?.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setError(detail(error));
    } finally {
      setBusy('');
    }
  }

  const visible = decks?.filter((deck) => Boolean(deck.trashed_at) === trash);
  return (
    <div className="site library-site">
      <SiteHeader account={account} />
      <main className="deck-library">
        <div className="deck-library-heading">
          <div>
            <h1>My Decks</h1>
            {account.email && <p>{account.email}</p>}
          </div>
          <div className="site-actions">
            <input
              type="file"
              accept=".pptx"
              hidden
              ref={file}
              onChange={(event) => {
                const input = event.target.files?.[0];
                event.target.value = '';
                if (input) void create(input);
              }}
            />
            <button
              className="site-button outline"
              type="button"
              disabled={!!busy}
              onClick={() => file.current?.click()}
            >
              <Upload size={17} /> Import PPTX
            </button>
            <button
              className="site-button primary"
              type="button"
              disabled={!!busy}
              onClick={() => void create()}
            >
              <FilePlus2 size={17} /> New presentation
            </button>
          </div>
        </div>
        <div className="deck-library-controls" aria-label="Library view">
          <button type="button" aria-pressed={!trash} onClick={() => setTrash(false)}>
            Presentations
          </button>
          <button type="button" aria-pressed={trash} onClick={() => setTrash(true)}>
            Trash
          </button>
        </div>
        {busy && (
          <p role="status" className="site-status">
            {busy}
          </p>
        )}
        {error && (
          <div className="site-error" role="alert">
            {error}{' '}
            <button type="button" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        )}
        {!decks && !error && (
          <p role="status" className="site-status">
            Loading decks…
          </p>
        )}
        {visible?.length === 0 && (
          <div className="deck-empty">
            {trash ? <Trash2 size={24} /> : <Presentation size={28} />}
            <h2>{trash ? 'Trash is empty' : 'No cloud decks yet'}</h2>
            {!trash && <p>Create a presentation or import a PPTX to get started.</p>}
          </div>
        )}
        {!!visible?.length && (
          <ul className="deck-list">
            {visible.map((deck) => (
              <li key={deck.id}>
                <span className="deck-icon">
                  <Presentation size={21} />
                </span>
                <div className="deck-row-title">
                  {trash ? <strong>{deck.title}</strong> : <a href={deckPath(deck.id)}>{deck.title}</a>}
                  <time dateTime={deck.updated_at}>
                    {new Date(deck.updated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </time>
                </div>
                <button
                  type="button"
                  className="site-icon-button"
                  disabled={!!busy}
                  aria-label={trash ? 'Restore ' + deck.title : 'Move ' + deck.title + ' to Trash'}
                  title={trash ? 'Restore' : 'Move to Trash'}
                  onClick={() => void move(deck)}
                >
                  {trash ? <RotateCcw size={17} /> : <Trash2 size={17} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

export function CloudEditor({
  account,
  id,
  ownerId,
}: {
  account: EditorAccount;
  id: string;
  ownerId: string;
}) {
  const [workspace, setWorkspace] = useState<CloudWorkspace>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void openCloudWorkspace(ownerId, id).then(
      (workspace) => {
        if (active) setWorkspace(workspace);
        else releaseProject(workspace.project);
      },
      (error) => {
        if (active) setError(detail(error));
      },
    );
    return () => {
      active = false;
    };
  }, [ownerId, id]);
  if (workspace) return <Editor account={account} cloud={workspace} />;
  return (
    <div className="site auth-page">
      <Brand />
      <main className="site-auth-card">
        <h1>{error ? 'Couldn’t open the deck' : 'Opening presentation…'}</h1>
        {error && (
          <p role="alert" className="site-error">
            {error}
          </p>
        )}
        {error && (
          <a className="site-button outline" href="/decks">
            <ArrowLeft size={16} /> My Decks
          </a>
        )}
      </main>
    </div>
  );
}
