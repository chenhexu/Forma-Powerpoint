import { Check } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  checked?: boolean;
  preview?: ReactNode;
  group?: string;
}

type MenuPosition = { x: number; y: number; anchor?: undefined } | { anchor: HTMLButtonElement };

export function ContextMenu(
  props: MenuPosition & {
    items: MenuItem[];
    close: (restoreFocus?: boolean) => void;
    id?: string;
    label?: string;
    focusLast?: boolean;
    leading?: ReactNode;
  },
) {
  const { items, close, anchor, id, label = 'Edit actions', focusLast, leading } = props;
  const hasPreviews = items.some((item) => item.preview != null);
  const x = 'x' in props ? props.x : 0;
  const y = 'y' in props ? props.y : 0;
  const menu = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useLayoutEffect(() => {
    const node = menu.current!;
    const scrollport = anchor?.closest('dialog[open], .ribbon-panel, .properties');
    const position = () => {
      const bounds = anchor?.getBoundingClientRect();
      let top = y;
      if (bounds) {
        const visible = scrollport?.getBoundingClientRect();
        if (
          visible &&
          (bounds.right <= visible.left ||
            bounds.left >= visible.right ||
            bounds.bottom <= visible.top ||
            bounds.top >= visible.bottom)
        ) {
          closeRef.current(false);
          return;
        }
        const above = bounds.top - 12;
        const below = innerHeight - bounds.bottom - 12;
        const placeBelow = node.scrollHeight <= below || below >= above;
        node.style.maxHeight = `${Math.max(0, placeBelow ? below : above)}px`;
        top = placeBelow ? bounds.bottom + 6 : bounds.top - node.offsetHeight - 6;
      }
      node.style.left = `${Math.max(6, Math.min(bounds?.left ?? x, innerWidth - node.offsetWidth - 6))}px`;
      node.style.top = `${Math.max(6, Math.min(top, innerHeight - node.offsetHeight - 6))}px`;
    };
    position();
    const buttons = Array.from(node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const initial = focusLast
      ? buttons.at(-1)
      : (buttons.find((button) => button.getAttribute('aria-checked') === 'true') ?? buttons[0]);
    initial?.focus();
    if (anchor) window.addEventListener('scroll', position, true);
    return () => window.removeEventListener('scroll', position, true);
  }, [anchor, focusLast, x, y]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !anchor?.contains(target)) closeRef.current(false);
    };
    const resize = () => closeRef.current(false);
    window.addEventListener('pointerdown', outside, !!anchor);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('pointerdown', outside, !!anchor);
      window.removeEventListener('resize', resize);
    };
  }, [anchor]);

  return (
    <div
      className={`context-menu${anchor ? ' ribbon-popup' : ''}${hasPreviews ? ' has-previews' : ''}`}
      ref={menu}
      id={id}
      role="menu"
      aria-label={label}
      onContextMenu={(e) => e.preventDefault()}
      onBlur={(e) => {
        if (
          e.relatedTarget &&
          !e.currentTarget.contains(e.relatedTarget) &&
          !anchor?.contains(e.relatedTarget)
        )
          close(false);
      }}
      onKeyDown={(event) => {
        if (anchor) event.stopPropagation();
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab'].includes(event.key)) return;
        event.stopPropagation();
        if (event.key === 'Tab') {
          close(true);
          return;
        }
        event.preventDefault();
        if (event.key === 'Escape') {
          close(true);
          return;
        }
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        );
        if (!buttons.length) return;
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }}
    >
      {leading}
      {items.map(({ label, action, disabled, checked, preview, group }, index) => (
        <Fragment key={label}>
          {group && group !== items[index - 1]?.group && (
            <div className="menu-group-label" aria-hidden="true">
              {group}
            </div>
          )}
          <button
            type="button"
            role={checked === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={checked}
            disabled={disabled}
            tabIndex={anchor ? -1 : undefined}
            onClick={() => {
              close(true);
              action();
            }}
          >
            {hasPreviews && (
              <span className="menu-preview" aria-hidden="true">
                {preview}
              </span>
            )}
            <span>{label}</span>
            {checked && <Check size={15} aria-hidden="true" className="menu-check" />}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
