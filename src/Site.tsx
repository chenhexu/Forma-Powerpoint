import { useEffect, useState, lazy, Suspense } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, Box, Cloud, Layers, LogOut, Presentation, Sparkles } from 'lucide-react';
import { cloudClient, deckIdPattern, deckPath } from './authClient';
import './site.css';

const Editor = lazy(() => import('./App'));
const Library = lazy(() => import('./CloudPages').then(({ Library }) => ({ default: Library })));
const CloudEditor = lazy(() => import('./CloudPages').then(({ CloudEditor }) => ({ default: CloudEditor })));
const signInReturnKey = 'forma-auth-return';

export type EditorAccount = {
  enabled: boolean;
  userId?: string;
  email?: string;
  signOut: () => Promise<void>;
};

const detail = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';

function returnPath(value: string | null) {
  if (value === '/editor' || value === '/decks') return value;
  const match = value?.match(/^\/editor\/([^/]+)$/);
  return match && deckIdPattern.test(match[1]) ? deckPath(match[1]) : '/decks';
}

export function signInPath(next: string) {
  return '/sign-in?' + new URLSearchParams({ next: returnPath(next) });
}

export function Brand() {
  return (
    <a className="site-brand" href="/" aria-label="Forma home">
      <Layers size={23} /> forma
    </a>
  );
}

export function SiteHeader({ account }: { account: EditorAccount }) {
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  return (
    <>
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="/editor">Editor</a>
          {account.userId ? (
            <>
              <a href="/decks">My Decks</a>
              <button
                className="site-icon-button"
                type="button"
                disabled={signingOut}
                title="Sign out"
                aria-label="Sign out"
                onClick={() => {
                  setSigningOut(true);
                  void account.signOut().catch((error) => {
                    setError(detail(error));
                    setSigningOut(false);
                  });
                }}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <a className="site-button outline" href="/sign-in">
              Sign in
            </a>
          )}
        </nav>
      </header>
      {error && (
        <p className="site-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function Home({ account }: { account: EditorAccount }) {
  return (
    <div className="site landing">
      <SiteHeader account={account} />
      <main>
        <section className="site-hero">
          <div className="site-hero-copy">
            <h1>
              Make your point.
              <br />
              Give it <em>dimension.</em>
            </h1>
            <p>
              Edit PowerPoint decks in your browser. Add 3D models, build Morph transitions, and take your
              deck back to PowerPoint.
            </p>
            <div className="site-actions">
              <a className="site-button primary" href="/editor">
                Open Editor <ArrowRight size={17} />
              </a>
              {account.userId && (
                <a className="site-button outline" href="/decks">
                  My Decks
                </a>
              )}
            </div>
          </div>
          <figure className="site-editor-preview">
            <img
              src="/forma-editor.jpg"
              width="1390"
              height="840"
              alt="Forma editor with a slide featuring a purple 3D model and two Morph-linked slide thumbnails"
            />
          </figure>
        </section>
        <section className="site-features" aria-label="What you can do with Forma">
          <div>
            <Box size={21} />
            <h2>Work in 3D</h2>
            <p>Rotate and position models right on the slide.</p>
          </div>
          <div>
            <Sparkles size={21} />
            <h2>Animate with Morph</h2>
            <p>Preview movement between slides before you present.</p>
          </div>
          <div>
            <Presentation size={21} />
            <h2>Keep your PPTX</h2>
            <p>Open an existing deck and export an editable PowerPoint file.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function SignIn({ next }: { next: string }) {
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<'google' | 'azure'>();
  async function start(selected: 'google' | 'azure') {
    if (!cloudClient) return;
    setProvider(selected);
    setError('');
    try {
      sessionStorage.setItem(signInReturnKey, next);
      const { error } = await cloudClient.auth.signInWithOAuth({
        provider: selected,
        options: {
          redirectTo: new URL('/auth/callback', location.origin).toString(),
          scopes: selected === 'azure' ? 'email' : undefined,
        },
      });
      if (error) throw error;
    } catch (error) {
      setError(detail(error));
      setProvider(undefined);
    }
  }

  return (
    <div className="site auth-page">
      <Brand />
      <main className="site-auth-card">
        <Cloud size={26} />
        <h1>Sign in to Forma</h1>
        <p>Open your private decks and pick up where you left off on another device.</p>
        {cloudClient ? (
          <div className="site-auth-actions">
            <button
              type="button"
              className="site-button outline"
              disabled={!!provider}
              onClick={() => void start('google')}
            >
              {provider === 'google' ? 'Opening Google…' : 'Continue with Google'}
            </button>
            <button
              type="button"
              className="site-button outline"
              disabled={!!provider}
              onClick={() => void start('azure')}
            >
              {provider === 'azure' ? 'Opening Microsoft…' : 'Continue with Microsoft'}
            </button>
          </div>
        ) : (
          <p role="status">Cloud sign-in is unavailable on this server.</p>
        )}
        {error && (
          <p className="site-error" role="alert">
            {error}
          </p>
        )}
        <a className="site-text-link" href="/editor">
          Continue as guest <ArrowRight size={15} />
        </a>
      </main>
    </div>
  );
}

function AuthCallback({ query }: { query: URLSearchParams }) {
  const [error, setError] = useState('');
  const [next] = useState(() => returnPath(sessionStorage.getItem(signInReturnKey)));
  useEffect(() => {
    const code = query.get('code');
    const failure = query.get('error_description') ?? query.get('error');
    if (!code || failure || !cloudClient) {
      history.replaceState(null, '', '/auth/callback');
      setError(failure || 'The sign-in did not complete.');
      return;
    }
    void cloudClient.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          history.replaceState(null, '', '/auth/callback');
          setError(error.message);
        } else {
          sessionStorage.removeItem(signInReturnKey);
          location.replace(next);
        }
      })
      .catch((error) => {
        history.replaceState(null, '', '/auth/callback');
        setError(detail(error));
      });
  }, []);
  return (
    <div className="site auth-page">
      <Brand />
      <main className="site-auth-card">
        <h1>{error ? 'Sign-in interrupted' : 'Signing you in…'}</h1>
        {error && (
          <p className="site-error" role="alert">
            {error}
          </p>
        )}
        {error && (
          <a className="site-button primary" href={signInPath(next)}>
            Back to sign-in
          </a>
        )}
      </main>
    </div>
  );
}

export default function Site() {
  const [session, setSession] = useState<Session | null>();
  const path = location.pathname.replace(/\/$/, '') || '/';
  const search = new URLSearchParams(location.search);

  useEffect(() => {
    if (!cloudClient || path === '/auth/callback') return;
    const { data } = cloudClient.auth.onAuthStateChange((_, session) => setSession(session));
    return () => data.subscription.unsubscribe();
  }, [path]);

  const account: EditorAccount = {
    enabled: !!cloudClient,
    userId: session?.user.id,
    email: session?.user.email,
    signOut: async () => {
      if (!cloudClient) return;
      const { error } = await cloudClient.auth.signOut({ scope: 'local' });
      if (error) throw error;
      location.assign('/');
    },
  };

  if (path === '/') return <Home account={account} />;
  if (path === '/auth/callback') return <AuthCallback query={search} />;
  if (path === '/sign-in') return <SignIn next={returnPath(search.get('next'))} />;

  const match = path.match(/^\/editor\/([^/]+)$/);
  const id = match && deckIdPattern.test(match[1]) ? match[1] : undefined;
  if (path === '/editor') {
    return (
      <Suspense
        fallback={
          <div className="site route-loading" role="status">
            Opening editor…
          </div>
        }
      >
        <Editor account={account} />
      </Suspense>
    );
  }
  if (path === '/decks' || id) {
    if (cloudClient && session === undefined)
      return (
        <div className="site route-loading" role="status">
          Checking sign-in…
        </div>
      );
    if (!account.userId) return <SignIn next={id ? deckPath(id) : '/decks'} />;
    return (
      <Suspense
        fallback={
          <div className="site route-loading" role="status">
            Opening workspace…
          </div>
        }
      >
        {id ? (
          <CloudEditor key={account.userId + ':' + id} id={id} ownerId={account.userId} account={account} />
        ) : (
          <Library key={account.userId} ownerId={account.userId} account={account} />
        )}
      </Suspense>
    );
  }
  return (
    <div className="site auth-page">
      <Brand />
      <main className="site-auth-card">
        <h1>Page unavailable</h1>
        <a className="site-button outline" href="/">
          Back to Forma
        </a>
      </main>
    </div>
  );
}
