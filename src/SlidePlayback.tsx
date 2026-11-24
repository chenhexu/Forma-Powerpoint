import { slideBackground } from './slideEditing';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  animationEffect,
  animationLength,
  animationSchedule,
  timedAnimationProgress,
  type SlideAnimation,
} from './animations';
import type { AnimationPosition } from './animationTimeline';
import { animatedStyle, type AnimatedStyle } from './animationVisual';
import { ObjectContent, objectStyle } from './Canvas';
import { interpolatedPose } from './model';
import { TextDisplay } from './TextDisplay';
import { defaultTransitionOption, type Effect, type Transition } from './transitions';
import { transitionFrame } from './transitionPreview';
import { modelDisplayFrame, type Asset, type Slide, type SlideObject } from './types';

const noAnimations: SlideAnimation[] = [];
export const easeTransition = (t: number) => t * t * (3 - 2 * t);
const randomEffects: Effect[] = [
  'fade',
  'push',
  'wipe',
  'split',
  'shape',
  'blinds',
  'clock',
  'dissolve',
  'zoom',
];
export const choosePreviewEffect = (effect?: Transition) =>
  effect === 'random' ? randomEffects[Math.floor(Math.random() * randomEffects.length)] : effect;
export const playbackOption = (slide: Slide | undefined, effect: Transition | undefined) =>
  effect && effect !== 'preserve' ? (slide?.transitionOption ?? defaultTransitionOption(effect)) : undefined;
export const hasTransition = (effect: Transition | undefined, option: string | undefined) =>
  !!effect && effect !== 'none' && effect !== 'preserve' && (effect !== 'cut' || option === 'black');

export function useAnimationTimeline(
  slide: Slide,
  active: boolean,
  speed = 1,
  clicks = true,
  from?: string | AnimationPosition,
) {
  const animations = slide.animations ?? noAnimations;
  const timeline = useMemo(() => {
    const first = typeof from === 'string' ? animations.findIndex(({ id }) => id === from) : -1;
    const entries = animations
      .slice(Math.max(0, first))
      .map((animation, index) =>
        first >= 0 && index === 0 ? { ...animation, start: 'with' as const, trigger: undefined } : animation,
      );
    const triggers = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.trigger) continue;
      triggers.set(
        entry.trigger,
        Math.max(triggers.get(entry.trigger) ?? 0, entry.delay + animationLength(entry)),
      );
    }
    const schedule = animationSchedule(entries, clicks);
    let position: AnimationPosition = { group: 0, time: 0 };
    if (typeof from === 'object') {
      if (clicks) position = from;
      else {
        const step = animationSchedule(entries).entries.find(({ group }) => group === from.group);
        const start = schedule.entries.find(({ animation }) => animation.id === step?.animation.id);
        position.time = from.time + (start ? start.start - start.animation.delay : 0);
      }
      position = { ...position, time: Math.min(position.time, schedule.lengths[position.group] ?? 0) };
    }
    return {
      ...schedule,
      position,
      triggers,
      ordered: entries,
      completed: first > 0 ? animations.slice(0, first).filter(({ trigger }) => !trigger) : [],
    };
  }, [animations, clicks, from]);

  const [cursor, setCursor] = useState({ slide: slide.id, ...timeline.position });
  if (cursor.slide !== slide.id) setCursor({ slide: slide.id, group: 0, time: 0 });
  const { group, time } = cursor.slide === slide.id ? cursor : { group: 0, time: 0 };
  const length = timeline.lengths[group] ?? 0;
  useEffect(() => {
    if (!active || !length) return;
    let frame = 0;
    const offset = group === timeline.position.group ? timeline.position.time : 0;
    const start = performance.now();
    const tick = (now: number) => {
      const time = Math.min(length, offset + ((now - start) * speed) / 1000);
      setCursor({ slide: slide.id, group, time });
      if (time < length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, slide.id, group, length, speed, timeline.position]);

  function advance() {
    if (!active || group >= timeline.lengths.length - 1) return false;
    setCursor({ slide: slide.id, group: group + 1, time: 0 });
    return true;
  }
  const [fired, setFired] = useState<{ slide: string; times: Map<string, number>; now: number }>(() => ({
    slide: slide.id,
    times: new Map(),
    now: 0,
  }));
  if (fired.slide !== slide.id) setFired({ slide: slide.id, times: new Map(), now: 0 });
  const runningTriggers =
    active &&
    fired.slide === slide.id &&
    [...fired.times].some(
      ([id, start]) => (fired.now - start) * speed < (timeline.triggers.get(id) ?? 0) * 1000,
    );
  useEffect(() => {
    if (!runningTriggers) return;
    const frame = requestAnimationFrame((now) => setFired((previous) => ({ ...previous, now })));
    return () => cancelAnimationFrame(frame);
  }, [runningTriggers, fired.now]);
  function trigger(id: string | undefined) {
    if (!active || !id || !timeline.triggers.has(id)) return false;
    const now = performance.now();
    setFired((previous) => {
      const already = previous.times.get(id);
      if (already !== undefined && (now - already) * speed < timeline.triggers.get(id)! * 1000)
        return previous;
      return { slide: slide.id, times: new Map(previous.times).set(id, now), now };
    });
    return true;
  }
  const values = new Map<string, AnimationProgress[]>();
  function record(animation: SlideAnimation, elapsed: number) {
    const effects = values.get(animation.target) ?? [];
    effects.push({
      animation,
      progress: timedAnimationProgress(animation, elapsed),
      complete: elapsed >= animationLength(animation),
    });
    values.set(animation.target, effects);
  }
  for (const animation of timeline.completed) record(animation, animationLength(animation));
  const ordinary = timeline.entries[Symbol.iterator]();
  for (const animation of timeline.ordered) {
    if (animation.trigger) {
      const start = fired.slide === slide.id ? fired.times.get(animation.trigger) : undefined;
      record(
        animation,
        start === undefined || !active ? -1 : ((fired.now - start) * speed) / 1000 - animation.delay,
      );
      continue;
    }
    const { group: entryGroup, start } = ordinary.next().value!;
    record(
      animation,
      entryGroup < group ? animationLength(animation) : !active || entryGroup > group ? -1 : time - start,
    );
  }
  return {
    values,
    advance,
    trigger,
    triggerTargets: timeline.triggers,
    runningTriggers,
    pendingTriggers: [...timeline.triggers.keys()].some((id) => !fired.times.has(id)),
    waiting: active && time >= length && group < timeline.lengths.length - 1,
    finished: group >= timeline.lengths.length - 1 && time >= length && !runningTriggers,
    step: group,
    steps: timeline.lengths.length - 1,
  };
}

type AnimationProgress = { animation: SlideAnimation; progress: number; complete: boolean };

function combineEffects(
  effects: AnimationProgress[],
  object: SlideObject,
  w: number,
  h: number,
): AnimatedStyle {
  const result: AnimatedStyle = { frame: {} };
  let hasVisibilityEffect = false;
  for (const { animation, progress, complete } of effects) {
    const effect = animationEffect(animation.effect);
    const visibility = effect?.group === 'entr' || effect?.group === 'exit';
    if (progress < 0) {
      if (visibility && !hasVisibilityEffect && effect?.group === 'entr') result.frame.visibility = 'hidden';
      hasVisibilityEffect ||= visibility;
      continue;
    }
    if (complete && animation.after === 'hide') {
      result.frame.visibility = 'hidden';
      hasVisibilityEffect = true;
      continue;
    }
    if (complete && animation.after === 'dim')
      result.frame.opacity = Number(result.frame.opacity ?? 1) * 0.45;
    if (complete && animation.rewind) {
      if (visibility && !hasVisibilityEffect && effect?.group === 'entr') result.frame.visibility = 'hidden';
      hasVisibilityEffect ||= visibility;
      continue;
    }
    const { frame, text, object: changes } = animatedStyle(animation, progress, object, w, h);
    if (visibility) result.frame.visibility = frame.visibility;
    hasVisibilityEffect ||= visibility;
    if (frame.opacity !== undefined)
      result.frame.opacity = Number(result.frame.opacity ?? 1) * Number(frame.opacity);
    if (frame.transform)
      result.frame.transform = [result.frame.transform, frame.transform].filter(Boolean).join(' ');
    if (frame.filter) result.frame.filter = [result.frame.filter, frame.filter].filter(Boolean).join(' ');
    if (frame.clipPath) result.frame.clipPath = frame.clipPath;
    if (changes) result.object = { ...result.object, ...changes };
    if (text) result.text = { ...result.text, ...text };
  }
  return result;
}

function SlidePlaybackObject({
  object,
  effects,
  assets,
  width,
  height,
  playing,
  renderLink,
}: {
  object: SlideObject;
  effects?: AnimationProgress[];
  assets: Record<string, Asset>;
  width: number;
  height: number;
  playing?: boolean;
  renderLink?: (object: SlideObject) => ReactNode;
}) {
  const whole = effects?.filter(({ animation }) => !animation.paragraphs) ?? [];
  const paragraphEffects = effects?.filter(({ animation }) => animation.paragraphs) ?? [];
  const motion = combineEffects(whole, object, width, height);
  const painted = motion.object ? { ...object, ...motion.object } : object;
  const style = objectStyle(painted);
  const transform = [motion.frame.transform, style.transform].filter(Boolean).join(' ');
  return (
    <div
      className="slide-object"
      data-playback-object={object.id}
      style={{ ...style, ...motion.frame, transform }}
    >
      {painted.kind === 'text' ? (
        <TextDisplay
          object={painted}
          appearance={motion.text}
          paragraphAppearance={
            paragraphEffects.length
              ? (index) => {
                  const matching = paragraphEffects.filter(({ animation }) => {
                    const [start, end] = animation.paragraphs!;
                    return index >= start && index <= end;
                  });
                  const { frame, text } = combineEffects(matching, painted, width, height);
                  return { ...frame, ...text };
                }
              : undefined
          }
        />
      ) : (
        <ObjectContent o={painted} assets={assets} playing={playing} />
      )}
      {renderLink?.(painted)}
    </div>
  );
}

export function SlidePlaybackFrame({
  current,
  previous,
  width,
  height,
  assets,
  effect,
  option,
  progress,
  backwards = false,
  animations,
  playing,
  renderLink,
}: {
  current: Slide;
  previous?: Slide;
  width: number;
  height: number;
  assets: Record<string, Asset>;
  effect?: Transition;
  option?: string;
  progress?: number;
  backwards?: boolean;
  animations?: Map<string, AnimationProgress[]>;
  playing?: boolean;
  renderLink?: (object: SlideObject) => ReactNode;
}) {
  const transition = progress !== undefined && hasTransition(effect, option);
  const t = progress ?? 1;
  const morph = transition && effect === 'morph' && !!previous;
  const frame =
    transition && effect && effect !== 'morph' && effect !== 'preserve'
      ? transitionFrame(effect, option, t, width, height, backwards)
      : undefined;
  const display = [...(current.masterObjects ?? []), ...current.objects]
    .filter((o) => !o.hidden)
    .map(modelDisplayFrame);
  const former = previous
    ? [...(previous.masterObjects ?? []), ...previous.objects].filter((o) => !o.hidden).map(modelDisplayFrame)
    : [];
  const morphKeys = new Set<SlideObject>();
  const matches = new Map<SlideObject, SlideObject>();
  if (morph)
    for (const o of display) {
      const before = former.find((p) => !morphKeys.has(p) && p.kind === o.kind && p.name === o.name);
      if (before) {
        matches.set(o, before);
        morphKeys.add(before);
      }
    }

  function draw(o: SlideObject, old?: SlideObject) {
    const interpolate = (a: number, b: number) => a + (b - a) * t;
    const object = old
      ? {
          ...o,
          x: interpolate(old.x, o.x),
          y: interpolate(old.y, o.y),
          w: interpolate(old.w, o.w),
          h: interpolate(old.h, o.h),
          rotation: interpolate(old.rotation, o.rotation),
          pose:
            o.kind === 'model' ? interpolatedPose(old.pose ?? [0, 0, 0], o.pose ?? [0, 0, 0], t) : undefined,
        }
      : o;
    const rendered = (
      <SlidePlaybackObject
        key={o.id}
        object={object}
        effects={animations?.get(o.id)}
        assets={assets}
        width={width}
        height={height}
        playing={playing && !transition}
        renderLink={transition ? undefined : renderLink}
      />
    );
    return morph && !old ? (
      <div className="presentation-layer" key={o.id} style={{ opacity: t, pointerEvents: 'none' }}>
        {rendered}
      </div>
    ) : (
      rendered
    );
  }

  const prior = (frame || morph) && former.filter((o) => !morphKeys.has(o));
  const opaque = effect === 'fade' && option !== 'black' ? slideBackground(current, assets) : '#14121d';
  return (
    <div
      className="playback-stage"
      style={{
        width,
        height,
        background: frame && !frame.contentOnly ? opaque : slideBackground(current, assets),
      }}
    >
      {prior && (
        <div
          className="presentation-layer"
          style={{
            background: frame?.contentOnly
              ? 'transparent'
              : previous
                ? slideBackground(previous, assets)
                : opaque,
            pointerEvents: 'none',
            ...(morph && { opacity: 1 - t }),
            ...frame?.outgoing,
          }}
        >
          {prior.map((o) => (
            <SlidePlaybackObject key={o.id} object={o} assets={assets} width={width} height={height} />
          ))}
        </div>
      )}
      <div
        className="presentation-layer"
        style={{
          background: frame?.contentOnly || morph ? 'transparent' : slideBackground(current, assets),
          ...frame?.incoming,
        }}
      >
        {display.map((o) => draw(o, matches.get(o)))}
      </div>
      {frame?.overlay && (
        <div
          className="presentation-layer"
          aria-hidden="true"
          style={{ ...frame.overlay, zIndex: 2, pointerEvents: 'none' }}
        />
      )}
    </div>
  );
}
