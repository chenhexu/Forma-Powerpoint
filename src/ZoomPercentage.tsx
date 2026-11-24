import { useRef, useState } from 'react';

export function ZoomPercentage({
  value,
  change,
  disabled,
}: {
  value: number;
  change: (percent: number) => void;
  disabled: boolean;
}) {
  const [entry, setEntry] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; start: number; moved: boolean } | null>(null);
  const ignoreClick = useRef(false);
  const percent = Math.round(value);
  function commit(text: string) {
    const input = text.trim().replace(/%$/, '').trim();
    const next = Number(input);
    if (input && Number.isFinite(next)) change(next);
    setEntry(null);
  }

  return entry !== null && !disabled ? (
    <label className="zoom-percentage-entry">
      <input
        aria-label="Slide zoom percentage"
        inputMode="decimal"
        autoFocus
        value={entry}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setEntry(event.currentTarget.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Enter') commit(event.currentTarget.value);
            else setEntry(null);
            requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
          }
        }}
      />
      <span aria-hidden="true">%</span>
    </label>
  ) : (
    <button
      type="button"
      ref={button}
      className="zoom-percentage"
      aria-label={`Slide zoom, ${percent}%`}
      title="Click to enter a zoom percentage or drag horizontally to adjust"
      disabled={disabled}
      onClick={() => {
        if (ignoreClick.current) ignoreClick.current = false;
        else setEntry(String(percent));
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        ignoreClick.current = false;
        drag.current = { id: event.pointerId, x: event.clientX, start: value, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (active?.id !== event.pointerId) return;
        const dx = event.clientX - active.x;
        if (!active.moved && Math.abs(dx) < 4) return;
        active.moved = true;
        ignoreClick.current = true;
        change(Math.round(active.start + dx * 0.5));
      }}
      onPointerCancel={() => {
        if (drag.current?.moved) change(drag.current.start);
        drag.current = null;
        ignoreClick.current = false;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') ignoreClick.current = false;
        const direction = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[event.key];
        if (direction === undefined) return;
        event.preventDefault();
        change(percent + direction * (event.shiftKey ? 10 : 1));
      }}
    >
      {percent}%
    </button>
  );
}
