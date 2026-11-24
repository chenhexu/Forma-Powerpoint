import { ChevronDown, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { TransitionThumbnail } from './TransitionThumbnail';
import { transitionGroups, transitions, type Effect, type Transition } from './transitions';

const featured: Effect[] = ['none', 'morph', 'fade', 'push', 'wipe', 'split', 'reveal', 'cut'];

export function TransitionGallery({
  value,
  disabled,
  choose,
}: {
  value?: Transition;
  disabled?: boolean;
  choose: (effect: Effect) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="transition-strip">
        {featured.map((effect) => (
          <button
            key={effect}
            type="button"
            className="transition-tile"
            aria-pressed={value === effect}
            disabled={disabled}
            onClick={() => choose(effect)}
          >
            <TransitionThumbnail effect={effect} />
            <span>{transitions[effect].label}</span>
          </button>
        ))}
        <button
          ref={trigger}
          type="button"
          className="tool transition-more"
          aria-label="All transitions"
          title="All transitions"
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={() => setExpanded(true)}
        >
          <ChevronDown size={17} />
        </button>
      </div>
      {expanded && (
        <TransitionPicker
          value={value}
          dismiss={() => {
            setExpanded(false);
            trigger.current?.focus({ preventScroll: true });
          }}
          choose={choose}
        />
      )}
    </>
  );
}

function TransitionPicker({
  value,
  dismiss,
  choose,
}: {
  value?: Transition;
  dismiss: () => void;
  choose: (effect: Effect) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const close = () => {
    dialog.current?.close();
    dismiss();
  };
  return (
    <dialog
      ref={dialog}
      className="modal insert-dialog transition-gallery"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="transition-gallery-header">
        <h2 id={id}>Transitions</h2>
        <button className="tool" type="button" aria-label="Close transitions" onClick={close}>
          <X size={18} />
        </button>
      </header>
      <div className="transition-gallery-body">
        {Object.entries(transitionGroups).map(([category, effects]) => (
          <section key={category} aria-label={category} className="transition-gallery-group">
            <h3>{category}</h3>
            <div className="transition-gallery-grid">
              {Object.keys(effects).map((key) => {
                const effect = key as Effect;
                return (
                  <button
                    key={effect}
                    type="button"
                    className="transition-tile"
                    aria-pressed={value === effect}
                    onClick={() => {
                      choose(effect);
                      close();
                    }}
                  >
                    <TransitionThumbnail effect={effect} />
                    <span>{transitions[effect].label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </dialog>
  );
}
