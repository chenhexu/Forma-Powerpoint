import { animationLength, animationSchedule, type SlideAnimation } from './animations';

export type ClipTiming = {
  base: number;
  previousStart: number;
  start: number;
  end: number;
  origin: number;
  group: number;
};

export type AnimationPosition = { group: number; time: number };
export type ClipEdit = 'move' | 'start' | 'end';
export const timelineSeconds = (time: number) => Math.round(time * 1000) / 1000;

export function animationTimeline(animations: SlideAnimation[]) {
  const { entries, lengths } = animationSchedule(animations);
  let mainLength = 0;
  const offsets = lengths.map((length) => {
    const offset = mainLength;
    mainLength += length;
    return offset;
  });
  const clips = new Map<string, ClipTiming>();
  const triggers = new Map<string, SlideAnimation[]>();
  for (const [index, { animation, start, end, group }] of entries.entries()) {
    const previous = entries[index - 1];
    clips.set(animation.id, {
      base: timelineSeconds(start - animation.delay),
      previousStart: previous?.group === group ? timelineSeconds(previous.start) : 0,
      start,
      end,
      origin: offsets[group],
      group,
    });
  }
  let length = mainLength;
  for (const animation of animations) {
    const trigger = animation.trigger;
    if (!trigger) continue;
    const end = animation.delay + animationLength(animation);
    clips.set(animation.id, { base: 0, previousStart: 0, start: animation.delay, end, origin: 0, group: 0 });
    const list = triggers.get(trigger) ?? [];
    list.push(animation);
    triggers.set(trigger, list);
    length = Math.max(length, end);
  }
  return { clips, offsets, mainLength, length, main: entries.map(({ animation }) => animation), triggers };
}

export function clipTimingPatch(animation: SlideAnimation, clip: ClipTiming, edit: ClipEdit, delta: number) {
  const repeats = animation.repeat ?? 1;
  let start = animation.start;
  let base = clip.base;
  let delay = animation.delay;
  let duration = animation.duration;
  if (edit !== 'end') {
    const requested = timelineSeconds(clip.start + delta);
    // An overlap can use With Previous plus a nonnegative PowerPoint delay.
    if (!animation.trigger && start === 'after' && requested < base && clip.previousStart < base) {
      start = 'with';
      base = clip.previousStart;
    }
    const latest = edit === 'start' ? clip.end - 0.001 * repeats : Infinity;
    delay = timelineSeconds(Math.max(0, Math.min(3600, Math.min(latest, requested) - base)));
  }
  if (edit !== 'move') {
    const length = edit === 'start' ? clip.end - base - delay : clip.end - clip.start + delta;
    duration = timelineSeconds(Math.max(0.001, Math.min(3600, length / repeats)));
  }
  return { start, delay, duration };
}
