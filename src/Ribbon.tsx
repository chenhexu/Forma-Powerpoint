import { ChevronDown, ChevronUp, PanelTop, Settings2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type MouseEventHandler, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ContextMenu } from './ContextMenu';

export const mainTabs = [
  'File',
  'Home',
  'Insert',
  'Draw',
  'Design',
  'Transitions',
  'Animations',
  'Slide Show',
  'Record',
  'Review',
  'View',
  'Help',
] as const;
export type MainRibbonTab = (typeof mainTabs)[number];
export type RibbonTab = MainRibbonTab | 'Shape Format' | 'Picture Format' | '3D Model';
export type FormatTab = 'Shape Format' | 'Picture Format' | '3D Model';
export const customRibbonTabs: readonly MainRibbonTab[] = mainTabs.filter(
  (tab) => tab !== 'File' && tab !== 'Home',
);

export function Ribbon({
  active,
  contextual,
  select,
  children,
  lockTabs,
  inert,
  hiddenTabs,
  collapsed,
  quickAccessVisible,
  toggleQuickAccess,
  toggleCollapsed,
  customize,
}: {
  active: RibbonTab;
  contextual?: FormatTab;
  select: (tab: RibbonTab) => void;
  children: ReactNode;
  lockTabs?: boolean;
  inert?: boolean;
  hiddenTabs: readonly MainRibbonTab[];
  collapsed: boolean;
  quickAccessVisible: boolean;
  toggleQuickAccess: () => void;
  toggleCollapsed: () => void;
  customize: () => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; focus?: HTMLElement }>();
  const tabs: RibbonTab[] = mainTabs.filter((tab) => !hiddenTabs.includes(tab));
  if (contextual) tabs.push(contextual);
  const current = tabs.indexOf(active);
  const expanded = !collapsed || reveal || lockTabs;
  useEffect(() => {
    setReveal(false);
  }, [collapsed]);
  useEffect(() => {
    if (!collapsed || !reveal) return;
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Element &&
        !root.current?.contains(event.target) &&
        !event.target.closest('.context-menu, dialog[open]')
      )
        setReveal(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [collapsed, reveal]);
  function switchTab(tab: RibbonTab) {
    if (collapsed) setReveal(true);
    select(tab);
  }
  return (
    <div
      className="ribbon"
      ref={root}
      inert={inert}
      onContextMenu={(event) => {
        if (lockTabs || event.defaultPrevented) return;
        event.preventDefault();
        setMenu({
          x: event.clientX,
          y: event.clientY,
          focus: document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
        });
      }}
    >
      <div className="ribbon-heading">
        <div className="ribbon-tabs" role="tablist" aria-label="Ribbon" inert={lockTabs}>
          {tabs.map((tab, i) => (
            <button
              key={tab}
              id={`${id}-tab-${i}`}
              role="tab"
              type="button"
              tabIndex={tab === active ? 0 : -1}
              aria-selected={tab === active}
              aria-controls={`${id}-panel`}
              className={`ribbon-tab ${tab === contextual ? 'contextual' : ''}`}
              onClick={() => switchTab(tab)}
              onKeyDown={(e) => {
                if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                  e.preventDefault();
                  e.stopPropagation();
                  const bounds = e.currentTarget.getBoundingClientRect();
                  setMenu({ x: bounds.left, y: bounds.bottom, focus: e.currentTarget });
                  return;
                }
                if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
                e.preventDefault();
                e.stopPropagation();
                const at = tabs.indexOf(tab);
                const next =
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? tabs.length - 1
                      : (at + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                switchTab(tabs[next]);
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ribbon-collapse"
          disabled={lockTabs}
          aria-label={collapsed ? 'Expand the Ribbon' : 'Collapse the Ribbon'}
          title={collapsed ? 'Expand the Ribbon' : 'Collapse the Ribbon'}
          aria-expanded={!!expanded}
          aria-controls={expanded ? `${id}-panel` : undefined}
          onClick={toggleCollapsed}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {expanded && (
        <div
          className={`ribbon-panel ${active === 'Home' ? 'home-ribbon' : active === 'Insert' ? 'insert-ribbon' : ''}`}
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${current}`}
        >
          {children}
        </div>
      )}
      {menu &&
        !lockTabs &&
        createPortal(
          <ContextMenu
            x={menu.x}
            y={menu.y}
            label="Ribbon actions"
            close={(restore) => {
              setMenu(undefined);
              if (restore) menu.focus?.focus();
            }}
            items={[
              {
                label: quickAccessVisible ? 'Hide Quick Access Toolbar' : 'Show Quick Access Toolbar',
                action: toggleQuickAccess,
                preview: <PanelTop size={16} />,
              },
              { label: 'Customize the Ribbon…', action: customize, preview: <Settings2 size={16} /> },
              {
                label: collapsed ? 'Expand the Ribbon' : 'Collapse the Ribbon',
                action: toggleCollapsed,
                preview: collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />,
              },
            ]}
          />,
          document.body,
        )}
    </div>
  );
}

export function Dropdown<T extends string>({
  label,
  caption = label,
  value,
  choices,
  onChange,
  disabled,
  disabledChoices,
  icon,
  previews,
  groups,
  compact,
  onMouseDown,
  leading,
}: {
  label: string;
  caption?: string;
  value?: T;
  choices: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
  disabled?: boolean;
  disabledChoices?: readonly T[];
  icon?: ReactNode;
  previews?: Partial<Record<T, ReactNode>>;
  groups?: Partial<Record<T, string>>;
  compact?: boolean;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  leading?: (choose: (value: T) => void) => ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<'current' | 'last' | null>(null);
  if (disabled && open) setOpen(null);
  const selected = choices.find(([key]) => key === value)?.[1];
  const close = (restoreFocus?: boolean) => {
    setOpen(null);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={`dropdown-trigger${icon ? ' with-icon' : ''}${compact ? ' compact' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!open}
        aria-controls={open ? id : undefined}
        title={selected ?? label}
        disabled={disabled}
        onMouseDown={onMouseDown}
        onClick={() => setOpen((state) => (state ? null : 'current'))}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(event.key === 'ArrowUp' ? 'last' : 'current');
        }}
      >
        {icon}
        {!compact && <span>{selected ?? caption}</span>}
        <ChevronDown className="dropdown-chevron" size={12} aria-hidden="true" />
      </button>
      {open &&
        trigger.current &&
        createPortal(
          <ContextMenu
            anchor={trigger.current}
            id={id}
            label={label}
            focusLast={open === 'last'}
            close={close}
            leading={leading?.((value) => {
              close(true);
              onChange(value);
            })}
            items={choices.map(([key, text]) => ({
              label: text,
              checked: value === undefined ? undefined : value === key,
              disabled: disabledChoices?.includes(key),
              group: groups?.[key],
              preview: previews?.[key],
              action: () => onChange(key),
            }))}
          />,
          trigger.current.closest('dialog[open]') || document.body,
        )}
    </>
  );
}

export function RibbonGroup({
  name,
  children,
  hideLabel,
}: {
  name: string;
  children: ReactNode;
  hideLabel?: boolean;
}) {
  return (
    <section className="ribbon-group" aria-label={name}>
      <div className="ribbon-commands">{children}</div>
      {!hideLabel && (
        <div className="ribbon-group-label" aria-hidden="true">
          {name}
        </div>
      )}
    </section>
  );
}
