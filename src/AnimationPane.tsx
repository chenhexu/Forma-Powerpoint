import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Copy,
  Link2,
  LockKeyhole,
  Maximize2,
  Minus,
  MoreHorizontal,
  Mouse,
  Play,
  Plus,
  Settings2,
  Square,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { EffectIcon } from './AnimationEffectIcon';
import { animationObjectLabel, type AnimationSettingsTab } from './AnimationSettings';
import { animationEffect, animationLabel, animationStarts, type SlideAnimation } from './animations';
import {
  animationTimeline,
  clipTimingPatch,
  timelineSeconds,
  type AnimationPosition,
  type ClipEdit,
  type ClipTiming,
} from './animationTimeline';
import type { Slide } from './types';

const noEffects: SlideAnimation[] = [];
const seconds = (time: number) => `${timelineSeconds(time)}s`;

type ClipDrag = {
  clip: ClipTiming;
  entry: SlideAnimation;
  edit: ClipEdit;
  pointer: number;
  x: number;
  scroll: number;
  scale: number;
  latestX: number;
  frame: number;
  element: HTMLElement;
  started: boolean;
  patch?: ReturnType<typeof clipTimingPatch>;
};

function TimeField({
  label,
  value,
  disabled,
  commit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  commit: (time: number) => void;
}) {
  const [draft, setDraft] = useState<string>();
  return (
    <label className="animation-time-field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label + ' time (seconds)'}
        min={0}
        step="0.001"
        value={draft ?? timelineSeconds(value)}
        disabled={disabled}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          if (draft?.trim() && Number.isFinite(Number(draft))) commit(Number(draft));
          setDraft(undefined);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(undefined);
        }}
      />
    </label>
  );
}
export function canMoveEffect(
  effects: SlideAnimation[],
  source: SlideAnimation,
  destination?: SlideAnimation,
) {
  if (source.imported || !destination || source.trigger !== destination.trigger || destination.imported)
    return false;
  const start = effects.indexOf(source);
  const finish = effects.indexOf(destination);
  return !effects
    .slice(Math.min(start, finish), Math.max(start, finish))
    .some(({ imported, trigger }) => imported && trigger === source.trigger);
}

export function AnimationPane({
  slide,
  selected,
  choose,
  remove,
  move,
  change,
  duplicate,
  options,
  previewing,
  preview,
}: {
  slide?: Slide;
  selected?: string;
  choose: (animation: SlideAnimation) => void;
  remove: (id: string) => void;
  move: (id: string, destination: string, after: boolean) => void;
  change: (id: string, patch: Partial<SlideAnimation>) => void;
  duplicate: (animation: SlideAnimation) => void;
  options: (animation: SlideAnimation, tab: AnimationSettingsTab) => void;
  previewing: boolean;
  preview: (from?: string | AnimationPosition) => void;
}) {
  const effects = slide?.animations ?? noEffects;
  const selectedEffect = effects.find(({ id }) => id === selected);
  const [timeline, setTimeline] = useState(true);
  const [manualScale, setManualScale] = useState<number>();
  const [viewport, setViewport] = useState({ width: 0, scroll: 0 });
  const [playhead, setPlayhead] = useState<{ slide?: string; time: number }>();
  const [draft, setDraft] = useState<{ id: string; patch: ReturnType<typeof clipTimingPatch> }>();
  const [menu, setMenu] = useState<{
    id: string;
    anchor?: HTMLButtonElement;
    x: number;
    y: number;
    focus?: HTMLElement;
  } | null>(null);
  const drag = useRef<ClipDrag | null>(null);
  const dragged = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | undefined>(undefined);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const layout = useMemo(() => animationTimeline(effects), [effects]);
  const live = useMemo(
    () =>
      draft
        ? animationTimeline(
            effects.map((entry) => (entry.id === draft.id ? { ...entry, ...draft.patch } : entry)),
          )
        : layout,
    [draft, effects, layout],
  );
  const hasTimeline = timeline && !!effects.length;
  const bounds = () => {
    const scroll = scroller.current;
    if (!scroll) return;
    const left = scroll.getBoundingClientRect().left;
    const labels = scroll.querySelector('.animation-track-label')?.getBoundingClientRect().width ?? 0;
    return { scroll, left: left + labels, width: Math.max(1, scroll.clientWidth - labels) };
  };
  useLayoutEffect(() => {
    const scroll = scroller.current;
    if (!hasTimeline || !scroll) return;
    const measure = () => {
      const dimensions = bounds();
      if (dimensions) setViewport({ width: dimensions.width, scroll: scroll.scrollLeft });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    measure();
    scroll.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      scroll.removeEventListener('scroll', measure);
    };
  }, [hasTimeline]);

  const fitLength = Math.max(2, layout.length + 0.5);
  const fitScale = Math.max(0.001, viewport.width / fitLength);
  const maxScale = Math.max(fitScale, Math.min(800, 3_000_000 / fitLength));
  const scale = Math.min(maxScale, Math.max(fitScale, manualScale ?? fitScale));
  const plotWidth = Math.max(viewport.width, Math.max(2, live.length + 0.5) * scale);
  const head =
    playhead && playhead.slide === slide?.id ? Math.min(playhead.time, layout.mainLength) : undefined;
  const selectedTiming = selected ? live.clips.get(selected) : undefined;
  const gridStep = 10 ** Math.floor(Math.log10(56 / scale));
  const tick = [1, 2, 5, 10].map((multiple) => multiple * gridStep).find((step) => step * scale >= 50)!;
  const tickPixels = tick * scale;
  const firstTick = Math.max(0, Math.floor(viewport.scroll / tickPixels) - 1);
  const ticks = Array.from(
    { length: Math.max(0, Math.ceil((viewport.scroll + viewport.width) / tickPixels) - firstTick + 1) },
    (_, i) => firstTick + i,
  ).filter((i) => i * tickPixels < plotWidth);
  useLayoutEffect(() => {
    if (pendingScroll.current === undefined || !scroller.current) return;
    scroller.current.scrollLeft = pendingScroll.current;
    pendingScroll.current = undefined;
  }, [manualScale, scale]);

  function zoom(factor?: number) {
    const scroll = scroller.current;
    if (!scroll) return;
    if (!factor) {
      pendingScroll.current = undefined;
      scroll.scrollLeft = 0;
      setManualScale(undefined);
      return;
    }
    const next = Math.min(maxScale, Math.max(fitScale, scale * factor));
    if (next === scale) return;
    const center = (scroll.scrollLeft + viewport.width / 2) / scale;
    const focus = head !== undefined && Math.abs(head - center) * scale <= viewport.width / 2 ? head : center;
    pendingScroll.current = focus * next - (focus * scale - scroll.scrollLeft);
    setManualScale(next);
  }

  function setHead(time: number) {
    setPlayhead({ slide: slide?.id, time: timelineSeconds(Math.max(0, Math.min(layout.mainLength, time))) });
  }
  function playFromHead() {
    if (head === undefined) return;
    const next = layout.offsets.findIndex((offset) => timelineSeconds(offset) > head);
    const group = (next === -1 ? layout.offsets.length : next) - 1;
    preview({ group, time: Math.max(0, timelineSeconds(head - layout.offsets[group])) });
  }
  function updateClip(entry: SlideAnimation, patch: ReturnType<typeof clipTimingPatch>) {
    if (entry.start !== patch.start || entry.delay !== patch.delay || entry.duration !== patch.duration)
      change(entry.id, patch);
  }
  function startClipDrag(e: PointerEvent<HTMLDivElement>, entry: SlideAnimation) {
    if (e.button !== 0 || !e.isPrimary || !scroller.current) return;
    choose(entry);
    if (entry.imported) return;
    const clip = layout.clips.get(entry.id);
    if (!clip) return;
    const element = e.currentTarget;
    const edit = (e.target as HTMLElement).closest<HTMLElement>('[data-trim]')?.dataset.trim as
      ClipEdit | undefined;
    e.preventDefault();
    element.setPointerCapture(e.pointerId);
    drag.current = {
      clip,
      entry,
      edit: edit ?? 'move',
      pointer: e.pointerId,
      x: e.clientX,
      latestX: e.clientX,
      scroll: scroller.current.scrollLeft,
      scale,
      frame: 0,
      element,
      started: false,
    };
  }
  function updateDrag(current: ClipDrag, scroll: HTMLDivElement) {
    const pixels = current.latestX - current.x + scroll.scrollLeft - current.scroll;
    if (!current.started && Math.abs(pixels) < 3) return;
    current.started = true;
    const patch = clipTimingPatch(current.entry, current.clip, current.edit, pixels / current.scale);
    if (
      current.patch?.delay === patch.delay &&
      current.patch.duration === patch.duration &&
      current.patch.start === patch.start
    )
      return;
    current.patch = patch;
    setDraft({ id: current.entry.id, patch });
  }
  function scrollDuringDrag() {
    const current = drag.current;
    const size = bounds();
    if (!current || !size) return;
    const fromLeft = current.latestX - size.left;
    const fromRight = size.width - fromLeft;
    const direction = fromLeft < 24 ? -1 : fromRight < 24 ? 1 : 0;
    const scroll = size.scroll;
    const before = scroll.scrollLeft;
    scroll.scrollLeft += direction * 9;
    current.frame = 0;
    if (before === scroll.scrollLeft) return;
    updateDrag(current, scroll);
    current.frame = requestAnimationFrame(scrollDuringDrag);
  }
  function moveClip(e: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== e.pointerId || !scroller.current) return;
    current.latestX = e.clientX;
    updateDrag(current, scroller.current);
    if (current.started && !current.frame) current.frame = requestAnimationFrame(scrollDuringDrag);
  }
  function stopClipDrag(pointer: number, commit: boolean) {
    const current = drag.current;
    if (!current || current.pointer !== pointer) return;
    drag.current = null;
    cancelAnimationFrame(current.frame);
    setDraft(undefined);
    if (commit && current.patch) updateClip(current.entry, current.patch);
    if (current.element.hasPointerCapture(pointer)) current.element.releasePointerCapture(pointer);
  }
  useEffect(() => {
    setDraft(undefined);
    return () => {
      if (drag.current) cancelAnimationFrame(drag.current.frame);
      drag.current = null;
    };
  }, [slide?.id]);

  const objectById = (id: string) => slide?.objects.find((object) => object.id === id);
  const adjacent = (entry: SlideAnimation, direction: -1 | 1) => {
    const sequence = entry.trigger ? (layout.triggers.get(entry.trigger) ?? []) : layout.main;
    return sequence[sequence.indexOf(entry) + direction];
  };
  const allowed = (entry: SlideAnimation | undefined, direction: -1 | 1) =>
    entry && canMoveEffect(effects, entry, adjacent(entry, direction));
  const moveNeighbor = (entry: SlideAnimation, direction: -1 | 1) => {
    const neighbor = adjacent(entry, direction);
    if (neighbor) move(entry.id, neighbor.id, direction > 0);
  };
  const menuEntry = menu && effects.find(({ id }) => id === menu.id);
  const menuTiming = menuEntry ? layout.clips.get(menuEntry.id) : undefined;
  const stepEnd = menuTiming && (layout.offsets[menuTiming.group + 1] ?? layout.mainLength);
  const headInStep =
    head !== undefined &&
    menuTiming &&
    stepEnd !== undefined &&
    head >= timelineSeconds(menuTiming.origin + menuTiming.previousStart) &&
    head <= timelineSeconds(stepEnd);
  const align =
    timeline && menuEntry && menuTiming && !menuEntry.trigger && !menuEntry.imported && headInStep
      ? clipTimingPatch(menuEntry, menuTiming, 'move', head - menuTiming.origin - menuTiming.start)
      : undefined;
  const items: MenuItem[] = menuEntry
    ? [
        {
          label: 'Play From',
          group: 'Playback',
          preview: <Play size={14} />,
          action: () => preview(menuEntry.id),
        },
        {
          label: 'On Click',
          group: 'Start',
          checked: menuEntry.start === 'click' && !menuEntry.trigger,
          preview: <Mouse size={14} />,
          disabled: menuEntry.imported,
          action: () => change(menuEntry.id, { start: 'click', trigger: undefined }),
        },
        {
          label: 'With Previous',
          group: 'Start',
          checked: menuEntry.start === 'with',
          preview: <Play size={14} />,
          disabled: menuEntry.imported || !!menuEntry.trigger,
          action: () => change(menuEntry.id, { start: 'with' }),
        },
        {
          label: 'After Previous',
          group: 'Start',
          checked: menuEntry.start === 'after',
          preview: <Clock3 size={14} />,
          disabled: menuEntry.imported || !!menuEntry.trigger,
          action: () => change(menuEntry.id, { start: 'after' }),
        },
        {
          label: 'Move to Playhead',
          group: 'Timeline',
          preview: <Timer size={14} />,
          disabled: !align,
          action: () => align && updateClip(menuEntry, align),
        },
        {
          label: 'Trigger…',
          group: 'Settings',
          preview: <Zap size={14} />,
          disabled: menuEntry.imported,
          action: () => options(menuEntry, 'timing'),
        },
        {
          label: 'Effect Options…',
          group: 'Settings',
          preview: <Settings2 size={14} />,
          disabled: menuEntry.imported,
          action: () => options(menuEntry, 'effect'),
        },
        {
          label: 'Timing…',
          group: 'Settings',
          preview: <Timer size={14} />,
          disabled: menuEntry.imported,
          action: () => options(menuEntry, 'timing'),
        },
        {
          label: 'Move Earlier',
          group: 'Order',
          preview: <ArrowUp size={14} />,
          disabled: !allowed(menuEntry, -1),
          action: () => moveNeighbor(menuEntry, -1),
        },
        {
          label: 'Move Later',
          group: 'Order',
          preview: <ArrowDown size={14} />,
          disabled: !allowed(menuEntry, 1),
          action: () => moveNeighbor(menuEntry, 1),
        },
        {
          label: 'Duplicate Animation',
          group: 'Order',
          preview: <Copy size={14} />,
          disabled: menuEntry.imported,
          action: () => duplicate(menuEntry),
        },
        {
          label: timeline ? 'Hide Timeline' : 'Show Timeline',
          group: 'View',
          preview: <Timer size={14} />,
          action: () => setTimeline(!timeline),
        },
        {
          label: 'Remove',
          group: 'Animation',
          preview: <Trash2 size={14} />,
          disabled: menuEntry.imported,
          action: () => remove(menuEntry.id),
        },
      ]
    : [];

  function row(entry: SlideAnimation) {
    const object = objectById(entry.target);
    const definition = animationEffect(entry.effect);
    const timing = live.clips.get(entry.id)!;
    const label = object?.text?.split('\n')[0] || (object ? animationObjectLabel(object) : 'Object');
    const effect = animationLabel(entry.effect);
    const startMode = draft?.id === entry.id ? draft.patch.start : entry.start;
    const startType = entry.trigger
      ? 'On object click'
      : animationStarts.find(([key]) => key === startMode)?.[1];
    const resetDrag = () => {
      dragged.current = null;
      setDrop(null);
    };
    return (
      <div
        key={entry.id}
        className="animation-pane-row"
        data-selected={selected === entry.id || undefined}
        data-drop={drop?.id === entry.id ? (drop.after ? 'after' : 'before') : undefined}
        onDragOver={(e) => {
          const source = effects.find(({ id }) => id === dragged.current);
          if (!source || source === entry || !canMoveEffect(effects, source, entry)) {
            setDrop(null);
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const bounds = e.currentTarget.getBoundingClientRect();
          setDrop({ id: entry.id, after: e.clientY > bounds.top + bounds.height / 2 });
        }}
        onDrop={(e) => {
          if (!dragged.current || drop?.id !== entry.id) return;
          e.preventDefault();
          move(dragged.current, entry.id, drop.after);
          resetDrag();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          const focus = event.currentTarget.querySelector<HTMLElement>('.animation-pane-select') ?? undefined;
          choose(entry);
          setMenu({ id: entry.id, x: event.clientX, y: event.clientY, focus });
        }}
      >
        <div className="animation-track-label">
          <button
            type="button"
            className="animation-pane-select"
            aria-label={effect + ' ' + label}
            aria-pressed={selected === entry.id}
            title={label + ' · ' + effect + ' · ' + startType}
            draggable={!entry.imported}
            onDragStart={(e) => {
              dragged.current = entry.id;
              e.dataTransfer.setData('text/plain', entry.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={resetDrag}
            onClick={() => choose(entry)}
            onDoubleClick={() => !entry.imported && options(entry, 'effect')}
            onKeyDown={(event) => {
              if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                event.stopPropagation();
                if (!entry.imported) remove(entry.id);
                return;
              }
              if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
              event.preventDefault();
              const bounds = event.currentTarget.getBoundingClientRect();
              choose(entry);
              setMenu({ id: entry.id, x: bounds.left, y: bounds.bottom, focus: event.currentTarget });
            }}
          >
            <span className="animation-track-indicator" aria-label={startType} title={startType}>
              {entry.trigger ? (
                <Zap size={12} />
              ) : startMode === 'click' ? (
                <>
                  <span>{timing.group}</span>
                  <Mouse size={12} />
                </>
              ) : startMode === 'after' ? (
                <Clock3 size={12} />
              ) : (
                <Link2 size={12} />
              )}
            </span>
            <EffectIcon group={definition?.group} style={definition?.style} path={definition?.path} />
            <span className="animation-pane-item">
              <strong>{label}</strong>
              <span>{effect}</span>
            </span>
          </button>
          <button
            className="animation-row-more"
            type="button"
            aria-label={'Actions for ' + effect + ' on ' + label}
            aria-haspopup="menu"
            title={entry.imported ? 'Preserved PowerPoint animation' : 'Animation actions'}
            onClick={(event) => {
              choose(entry);
              setMenu({ id: entry.id, anchor: event.currentTarget, x: 0, y: 0 });
            }}
          >
            {entry.imported ? <LockKeyhole size={12} /> : <MoreHorizontal size={15} />}
          </button>
        </div>
        {hasTimeline && (
          <div className="animation-timeline-track">
            {!entry.trigger && timing.group > 0 && (
              <span
                className="animation-click-boundary"
                style={{ left: timing.origin * scale }}
                title={'Click ' + timing.group}
              />
            )}
            <div
              className="animation-timeline-bar"
              data-group={definition?.group}
              data-locked={entry.imported || undefined}
              data-dragging={draft?.id === entry.id || undefined}
              data-animation-id={entry.id}
              title={effect + ' · ' + seconds(timing.start) + '–' + seconds(timing.end)}
              style={{
                left: (timing.origin + timing.start) * scale,
                width: (timing.end - timing.start) * scale,
              }}
              onPointerDown={(e) => startClipDrag(e, entry)}
              onPointerMove={moveClip}
              onPointerUp={(e) => stopClipDrag(e.pointerId, true)}
              onPointerCancel={(e) => stopClipDrag(e.pointerId, false)}
              onLostPointerCapture={(e) => stopClipDrag(e.pointerId, false)}
            >
              {!entry.imported && (
                <>
                  <span data-trim="start" title="Trim start" />
                  <span data-trim="end" title="Trim end" />
                </>
              )}
            </div>
            {head !== undefined && !entry.trigger && (
              <span className="animation-playhead-line" style={{ left: head * scale }} />
            )}
          </div>
        )}
      </div>
    );
  }

  function moveRuler(e: PointerEvent<HTMLDivElement>) {
    setHead((e.clientX - e.currentTarget.getBoundingClientRect().left) / scale);
  }

  return (
    <section aria-label="Animation Pane" className="animation-pane">
      <div className="animation-pane-tools">
        <button className="button" type="button" disabled={!effects.length} onClick={() => preview()}>
          {previewing ? <Square size={13} /> : <Play size={13} />}{' '}
          {previewing ? 'Stop Preview' : 'Preview Animations'}
        </button>
        <div className="animation-pane-order" inert={previewing}>
          <button
            type="button"
            className="tool"
            aria-label="Play From selected animation"
            title="Play From"
            disabled={!selectedEffect}
            onClick={() => preview(selectedEffect?.id)}
          >
            <Play size={13} />
            <span>Play From</span>
          </button>
          <span className="animation-pane-reorder">
            <button
              type="button"
              className="tool"
              aria-label="Move animation earlier"
              title="Move Earlier"
              disabled={!allowed(selectedEffect, -1)}
              onClick={() => selectedEffect && moveNeighbor(selectedEffect, -1)}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="tool"
              aria-label="Move animation later"
              title="Move Later"
              disabled={!allowed(selectedEffect, 1)}
              onClick={() => selectedEffect && moveNeighbor(selectedEffect, 1)}
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className="tool"
              aria-label="Remove animation"
              title="Remove"
              disabled={!selectedEffect || selectedEffect.imported}
              onClick={() => selectedEffect && remove(selectedEffect.id)}
            >
              <Trash2 size={14} />
            </button>
          </span>
        </div>
      </div>
      <div className="animation-pane-list" inert={previewing} ref={scroller} aria-label="Animation tracks">
        <div
          className="animation-tracks"
          data-timeline={hasTimeline || undefined}
          style={{ '--plot-width': plotWidth + 'px', '--tick-width': tickPixels + 'px' } as CSSProperties}
        >
          {hasTimeline && (
            <div className="animation-ruler-row">
              <div className="animation-track-label animation-ruler-label">Effect</div>
              <div
                className="animation-timeline-ruler"
                tabIndex={layout.main.length ? 0 : -1}
                role="slider"
                aria-label="Timeline playhead"
                aria-disabled={!layout.main.length || undefined}
                aria-valuemin={0}
                aria-valuemax={timelineSeconds(layout.mainLength)}
                aria-valuenow={head ?? 0}
                aria-valuetext={seconds(head ?? 0)}
                onPointerDown={(e) => {
                  if (e.button !== 0 || !layout.main.length) return;
                  e.currentTarget.focus({ preventScroll: true });
                  e.currentTarget.setPointerCapture(e.pointerId);
                  moveRuler(e);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) moveRuler(e);
                }}
                onKeyDown={(e) => {
                  const position = head ?? 0;
                  const delta = e.shiftKey ? tick : 0.1;
                  const next = {
                    Home: 0,
                    End: layout.mainLength,
                    ArrowLeft: position - delta,
                    ArrowRight: position + delta,
                  }[e.key];
                  if (next === undefined) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setHead(next);
                  if (scroller.current) {
                    const x = Math.max(0, Math.min(layout.mainLength, next)) * scale;
                    if (x < viewport.scroll) scroller.current.scrollLeft = x;
                    else if (x > viewport.scroll + viewport.width)
                      scroller.current.scrollLeft = x - viewport.width + 16;
                  }
                }}
              >
                {ticks.map((i) => (
                  <span key={i} className="animation-ruler-tick" style={{ left: i * tickPixels }}>
                    {seconds(i * tick)}
                  </span>
                ))}
                {head !== undefined && (
                  <span className="animation-playhead-line" style={{ left: head * scale }} />
                )}
              </div>
            </div>
          )}
          {!effects.length && <p className="small-note">Select an object to add its first animation.</p>}
          {layout.main.map(row)}
          {layout.triggers.size > 0 && (
            <h3 className="animation-track-label animation-trigger-heading">
              <Zap size={12} /> Triggers
            </h3>
          )}
          {[...layout.triggers].map(([trigger, items]) => {
            const object = objectById(trigger);
            const label = 'On click of ' + (object ? animationObjectLabel(object) : 'Object');
            return (
              <section key={trigger} aria-label={label}>
                <h4 className="animation-track-label animation-trigger-source" title={label}>
                  {label}
                </h4>
                {items.map(row)}
              </section>
            );
          })}
          {slide?.animationsUnpreviewed && (
            <p className="animation-track-label small-note">
              This slide contains additional PowerPoint effects preserved for export.
            </p>
          )}
        </div>
      </div>
      <footer className="animation-pane-footer" inert={previewing}>
        {hasTimeline && selectedEffect && selectedTiming && (
          <div className="animation-clip-fields" key={selectedEffect.id}>
            <span title="Times are relative to this animation's click step or trigger">
              {selectedEffect.trigger
                ? 'Trigger time'
                : selectedTiming.group
                  ? 'Click ' + selectedTiming.group
                  : 'Slide start'}
            </span>
            {(['start', 'end'] as const).map((edge) => (
              <TimeField
                key={edge}
                label={edge === 'start' ? 'Start' : 'End'}
                value={selectedTiming[edge]}
                disabled={!!selectedEffect.imported}
                commit={(time) =>
                  updateClip(
                    selectedEffect,
                    clipTimingPatch(
                      selectedEffect,
                      layout.clips.get(selectedEffect.id)!,
                      edge,
                      time - selectedTiming[edge],
                    ),
                  )
                }
              />
            ))}
          </div>
        )}
        <div className="animation-timeline-controls">
          <button
            type="button"
            className="tool animation-timeline-toggle"
            aria-pressed={timeline}
            onClick={() => setTimeline(!timeline)}
          >
            <Timer size={14} /> {timeline ? 'Hide Timeline' : 'Show Timeline'}
          </button>
          {hasTimeline && (
            <>
              <button
                type="button"
                className="tool"
                aria-label="Play from playhead"
                title={head === undefined ? 'Place the playhead on the ruler' : 'Play from ' + seconds(head)}
                disabled={head === undefined || !layout.main.length}
                onClick={playFromHead}
              >
                <Play size={13} />
                {head === undefined ? '0s' : seconds(head)}
              </button>
              <div className="animation-timeline-zoom">
                <button
                  type="button"
                  className="tool"
                  aria-label="Zoom out timeline"
                  title="Zoom out"
                  disabled={scale <= fitScale}
                  onClick={() => zoom(0.5)}
                >
                  <Minus size={14} />
                </button>
                <button
                  type="button"
                  className="tool"
                  aria-label="Zoom in timeline"
                  title="Zoom in"
                  disabled={scale >= maxScale}
                  onClick={() => zoom(2)}
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  className="tool"
                  aria-label="Fit timeline"
                  title="Fit timeline"
                  disabled={scale <= fitScale}
                  onClick={() => zoom()}
                >
                  <Maximize2 size={13} />
                </button>
              </div>
            </>
          )}
        </div>
      </footer>
      {!previewing &&
        menu &&
        menuEntry &&
        createPortal(
          <ContextMenu
            {...(menu.anchor ? { anchor: menu.anchor } : { x: menu.x, y: menu.y })}
            label="Animation actions"
            items={items}
            close={(restore) => {
              setMenu(null);
              if (restore) (menu.anchor ?? menu.focus)?.focus();
            }}
          />,
          document.body,
        )}
    </section>
  );
}
