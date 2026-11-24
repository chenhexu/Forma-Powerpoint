import { ChevronDown, Plus, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { EffectIcon } from './AnimationEffectIcon';
import {
  animationEffect,
  animationEffects,
  animationGroups,
  type AnimationClass,
  type AnimationEffect,
} from './animations';

const groups = Object.keys(animationGroups) as AnimationClass[];

function EffectTile({
  effect,
  selected,
  choose,
  disabled,
}: {
  effect: AnimationEffect;
  selected?: string;
  choose: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="animation-effect-tile"
      type="button"
      disabled={disabled}
      aria-pressed={selected === effect.id}
      onClick={() => choose(effect.id)}
      title={effect.label}
    >
      <EffectIcon group={effect.group} style={effect.style} path={effect.path} />
      <span>{effect.label}</span>
    </button>
  );
}

const featured = ['entr:1', 'entr:10', 'entr:2', 'entr:30', 'entr:16'].map((id) => animationEffect(id)!);
const wideFeatured = {
  entr: ['entr:1', 'entr:10'],
  emph: ['emph:37', 'emph:8'],
  exit: ['exit:1', 'exit:2'],
  path: ['path:42'],
};
type PickerMode = { add: boolean; group?: AnimationClass };

export function AnimationGallery({
  selected,
  disabled,
  choose,
  remove,
  canRemove,
  launch,
  launched,
}: {
  selected?: string;
  disabled: boolean;
  choose: (id: string, add: boolean) => void;
  remove: () => void;
  canRemove: boolean;
  launch?: number;
  launched?: () => void;
}) {
  const [picker, setPicker] = useState<PickerMode | null>(null);
  useEffect(() => {
    if (launch === undefined || disabled) return;
    setPicker({ add: true });
    launched?.();
  }, [launch, disabled, launched]);
  const replace = (id: string) => choose(id, false);
  return (
    <div className="animation-effect-strip">
      <button
        type="button"
        className="animation-effect-tile"
        disabled={!canRemove}
        onClick={remove}
        title="Remove selected animation"
      >
        <EffectIcon />
        <span>None</span>
      </button>
      <div className="animation-featured compact">
        {featured.map((effect) => (
          <EffectTile
            key={effect.id}
            effect={effect}
            selected={selected}
            choose={replace}
            disabled={disabled}
          />
        ))}
      </div>
      <div className="animation-featured wide">
        {groups.map((group) => (
          <div key={group} className="animation-featured-group" data-group={group}>
            <div>
              {wideFeatured[group].map((id) => (
                <EffectTile
                  key={id}
                  effect={animationEffect(id)!}
                  selected={selected}
                  choose={replace}
                  disabled={disabled}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={disabled}
              aria-label={animationGroups[group] + ' effects'}
              className="animation-category-trigger"
              aria-haspopup="dialog"
              onClick={() => setPicker({ add: false, group })}
            >
              <EffectIcon group={group} /> {animationGroups[group]} <ChevronDown size={12} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="tool animation-gallery-more"
        type="button"
        aria-label="All animations"
        title="All animations"
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setPicker({ add: false })}
      >
        <ChevronDown size={16} />
      </button>
      <button
        className="tool"
        type="button"
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setPicker({ add: true })}
      >
        <Plus size={16} /> Add Animation
      </button>
      {picker && (
        <AnimationPicker
          picker={picker}
          selected={selected}
          choose={(id) => choose(id, picker.add)}
          close={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function AnimationPicker({
  picker,
  selected,
  choose,
  close,
}: {
  picker: PickerMode;
  selected?: string;
  choose: (id: string) => void;
  close: () => void;
}) {
  const [group, setGroup] = useState(picker.group);
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const term = query.toLowerCase().trim();
  const visible = animationEffects.filter(
    (effect) => (!group || effect.group === group) && effect.label.toLowerCase().includes(term),
  );
  function dismiss() {
    dialog.current?.close();
    close();
  }
  return (
    <dialog
      ref={dialog}
      className="modal insert-dialog transition-gallery animation-gallery"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <header className="transition-gallery-header">
        <h2 id={id}>{picker.add ? 'Add Animation' : 'Animation Effects'}</h2>
        <label className="animation-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Find an effect"
            aria-label="Find an effect"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" aria-label="Clear animation search" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          )}
        </label>
        <button type="button" className="tool" aria-label="Close animation gallery" onClick={dismiss}>
          <X size={18} />
        </button>
      </header>
      <div className="animation-gallery-filters">
        <button type="button" aria-pressed={!group} onClick={() => setGroup(undefined)}>
          All
        </button>
        {groups.map((key) => (
          <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)}>
            <EffectIcon group={key} /> {animationGroups[key]}
          </button>
        ))}
      </div>
      <div className="transition-gallery-body animation-gallery-body" data-all={!group || undefined}>
        {!visible.length && <p>No effects match your search.</p>}
        {groups.map((key) => {
          const effects = visible.filter((effect) => effect.group === key);
          if (!effects.length) return null;
          return (
            <section key={key} aria-label={animationGroups[key]} className="transition-gallery-group">
              <h3>{animationGroups[key]}</h3>
              <div className="animation-gallery-grid">
                {effects.map((effect) => (
                  <EffectTile
                    key={effect.id}
                    effect={effect}
                    selected={selected}
                    choose={(id) => {
                      dismiss();
                      choose(id);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </dialog>
  );
}
