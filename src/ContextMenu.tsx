import { Check, ChevronDown } from 'lucide-react';
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  checked?: boolean;
  preview?: ReactNode;
  group?: string;
  detail?: string;
  submenu?: { label: string; items: Omit<MenuItem, 'submenu'>[] };
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
  const submenusId = useId();
  const [expanded, setExpanded] = useState<{ label: string; pinned: boolean }>();
  const focusSubmenu = useRef<HTMLDivElement>(null);
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
    const observer = new ResizeObserver(position);
    if (!anchor) observer.observe(node);
    if (anchor) window.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', position, true);
    };
  }, [anchor, focusLast, x, y]);

  useLayoutEffect(() => {
    focusSubmenu.current?.querySelector<HTMLButtonElement>('.menu-submenu > button:not(:disabled)')?.focus();
    focusSubmenu.current = null;
  }, [expanded]);

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

  function actionButton({ label, action, disabled, checked, preview, detail }: MenuItem, nested = false) {
    return (
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
        {!nested && hasPreviews && (
          <span className="menu-preview" aria-hidden="true">
            {preview}
          </span>
        )}
        <span className={detail ? 'menu-item-with-detail' : undefined}>
          {label}
          {detail && <span className="menu-item-detail">{detail}</span>}
        </span>
        {checked && <Check size={15} aria-hidden="true" className="menu-check" />}
      </button>
    );
  }

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
      {items.map((item, index) => {
        const { label, group, submenu } = item;
        const open = expanded?.label === label;
        const submenuId = `${submenusId}-${index}`;
        return (
          <Fragment key={label}>
            {group && group !== items[index - 1]?.group && (
              <div className="menu-group-label" aria-hidden="true">
                {group}
              </div>
            )}
            {submenu ? (
              <div
                className="menu-split-group"
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    event.stopPropagation();
                    focusSubmenu.current = event.currentTarget;
                    setExpanded({ label, pinned: true });
                  } else if (open && (event.key === 'ArrowLeft' || event.key === 'Escape')) {
                    event.preventDefault();
                    event.stopPropagation();
                    setExpanded(undefined);
                    event.currentTarget.querySelector<HTMLButtonElement>('.menu-submenu-toggle')?.focus();
                  }
                }}
              >
                <div className="menu-split-action">
                  {actionButton(item)}
                  <button
                    className="menu-submenu-toggle"
                    type="button"
                    role="menuitem"
                    aria-label={submenu.label}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-controls={open ? submenuId : undefined}
                    title={submenu.label}
                    disabled={item.disabled}
                    onPointerEnter={(event) => {
                      if (event.pointerType === 'mouse' && !open) setExpanded({ label, pinned: false });
                    }}
                    onClick={() => setExpanded(open && expanded.pinned ? undefined : { label, pinned: true })}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </div>
                {open && (
                  <div className="menu-submenu" role="menu" id={submenuId} aria-label={submenu.label}>
                    {submenu.items.map((child) => (
                      <Fragment key={child.label}>{actionButton(child, true)}</Fragment>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              actionButton(item)
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
