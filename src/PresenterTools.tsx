import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidePreview } from './Canvas';
import { SlideToolsDialog } from './SlideTools';
import type { Project } from './types';

export function SpeakerNotesDialog({
  initial,
  save,
  close,
}: {
  initial: string;
  save: (notes: string) => void;
  close: () => void;
}) {
  return (
    <SlideToolsDialog title="Speaker Notes" onClose={close}>
      <form
        className="insert-form"
        onSubmit={(event) => {
          event.preventDefault();
          save(String(new FormData(event.currentTarget).get('notes') ?? ''));
        }}
      >
        <label>
          Notes for this slide
          <textarea name="notes" defaultValue={initial} rows={9} autoFocus />
        </label>
        <div className="insert-dialog-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Save Notes
          </button>
        </div>
      </form>
    </SlideToolsDialog>
  );
}

export function openPresenterWindow() {
  const popup = window.open('', '_blank', 'popup,width=640,height=720');
  if (!popup) return;
  popup.document.title = 'Forma Presenter Notes';
  popup.document.documentElement.lang = 'en';
  const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
  styles.forEach((style) => popup.document.head.append(style.cloneNode(true)));
  popup.document.body.style.cssText = 'background:#f8f6fc;color:#252438;overflow:auto';
  return popup;
}

export function PresenterNotes({
  popup,
  project,
  index,
  next,
  previous,
  goBack,
  advance,
}: {
  popup: Window;
  project: Project;
  index: number;
  next?: number;
  previous?: number;
  goBack: () => void;
  advance: () => void;
}) {
  const [started] = useState(Date.now);
  const [seconds, setSeconds] = useState(0);
  const { deck, assets } = project;
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (popup.closed) window.clearInterval(timer);
      else setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [popup, started]);
  if (popup.closed) return null;
  return createPortal(
    <main
      style={{ display: 'grid', gap: 16, padding: 24, maxWidth: 800, margin: 'auto' }}
      aria-label="Presenter notes"
      onClick={(event) => event.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          Slide {index + 1} of {deck.slides.length}
        </h1>
        <span aria-label="Elapsed time" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="button" disabled={previous === undefined} onClick={goBack}>
          Previous
        </button>
        <button type="button" className="button primary" onClick={advance}>
          Advance
        </button>
      </div>
      {next !== undefined && (
        <section aria-label="Upcoming slide">
          <h2 style={{ fontSize: 14, marginBottom: 8 }}>Next slide</h2>
          <SlidePreview
            slide={deck.slides[next]}
            width={deck.width}
            height={deck.height}
            assets={assets}
            size={220}
          />
        </section>
      )}
      <section aria-label="Speaker notes" style={{ background: 'white', borderRadius: 10, padding: 16 }}>
        <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Speaker notes</h2>
        <p
          style={{
            fontSize: 19,
            lineHeight: 1.5,
            margin: 0,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {deck.slides[index].speakerNotes || 'No notes for this slide.'}
        </p>
      </section>
    </main>,
    popup.document.body,
  );
}
