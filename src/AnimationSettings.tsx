import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  animationDirection,
  animationEffect,
  animationLabel,
  animationStarts,
  directions,
  type SlideAnimation,
} from './animations';
import { Dropdown } from './Ribbon';
import type { SlideObject } from './types';

export type AnimationSettingsTab = 'effect' | 'timing';
export function animationObjectLabel(object: SlideObject) {
  return object.name.startsWith('!!Forma_')
    ? object.text?.split('\n')[0] || (object.kind === 'model' ? '3D model' : 'Object')
    : object.name;
}
export function triggerChoices(objects: SlideObject[]) {
  const label = (object: SlideObject) => animationObjectLabel(object).trim() || 'Object';
  const all = objects.filter(({ kind }) => kind !== 'unsupported');
  return [
    ['', 'In Click Sequence'] as const,
    ...all.map(
      (object, index) =>
        [
          object.id,
          all.some((item) => item !== object && label(item) === label(object))
            ? `${label(object)} (${index + 1})`
            : label(object),
        ] as const,
    ),
  ];
}

export function AnimationSettings({
  entry,
  objects,
  initialTab,
  close,
  apply,
}: {
  entry: SlideAnimation;
  objects: SlideObject[];
  initialTab: AnimationSettingsTab;
  close: () => void;
  apply: (changes: Partial<SlideAnimation>) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState(initialTab);
  const [draft, setDraft] = useState(entry);
  const [fields, setFields] = useState(() => ({
    duration: String(entry.duration),
    delay: String(entry.delay),
    smoothStart: String(entry.smoothStart ?? 0),
    smoothEnd: String(entry.smoothEnd ?? 0),
  }));
  const effect = animationEffect(entry.effect);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function dismiss() {
    dialog.current?.close();
    close();
  }
  function value(key: keyof typeof fields, upper = 3600, lower = 0) {
    const v = Number(fields[key]);
    return Number.isFinite(v) ? Math.min(upper, Math.max(lower, v)) : lower;
  }
  const duration = value('duration', 3600, 0.001);
  const number = (key: keyof typeof fields, label: string) => (
    <label className="animation-settings-row">
      <span>{label}</span>
      <span className="animation-settings-seconds">
        <input
          aria-label={label + ' (seconds)'}
          type="number"
          step="any"
          min={key === 'duration' ? 0.001 : 0}
          max={3600}
          value={fields[key]}
          onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
        />
        <span aria-hidden="true">s</span>
      </span>
    </label>
  );
  const timing = tab === 'timing';
  return (
    <dialog
      className="modal insert-dialog animation-settings"
      aria-labelledby={id}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <header className="transition-gallery-header">
        <div>
          <span>Animation settings</span>
          <h2 id={id}>{animationLabel(entry.effect)}</h2>
        </div>
        <button className="tool" type="button" aria-label="Close animation settings" onClick={dismiss}>
          <X size={18} />
        </button>
      </header>
      <div className="animation-settings-tabs" role="group" aria-label="Settings section">
        <button type="button" aria-pressed={!timing} onClick={() => setTab('effect')}>
          Effect
        </button>
        <button type="button" aria-pressed={timing} onClick={() => setTab('timing')}>
          Timing
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const smoothStart = value('smoothStart', duration);
          const smoothEnd = value('smoothEnd', duration - smoothStart);
          apply({ ...draft, duration, delay: value('delay'), smoothStart, smoothEnd });
          dismiss();
        }}
      >
        <div className="animation-settings-fields">
          {timing ? (
            <>
              <div className="animation-settings-row">
                <span>Start</span>
                <Dropdown
                  label="Start animation"
                  value={draft.trigger ? 'click' : draft.start}
                  disabled={!!draft.trigger}
                  choices={animationStarts}
                  onChange={(start) => setDraft({ ...draft, start })}
                />
              </div>
              {number('delay', 'Delay')}
              {number('duration', 'Duration')}
              <div className="animation-settings-row">
                <span>Repeat</span>
                <Dropdown
                  label="Repeat"
                  choices={[
                    ['1', 'None'],
                    ['2', '2 times'],
                    ['3', '3 times'],
                    ['5', '5 times'],
                    ['10', '10 times'],
                  ]}
                  value={String(draft.repeat ?? 1)}
                  onChange={(repeat) => setDraft({ ...draft, repeat: Number(repeat) })}
                />
              </div>
              <label className="transition-check animation-rewind">
                <input
                  type="checkbox"
                  checked={!!draft.rewind}
                  onChange={(e) => setDraft({ ...draft, rewind: e.target.checked })}
                />
                Rewind when done playing
              </label>
              <div className="animation-settings-row">
                <span>Trigger</span>
                <Dropdown
                  label="Trigger on click of"
                  value={draft.trigger ?? ''}
                  choices={triggerChoices(objects)}
                  onChange={(trigger) =>
                    setDraft({
                      ...draft,
                      trigger: trigger || undefined,
                      start: trigger ? 'click' : draft.start,
                    })
                  }
                />
              </div>
            </>
          ) : (
            <>
              {effect?.directional && (
                <div className="animation-settings-row">
                  <span>Direction</span>
                  <Dropdown
                    label="Direction"
                    value={animationDirection(draft)}
                    choices={directions.map(
                      ([id, label]) =>
                        [
                          id,
                          effect.group === 'path'
                            ? label
                            : (effect.group === 'exit' ? 'To ' : 'From ') + label,
                        ] as const,
                    )}
                    onChange={(direction) => setDraft({ ...draft, direction })}
                  />
                </div>
              )}
              {effect?.style !== 'instant' && (
                <>
                  {number('smoothStart', 'Smooth start')}
                  {number('smoothEnd', 'Smooth end')}
                </>
              )}
              <div className="animation-settings-row">
                <span>After animation</span>
                <Dropdown
                  label="After animation"
                  choices={
                    [
                      ['keep', 'Keep final state'],
                      ['dim', 'Dim'],
                      ['hide', 'Hide'],
                    ] as const
                  }
                  value={draft.after ?? 'keep'}
                  onChange={(after) => setDraft({ ...draft, after: after === 'keep' ? undefined : after })}
                />
              </div>
            </>
          )}
        </div>
        <footer className="animation-settings-actions">
          <button type="button" className="button" onClick={dismiss}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Apply
          </button>
        </footer>
      </form>
    </dialog>
  );
}
