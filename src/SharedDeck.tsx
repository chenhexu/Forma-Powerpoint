import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare, Play } from 'lucide-react';
import Editor from './App';
import { Brand, signInPath, type EditorAccount } from './Site';
import { RoomPeople, ShareDialog, roleNames } from './ShareDialog';
import { InsertDialog, type InsertResult } from './InsertDialog';
import { SlidePlaybackFrame } from './SlidePlayback';
import { Presentation } from './Presentation';
import { participantName, SharedRoom, sharePath, type SharedRoomState } from './sharedRooms';
import { uid } from './types';

function RoomPage({ room, account }: { room: SharedRoom; account: EditorAccount }) {
  const state = useSyncExternalStore(room.subscribe, room.getState);
  if (state.revoked) return <Unavailable error={state.error} />;
  const editor = state.info.self.role === 'owner' || state.info.self.role === 'editor';
  return editor
    ? <Editor account={account} shared={{ room, state }} />
    : <RoomReader room={room} state={state} account={account} />;
}

function RoomReader({ room, state, account }: { room: SharedRoom; state: SharedRoomState; account: EditorAccount }) {
  const { project, info, error } = state;
  const { deck, assets } = project;
  const [slideIndex, setSlideIndex] = useState(0);
  const [comments, setComments] = useState(false);
  const [details, setDetails] = useState(false);
  const [present, setPresent] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [scale, setScale] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const index = Math.min(slideIndex, deck.slides.length - 1);
  const slide = deck.slides[index];
  const canComment = info.self.role === 'commenter';
  const name = participantName(info.self);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(entry.contentRect.width / deck.width, entry.contentRect.height / deck.height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [deck.width, deck.height]);

  async function save(result: InsertResult) {
    setCommentError('');
    try {
      if (result.type === 'comment') {
        await room.comment(slide.id, { id: uid(), text: result.text, replyTo: result.replyTo });
        setComments(false);
      } else if (result.type === 'comment-resolve') {
        await room.comment(slide.id, { id: result.id, resolved: result.resolved });
      }
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'The comment could not be saved.');
      setComments(false);
    }
  }

  return (
    <div className="site shared-reader">
      <header className="site-header">
        <Brand />
        <strong>{deck.name}</strong>
        <nav aria-label="Shared presentation">
          <RoomPeople participants={info.participants} open={() => setDetails(true)} />
          <span className="shared-role">{roleNames[info.self.role]}</span>
          <button className="site-button outline" type="button" onClick={() => setComments(true)}>
            <MessageSquare size={16} /> Comments
          </button>
          <button className="site-button outline" type="button" onClick={() => setPresent(true)}>
            <Play size={16} /> Present
          </button>
          {account.userId && <a className="site-text-link" href="/decks">My Decks</a>}
        </nav>
      </header>
      {(error || commentError) && <p className="site-error" role="alert">{commentError || 'Reconnecting. ' + error}</p>}
      <main className="shared-reader-stage" ref={stage}>
        {scale > 0 && <div className="shared-reader-slide" style={{ width: deck.width * scale, height: deck.height * scale }}>
          <div style={{ width: deck.width, height: deck.height, position: 'relative', transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <SlidePlaybackFrame current={slide} width={deck.width} height={deck.height} assets={assets} />
          </div>
        </div>}
      </main>
      <footer>
        <button className="site-icon-button" type="button" aria-label="Previous slide" disabled={index === 0}
          onClick={() => setSlideIndex(index - 1)}><ChevronLeft size={20} /></button>
        <span>Slide {index + 1} of {deck.slides.length}</span>
        <button className="site-icon-button" type="button" aria-label="Next slide" disabled={index + 1 === deck.slides.length}
          onClick={() => setSlideIndex(index + 1)}><ChevronRight size={20} /></button>
      </footer>
      {details && <ShareDialog room={room} info={info} close={() => setDetails(false)} />}
      {comments && <InsertDialog key={slide.id} state={{ type: 'comment', author: name }} slides={deck.slides}
        comments={slide.comments ?? []} fixedAuthor={name} readOnly={!canComment}
        close={() => setComments(false)} save={(result) => void save(result)} />}
      {present && <Presentation project={project} start={index} reduceMotion={false} allowWebLinks={false}
        onClose={() => setPresent(false)} />}
    </div>
  );
}

function Unavailable({ error, signIn }: { error?: string; signIn?: string }) {
  return <div className="site auth-page">
    <Brand />
    <main className="site-auth-card">
      <h1>{error ? 'Couldn’t open shared presentation' : 'Opening shared workspace…'}</h1>
      {error && <p className="site-error" role="alert">{error}</p>}
      {signIn && <a className="site-button outline" href={signIn}>Switch Google account</a>}
      {error && <a className="site-text-link" href="/editor">Open editor</a>}
    </main>
  </div>;
}

export default function SharedDeck({ id, token, account }: { id: string; token: string | null; account: EditorAccount }) {
  const [room, setRoom] = useState<SharedRoom>();
  const [error, setError] = useState('');
  const [useAccount, setUseAccount] = useState(!!account.userId);
  useEffect(() => {
    let active = true;
    let opened: SharedRoom | undefined;
    void SharedRoom.open(id, token, useAccount).then((value) => {
      if (!active) return value.close();
      opened = value;
      setRoom(value);
      value.start();
    }, (error) => {
      if (active) setError(error instanceof Error ? error.message : 'Try opening the invitation again.');
    });
    return () => {
      active = false;
      opened?.close();
    };
  }, [id, token, useAccount]);

  if (room) return <RoomPage room={room} account={account} />;
  // A Google account signed in on this browser is used for invitations and link access.
  // If its session expired, the user can retry the link as a guest.
  return <>
    <Unavailable error={error} signIn={error ? signInPath(sharePath(id, token)) : undefined} />
    {error && token && useAccount && (
      <button type="button" className="site-button outline shared-guest-retry" onClick={() => {
        setError('');
        setUseAccount(false);
      }}>Open as a guest</button>
    )}
  </>;
}
