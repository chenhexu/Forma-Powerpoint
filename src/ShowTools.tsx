import { ArrowDown, ArrowUp, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { SlideToolsDialog } from './SlideTools';
import type { CustomShow, Deck, Slide } from './types';

export function slideTitle(slide: Slide, index: number) {
  const text = slide.objects.find(
    (object) => object.kind === 'text' && !object.hidden && object.text?.trim(),
  );
  return text?.text?.split('\n')[0]?.slice(0, 80) || `Slide ${index + 1}`;
}

export function CustomShows({
  deck,
  save,
  play,
  close,
}: {
  deck: Deck;
  save: (shows: CustomShow[]) => void;
  play: (slideIds: string[]) => void;
  close: () => void;
}) {
  const saved = deck.customShows ?? [];
  const [active, select] = useState<number>();
  const [name, setName] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [only, setOnly] = useState(false);
  const available = new Map(deck.slides.map((slide, index) => [slide.id, { slide, index }]));
  const slides = ids.flatMap((id) => (available.has(id) ? [available.get(id)!] : []));
  const playable = slides.some(({ slide }) => !slide.hidden);
  function edit(show?: CustomShow) {
    select(show?.id);
    setName(show?.name ?? '');
    setIds(show?.slideIds.filter((id) => available.has(id)) ?? []);
  }
  function move(i: number, delta: number) {
    const order = [...ids];
    [order[i], order[i + delta]] = [order[i + delta], order[i]];
    setIds(order);
  }
  return (
    <SlideToolsDialog title="Custom Slide Shows" onClose={close}>
      <div className="insert-form">
        <div className="slide-tool-presets" aria-label="Saved shows">
          <button type="button" className="button" aria-pressed={active === undefined} onClick={() => edit()}>
            <Plus size={14} /> New Show
          </button>
          {saved.map((show) => (
            <button
              key={show.id}
              className="button"
              type="button"
              aria-pressed={active === show.id}
              onClick={() => edit(show)}
            >
              {show.name}
            </button>
          ))}
        </div>
        <form
          className="insert-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || !slides.length) return;
            const id = active ?? Math.max(-1, ...saved.map((show) => show.id)) + 1;
            const show = { id, name: name.trim(), slideIds: slides.map(({ slide }) => slide.id) };
            save(
              active === undefined ? [...saved, show] : saved.map((item) => (item.id === id ? show : item)),
            );
            select(id);
          }}
        >
          <label>
            Show name
            <input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="insert-check">
            <input type="checkbox" checked={only} onChange={(event) => setOnly(event.target.checked)} /> Show
            selected slides only
          </label>
          <div className="show-slide-list" aria-label="Choose slides">
            {deck.slides.map(
              (slide, index) =>
                (!only || ids.includes(slide.id)) && (
                  <label key={slide.id} className="insert-check">
                    <input
                      type="checkbox"
                      checked={ids.includes(slide.id)}
                      onChange={(event) =>
                        setIds(
                          event.target.checked ? [...ids, slide.id] : ids.filter((id) => id !== slide.id),
                        )
                      }
                    />
                    <span>
                      {index + 1}. {slideTitle(slide, index)}
                      {slide.hidden ? ' (hidden)' : ''}
                    </span>
                  </label>
                ),
            )}
          </div>
          {!!slides.length && (
            <div aria-label="Show order" className="show-slide-list">
              <strong>Show order</strong>
              {slides.map(({ slide, index }, i) => (
                <div key={slide.id} className="show-order-row">
                  <span>
                    {i + 1}. {slideTitle(slide, index)}
                  </span>
                  <button
                    type="button"
                    className="tool"
                    aria-label={`Move slide ${index + 1} earlier`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="tool"
                    aria-label={`Move slide ${index + 1} later`}
                    disabled={i === slides.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="insert-dialog-actions">
            {active !== undefined && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  save(saved.filter((item) => item.id !== active));
                  edit();
                }}
              >
                <Trash2 size={14} /> Delete Show
              </button>
            )}
            <button type="button" className="button" disabled={!playable} onClick={() => play(ids)}>
              <Play size={14} /> Play Show
            </button>
            <button type="submit" className="button primary" disabled={!name.trim() || !slides.length}>
              Save Show
            </button>
          </div>
        </form>
      </div>
    </SlideToolsDialog>
  );
}
