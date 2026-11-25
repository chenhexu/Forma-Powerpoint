import { PanelRight, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

export const paneLabels = {
  object: 'Object',
  transition: 'Transition',
  animations: 'Animation Pane',
  selection: 'Selection',
};
export type EditorPane = keyof typeof paneLabels;

export function SidebarResize({
  side,
  width,
  min,
  max,
  resize,
  collapse,
}: {
  side: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  resize: (width: number) => void;
  collapse: () => void;
}) {
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
  const direction = side === 'left' ? 1 : -1;
  const title = side === 'left' ? 'Resize slides sidebar' : 'Resize editing sidebar';
  const setWidth = (next: number) => resize(Math.min(max, Math.max(min, next)));
  return (
    <div
      className={`sidebar-resize sidebar-resize-${side}`}
      role="separator"
      tabIndex={0}
      aria-label={title}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      title={title}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        drag.current = { pointer: event.pointerId, x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const gesture = drag.current;
        if (gesture?.pointer === event.pointerId)
          setWidth(gesture.width + (event.clientX - gesture.x) * direction);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'Home') collapse();
          else setWidth(max);
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        setWidth(width + (event.key === 'ArrowRight' ? 1 : -1) * direction * (event.shiftKey ? 32 : 8));
      }}
    />
  );
}

export function SidebarTabs({
  tabs,
  active,
  select,
  close,
  collapse,
  locked,
  focusFallback,
}: {
  tabs: EditorPane[];
  active: EditorPane | undefined;
  select: (tab: EditorPane) => void;
  close: (tab: EditorPane) => void;
  collapse: () => void;
  locked: boolean;
  focusFallback: () => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    const list = strip.current;
    const selected = list?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (list && selected) {
      const { left, right } = selected.parentElement!.getBoundingClientRect();
      const bounds = list.getBoundingClientRect();
      if (left < bounds.left) list.scrollLeft += left - bounds.left;
      if (right > bounds.right) list.scrollLeft += right - bounds.right;
    }
    if (!focusNext.current) return;
    focusNext.current = false;
    if (selected) selected.focus({ preventScroll: true });
    else focusFallback();
  }, [active, tabs, focusFallback]);

  function closeTab(tab: EditorPane) {
    focusNext.current = true;
    close(tab);
  }
  return (
    <div className="sidebar-tabbar">
      <div className="sidebar-tabs" role="tablist" aria-label="Editing panels" ref={strip}>
        {tabs.map((tab, index) => (
          <div
            className="sidebar-tab"
            data-active={tab === active || undefined}
            role="presentation"
            key={tab}
          >
            <button
              id={`editor-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={tab === active}
              aria-controls={`editor-pane-${tab}`}
              tabIndex={tab === active ? 0 : -1}
              disabled={locked}
              onClick={() => select(tab)}
              onKeyDown={(event) => {
                if (event.key === 'Delete') {
                  event.preventDefault();
                  event.stopPropagation();
                  closeTab(tab);
                  return;
                }
                const byKey: Record<string, number> = {
                  ArrowLeft: (index - 1 + tabs.length) % tabs.length,
                  ArrowRight: (index + 1) % tabs.length,
                  Home: 0,
                  End: tabs.length - 1,
                };
                const next = tabs[byKey[event.key]];
                if (!next) return;
                event.preventDefault();
                event.stopPropagation();
                focusNext.current = true;
                select(next);
              }}
            >
              {paneLabels[tab]}
            </button>
            <button
              className="sidebar-close-tab"
              type="button"
              aria-label={`Close ${paneLabels[tab]} tab`}
              title={`Close ${paneLabels[tab]} tab`}
              disabled={locked}
              onClick={() => closeTab(tab)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="sidebar-toggle"
        title="Collapse editing sidebar"
        aria-label="Collapse editing sidebar"
        disabled={locked}
        onClick={collapse}
      >
        <PanelRight size={15} />
      </button>
    </div>
  );
}
