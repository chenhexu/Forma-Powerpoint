import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Point, Project, Slide } from './types';
import {
  choosePreviewEffect,
  easeTransition,
  hasTransition,
  playbackOption,
  SlidePlaybackFrame,
  useAnimationTimeline,
} from './SlidePlayback';
import { Dropdown } from './Ribbon';
import type { AnimationPosition } from './animationTimeline';

export type PreviewPreferences = { speed: '0.5' | '1' | '2'; requireClicks: boolean };
export type EditorPreviewKind = 'transition' | 'animation';
type Props = {
  project: Project;
  slide: Slide;
  previous?: Slide;
  scale: number;
  settings: PreviewPreferences;
};

export function TransitionPreview({
  project,
  slide,
  previous,
  scale,
  settings,
  reduceMotion,
  onFinish,
}: Props & { onFinish: () => void; reduceMotion: boolean }) {
  const [effect] = useState(() => choosePreviewEffect(slide.transition));
  const option = playbackOption(slide, effect);
  const [progress, setProgress] = useState(0);
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useEffect(() => {
    let frame = 0;
    const duration =
      !reduceMotion && hasTransition(effect, option)
        ? Math.max(100, slide.duration * 1000) / Number(settings.speed)
        : 0;
    const started = performance.now() + 160;
    const run = (now: number) => {
      const time = Math.max(0, now - started);
      if (time >= duration && now >= started) return finish.current();
      setProgress(duration ? easeTransition(Math.min(1, time / duration)) : 1);
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [effect, option, slide.duration, settings.speed, reduceMotion]);

  return (
    <div
      className="editor-preview-stage"
      data-testid="editor-transition-preview"
      aria-label="Transition preview"
    >
      <div className="scaled-playback" style={{ transform: `scale(${scale})` }}>
        <SlidePlaybackFrame
          current={progress === 0 && previous ? previous : slide}
          previous={previous}
          width={project.deck.width}
          height={project.deck.height}
          assets={project.assets}
          effect={effect}
          option={option}
          progress={progress === 0 && previous ? undefined : progress}
        />
      </div>
    </div>
  );
}

export function AnimationPreview({
  project,
  slide,
  scale,
  settings,
  from,
}: Props & { from?: string | AnimationPosition }) {
  const playback = useAnimationTimeline(slide, true, Number(settings.speed), settings.requireClicks, from);
  const status = playback.finished
    ? playback.pendingTriggers
      ? 'Click a trigger object'
      : 'Preview finished'
    : playback.waiting
      ? `Click to play step ${playback.step + 1} of ${playback.steps}`
      : 'Playing animations…';
  return (
    <div
      className="editor-preview-stage animation-preview-stage"
      data-testid="editor-animation-preview"
      onClick={() => playback.advance()}
      onKeyDown={(e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        playback.advance();
      }}
      tabIndex={0}
      role="region"
      aria-label="Animation preview"
    >
      <div className="scaled-playback" style={{ transform: `scale(${scale})` }}>
        <SlidePlaybackFrame
          current={slide}
          width={project.deck.width}
          height={project.deck.height}
          assets={project.assets}
          animations={playback.values}
          renderLink={(object) =>
            playback.triggerTargets.has(object.id) && (
              <button
                type="button"
                className="presentation-object-link"
                aria-label={`Trigger animation on ${object.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  playback.trigger(object.id);
                }}
              />
            )
          }
        />
      </div>
      <span className="editor-preview-badge" role="status">
        {status}
      </span>
    </div>
  );
}

export function PreviewSettings({
  value,
  onChange,
  close,
}: {
  value: PreviewPreferences;
  onChange: (settings: PreviewPreferences) => void;
  close: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="modal insert-dialog preview-settings"
      ref={dialog}
      aria-labelledby={id}
      onCancel={close}
    >
      <h2 id={id}>Preview Settings</h2>
      <button className="tool modal-close" aria-label="Close preview settings" onClick={close}>
        <X size={17} />
      </button>
      <div className="preview-settings-fields">
        <span>Playback speed</span>
        <Dropdown
          label="Preview speed"
          value={value.speed}
          choices={[
            ['0.5', '0.5×'],
            ['1', '1×'],
            ['2', '2×'],
          ]}
          onChange={(speed) => onChange({ ...value, speed: speed as PreviewPreferences['speed'] })}
        />
      </div>
      <label className="transition-check">
        <input
          type="checkbox"
          checked={value.requireClicks}
          onChange={(e) => onChange({ ...value, requireClicks: e.target.checked })}
        />
        Wait for clicks in animation previews
      </label>
      <p>These settings apply to editor previews.</p>
      <button className="button primary" onClick={close}>
        Done
      </button>
    </dialog>
  );
}

export function CustomPath({
  onSave,
  onCancel,
}: {
  onSave: (points: Point[]) => void;
  onCancel: () => void;
}) {
  const points = useRef<Point[]>([]);
  const pointer = useRef<number | null>(null);
  function position(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }
  return (
    <div className="editor-preview-stage custom-path-stage">
      <canvas
        data-testid="animation-path-canvas"
        aria-label="Draw custom motion path"
        onPointerDown={(e) => {
          if (e.button !== 0 || pointer.current !== null) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pointer.current = e.pointerId;
          points.current = [position(e)];
          e.currentTarget.width = e.currentTarget.clientWidth;
          e.currentTarget.height = e.currentTarget.clientHeight;
        }}
        onPointerMove={(e) => {
          if (pointer.current !== e.pointerId) return;
          const current = position(e);
          const previous = points.current.at(-1)!;
          const { width, height } = e.currentTarget;
          if (
            Math.hypot((current.x - previous.x) * width, (current.y - previous.y) * height) < 3 ||
            points.current.length >= 1200
          )
            return;
          points.current.push(current);
          const context = e.currentTarget.getContext('2d');
          if (!context) return;
          context.beginPath();
          context.strokeStyle = '#6345bd';
          context.lineWidth = 3;
          context.lineCap = 'round';
          context.moveTo(previous.x * width, previous.y * height);
          context.lineTo(current.x * width, current.y * height);
          context.stroke();
        }}
        onPointerUp={(e) => {
          if (pointer.current !== e.pointerId) return;
          pointer.current = null;
          const start = points.current[0];
          if (points.current.length > 1)
            onSave(
              points.current.map((p) => ({
                x: Number((p.x - start.x).toFixed(5)),
                y: Number((p.y - start.y).toFixed(5)),
              })),
            );
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
      />
      <div className="editor-preview-badge custom-path-help">
        Drag to draw the path{' '}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
