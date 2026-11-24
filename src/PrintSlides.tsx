import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidePreview } from './Canvas';
import { SlideToolsDialog } from './SlideTools';
import type { Project } from './types';

type PrintFormat = 'slides' | 'handouts' | 'notes';
const layouts: [PrintFormat, string][] = [
  ['slides', 'One slide per page'],
  ['handouts', 'Three-slide handouts'],
  ['notes', 'Speaker notes pages'],
];

export function PrintSlides({ project, close }: { project: Project; close: () => void }) {
  const [format, setFormat] = useState<PrintFormat>('slides');
  const [includeHidden, setIncludeHidden] = useState(false);
  const [popup, setPopup] = useState<Window | null>(null);
  const [error, setError] = useState('');
  const { deck, assets } = project;
  const slides = deck.slides
    .map((slide, index) => ({ slide, number: index + 1 }))
    .filter(({ slide }) => includeHidden || !slide.hidden);
  const perPage = format === 'handouts' ? 3 : 1;
  const pages = Array.from({ length: Math.ceil(slides.length / perPage) }, (_, i) =>
    slides.slice(i * perPage, (i + 1) * perPage),
  );
  const landscape = format === 'slides';
  const width =
    format === 'handouts'
      ? Math.min(350, (240 * deck.width) / deck.height)
      : Math.min(landscape ? 940 : 670, ((landscape ? 670 : 445) * deck.width) / deck.height);
  useEffect(() => {
    if (!popup) return;
    function check() {
      if (popup?.closed) setPopup(null);
    }
    const timer = window.setInterval(check, 400);
    return () => window.clearInterval(timer);
  }, [popup]);

  function preview() {
    if (popup && !popup.closed) {
      popup.focus();
      return;
    }
    const page = window.open('', '_blank', 'popup,width=1020,height=780');
    if (!page) {
      setError('Allow pop-ups to open the print preview.');
      return;
    }
    page.opener = null;
    page.document.title = deck.name + ' — Print';
    page.document.documentElement.lang = 'en';
    document
      .querySelectorAll('style, link[rel="stylesheet"]')
      .forEach((node) => page.document.head.append(node.cloneNode(true)));
    page.document.body.style.cssText = 'margin:0;background:#f1eff4;overflow:auto;height:auto';
    setError('');
    setPopup(page);
  }

  return (
    <>
      <SlideToolsDialog
        title="Print or Save PDF"
        onClose={() => {
          popup?.close();
          close();
        }}
      >
        <form
          className="insert-form"
          onSubmit={(event) => {
            event.preventDefault();
            preview();
          }}
        >
          <div className="slide-tool-presets" aria-label="Print layout">
            {layouts.map(([value, label]) => (
              <button
                type="button"
                className="button"
                key={value}
                aria-pressed={value === format}
                onClick={() => setFormat(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="insert-check">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(event) => setIncludeHidden(event.target.checked)}
            />{' '}
            Include hidden slides
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="insert-dialog-actions">
            <button type="submit" className="button primary" disabled={!slides.length}>
              Open Print Preview
            </button>
          </div>
        </form>
      </SlideToolsDialog>
      {popup &&
        !popup.closed &&
        createPortal(
          <main className="forma-print-document">
            <style>{`@page { size: letter ${landscape ? 'landscape' : 'portrait'}; margin: 0.45in; }`}</style>
            <header className="print-toolbar">
              <strong>{deck.name}</strong>
              <button type="button" className="button primary" onClick={() => popup.print()}>
                Print / Save PDF
              </button>
            </header>
            {pages.map((page, i) => (
              <section key={i} className={`print-page print-${format}`} aria-label={`Page ${i + 1}`}>
                {page.map(({ slide, number }) => (
                  <article className="print-slide" key={slide.id}>
                    <div>
                      {format !== 'slides' && <h2>Slide {number}</h2>}
                      <SlidePreview
                        slide={slide}
                        width={deck.width}
                        height={deck.height}
                        size={width}
                        assets={assets}
                      />
                    </div>
                    {format === 'notes' && <p className="print-speaker-notes">{slide.speakerNotes}</p>}
                    {format === 'handouts' && <div className="print-writing-lines" aria-hidden="true" />}
                  </article>
                ))}
              </section>
            ))}
          </main>,
          popup.document.body,
        )}
    </>
  );
}
