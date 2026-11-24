import { PresenterNotes } from './PresenterTools';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Project, SlideObject } from './types';
import { webLink } from './insertContent';
import {
  choosePreviewEffect,
  easeTransition,
  hasTransition,
  playbackOption,
  SlidePlaybackFrame,
  useAnimationTimeline,
} from './SlidePlayback';

export function Presentation({
  project,
  start,
  reduceMotion,
  allowWebLinks,
  presenterWindow,
  showOrder,
  rehearse,
  useTimings = true,
  onClose,
}: {
  project: Project;
  start: number;
  reduceMotion: boolean;
  allowWebLinks: boolean;
  presenterWindow?: Window;
  showOrder?: string[];
  rehearse?: (timings: Record<string, number>) => void;
  useTimings?: boolean;
  onClose: () => void;
}) {
  const [showProject] = useState(() => {
    if (!showOrder) return project;
    const byId = new Map(project.deck.slides.map((slide) => [slide.id, slide]));
    const slides = showOrder.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    return slides.length ? { ...project, deck: { ...project.deck, slides } } : project;
  });
  const { deck, assets } = showProject;
  const [index, setIndex] = useState(() => {
    const next = deck.slides.findIndex((slide, i) => i >= start && !slide.hidden);
    return next < 0 ? start : next;
  });
  const [from, setFrom] = useState<number | null>(null);
  const [t, setT] = useState(1);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const host = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const recorded = useRef<Record<string, number>>({});
  const entered = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!rehearse) return;
    const interval = setInterval(() => setElapsed((performance.now() - entered.current) / 1000), 250);
    return () => clearInterval(interval);
  }, [!!rehearse]);
  function recordTiming() {
    const now = performance.now();
    recorded.current[deck.slides[index].id] = Math.max(0.1, Math.round((now - entered.current) / 10) / 100);
    entered.current = now;
    setElapsed(0);
  }
  const transitionSlide = from === null ? undefined : deck.slides[Math.max(index, from)];
  const effect = useMemo(
    () => choosePreviewEffect(transitionSlide?.transition),
    [index, from, transitionSlide],
  );
  const option = playbackOption(transitionSlide, effect);
  const current = deck.slides[index];
  const playback = useAnimationTimeline(current, from === null);

  useEffect(() => {
    const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    host.current?.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (from === null) return;
    if (
      reduceMotion ||
      !hasTransition(effect, option) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setFrom(null);
      return;
    }
    let frame = 0;
    const duration = Math.max(100, (transitionSlide?.duration ?? 1) * 1000);
    const start = performance.now() - progress.current * duration;
    const run = (now: number) => {
      const v = Math.max(0, Math.min(1, (now - start) / duration));
      progress.current = v;
      setT(easeTransition(v));
      if (v < 1) frame = requestAnimationFrame(run);
      else setFrom(null);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [index, from, effect, option, transitionSlide?.duration, reduceMotion]);

  function goTo(target: number) {
    const next = Math.max(0, Math.min(deck.slides.length - 1, target));
    if (next === index) return;
    if (rehearse) recordTiming();
    else entered.current = performance.now();
    progress.current = next === from ? 1 - progress.current : 0;
    setFrom(index);
    setT(easeTransition(progress.current));
    setIndex(next);
  }
  function neighbor(delta: number) {
    let next = index + delta;
    while (next >= 0 && next < deck.slides.length && deck.slides[next].hidden) next += delta;
    return next >= 0 && next < deck.slides.length ? next : undefined;
  }
  const next = neighbor(1);
  const before = neighbor(-1);
  const advanceAfter = current.advanceAfter;
  useEffect(() => {
    if (
      rehearse ||
      !useTimings ||
      from !== null ||
      !playback.finished ||
      advanceAfter == null ||
      next === undefined
    )
      return;
    const timer = window.setTimeout(
      () => goTo(next),
      Math.max(0, advanceAfter * 1000 - (performance.now() - entered.current)),
    );
    return () => clearTimeout(timer);
  }, [from, playback.finished, advanceAfter, next, index, !!rehearse, useTimings]);

  function go(delta: number, allowSlide = true) {
    if (delta > 0 && playback.advance()) return;
    const target = delta > 0 ? next : before;
    if (allowSlide && target !== undefined) goTo(target);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ' && (e.target as HTMLElement).closest('button')) return;
      if (['ArrowRight', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
        go(1);
      }
      if (['ArrowLeft', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'Escape') onClose();
    };
    const exit = () => {
      if (!document.fullscreenElement) onClose();
    };
    window.addEventListener('keydown', key);
    document.addEventListener('fullscreenchange', exit);
    return () => {
      window.removeEventListener('keydown', key);
      document.removeEventListener('fullscreenchange', exit);
    };
  });

  function renderLink(o: SlideObject) {
    if (playback.triggerTargets.has(o.id))
      return (
        <button
          type="button"
          className="presentation-object-link"
          aria-label={`Trigger animation on ${o.name}`}
          onClick={(event) => {
            event.stopPropagation();
            playback.trigger(o.id);
          }}
        />
      );
    if (!o.link) return;
    const link = o.link;
    if (link.type === 'web') {
      if (!allowWebLinks) return;
      const url = webLink(link.url);
      return (
        url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={'Open ' + o.name}
            className="presentation-object-link"
            onClick={(event) => event.stopPropagation()}
          />
        )
      );
    }
    return (
      <button
        type="button"
        className="presentation-object-link"
        aria-label={'Follow ' + o.name}
        onClick={(event) => {
          event.stopPropagation();
          if (link.type === 'slide') {
            const target = deck.slides.findIndex(({ part }) => part === link.part);
            if (target >= 0) goTo(target);
            return;
          }
          switch (link.jump) {
            case 'firstslide':
              goTo(0);
              break;
            case 'lastslide':
              goTo(deck.slides.length - 1);
              break;
            case 'nextslide':
              if (next !== undefined) goTo(next);
              break;
            case 'previousslide':
              go(-1);
              break;
            case 'endshow':
              onClose();
              break;
          }
        }}
      />
    );
  }

  const scale = Math.max(0.01, Math.min((size.w - 60) / deck.width, (size.h - 120) / deck.height));
  return (
    <div
      className="presentation"
      ref={host}
      data-testid="presentation"
      onClick={(event) => {
        if ((event.target as Element).closest('button')) return;
        const { left, width } = event.currentTarget.getBoundingClientRect();
        const direction = event.clientX < left + width / 2 ? -1 : 1;
        if (direction === -1 && !playback.finished && from === null && playback.advance()) return;
        go(direction, current.advanceOnClick !== false);
      }}
    >
      {presenterWindow && (
        <PresenterNotes
          popup={presenterWindow}
          project={showProject}
          index={index}
          next={next}
          previous={before}
          goBack={() => go(-1)}
          advance={() => go(1)}
        />
      )}
      <div className="presentation-top">
        <span>
          FORMA <span className="presentation-note">Approximate browser preview</span>
        </span>
        {rehearse && (
          <div className="rehearsal-controls">
            <span>{elapsed.toFixed(1)} s on this slide</span>
            <button
              className="button"
              type="button"
              onClick={() => {
                recordTiming();
                rehearse(recorded.current);
              }}
            >
              Save Rehearsed Timings
            </button>
          </div>
        )}
        <button onClick={onClose} aria-label="Exit presentation">
          <X size={20} />
        </button>
      </div>
      <div
        data-testid="presentation-slide"
        style={{ width: deck.width * scale, height: deck.height * scale, position: 'relative' }}
      >
        <div className="scaled-playback" style={{ transform: `scale(${scale})` }}>
          <SlidePlaybackFrame
            current={current}
            previous={from === null ? undefined : deck.slides[from]}
            width={deck.width}
            height={deck.height}
            assets={assets}
            effect={effect}
            option={option}
            progress={from === null ? undefined : t}
            backwards={from !== null && from > index}
            animations={playback.values}
            playing
            renderLink={renderLink}
          />
        </div>
      </div>
      <div className="presentation-controls">
        <button aria-label="Previous slide" onClick={() => go(-1)} disabled={before === undefined}>
          <ChevronLeft size={20} />
        </button>
        <span>
          {index + 1} / {deck.slides.length}
        </span>
        <button
          aria-label="Next slide"
          onClick={() => go(1)}
          disabled={next === undefined && playback.finished}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
