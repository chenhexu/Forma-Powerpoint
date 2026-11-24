import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  BookOpenCheck,
  ChevronRight,
  Globe2,
  LayoutPanelTop,
  PanelTop,
  Plug,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Accessibility,
  X,
} from 'lucide-react';
import { customRibbonTabs, Dropdown, mainTabs, type MainRibbonTab } from './Ribbon';

const sections = [
  ['General', Settings2],
  ['Proofing', BookOpenCheck],
  ['Save', Save],
  ['Language', Globe2],
  ['Accessibility', Accessibility],
  ['Advanced', SlidersHorizontal],
  ['Customize Ribbon', LayoutPanelTop],
  ['Quick Access Toolbar', PanelTop],
  ['Add-ins', Plug],
  ['Trust Center', ShieldCheck],
] as const;
export type OptionsSection = (typeof sections)[number][0];
const quickCommands = ['Undo', 'Redo', 'Morph'] as const;
export type QuickCommand = (typeof quickCommands)[number];
const dateLanguages = [
  ['browser', 'Browser default'],
  ['en-US', 'English (United States)'],
  ['en-CA', 'English (Canada)'],
  ['en-GB', 'English (United Kingdom)'],
  ['fr-CA', 'French (Canada)'],
  ['fr-FR', 'French (France)'],
] as const;

export interface Preferences {
  hiddenTabs: MainRibbonTab[];
  ribbonCollapsed: boolean;
  showQuickAccess: boolean;
  quickCommands: QuickCommand[];
  author: string;
  initialView: 'normal' | 'sorter';
  spellCheck: boolean;
  localRecovery: boolean;
  dateLanguage: (typeof dateLanguages)[number][0];
  reduceMotion: boolean;
  smartGuides: boolean;
  allowSlideShowLinks: boolean;
}

const preferencesKey = 'forma-preferences-v1';
const defaults: Preferences = {
  hiddenTabs: [],
  ribbonCollapsed: false,
  showQuickAccess: true,
  quickCommands: [...quickCommands],
  author: 'Forma',
  initialView: 'normal',
  spellCheck: true,
  localRecovery: true,
  dateLanguage: 'browser',
  reduceMotion: false,
  smartGuides: true,
  allowSlideShowLinks: true,
};

export function readPreferences(): Preferences {
  try {
    const saved: Partial<Preferences> = JSON.parse(localStorage.getItem(preferencesKey) ?? '{}');
    const boolean = <K extends keyof Preferences>(key: K) =>
      typeof saved[key] === 'boolean' ? (saved[key] as boolean) : (defaults[key] as boolean);
    return {
      hiddenTabs: Array.isArray(saved.hiddenTabs)
        ? customRibbonTabs.filter((tab) => saved.hiddenTabs!.includes(tab))
        : [],
      ribbonCollapsed: boolean('ribbonCollapsed'),
      showQuickAccess: boolean('showQuickAccess'),
      quickCommands: Array.isArray(saved.quickCommands)
        ? quickCommands.filter((command) => saved.quickCommands!.includes(command))
        : [...quickCommands],
      author:
        typeof saved.author === 'string'
          ? saved.author.trim().slice(0, 64) || defaults.author
          : defaults.author,
      initialView: saved.initialView === 'sorter' ? 'sorter' : 'normal',
      spellCheck: boolean('spellCheck'),
      localRecovery: boolean('localRecovery'),
      dateLanguage: dateLanguages.find(([id]) => id === saved.dateLanguage)?.[0] ?? 'browser',
      reduceMotion: boolean('reduceMotion'),
      smartGuides: boolean('smartGuides'),
      allowSlideShowLinks: boolean('allowSlideShowLinks'),
    };
  } catch {
    return defaults;
  }
}
export function storePreferences(value: Preferences) {
  try {
    localStorage.setItem(preferencesKey, JSON.stringify(value));
  } catch {
    // Preferences still apply for the current browser session when storage is unavailable.
  }
}

export function Options({
  current,
  initial,
  apply,
  close,
}: {
  current: Preferences;
  initial: OptionsSection;
  apply: (preferences: Preferences) => void;
  close: () => void;
}) {
  const [section, setSection] = useState(initial);
  const [draft, setDraft] = useState(current);
  function change(patch: Partial<Preferences>) {
    setDraft((previous) => ({ ...previous, ...patch }));
  }
  const root = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    root.current?.showModal();
  }, []);
  function dismiss() {
    root.current?.close();
    close();
  }
  function checkbox(
    key:
      | 'ribbonCollapsed'
      | 'showQuickAccess'
      | 'spellCheck'
      | 'localRecovery'
      | 'reduceMotion'
      | 'smartGuides'
      | 'allowSlideShowLinks',
    label: string,
  ) {
    return (
      <label className="options-check">
        <input
          type="checkbox"
          checked={draft[key]}
          onChange={(event) => change({ [key]: event.target.checked })}
        />
        {label}
      </label>
    );
  }

  let content: ReactNode;
  switch (section) {
    case 'General':
      content = (
        <>
          <label className="options-field">
            Comment author
            <input
              maxLength={64}
              value={draft.author}
              onChange={(event) => change({ author: event.target.value })}
            />
          </label>
          <div className="options-field">
            <span>Default presentation view</span>
            <Dropdown
              label="Default presentation view"
              choices={
                [
                  ['normal', 'Normal'],
                  ['sorter', 'Slide Sorter'],
                ] as const
              }
              value={draft.initialView}
              onChange={(initialView) => change({ initialView })}
            />
          </div>
        </>
      );
      break;
    case 'Proofing':
      content = (
        <>
          {checkbox('spellCheck', 'Check spelling as you type')}
          <p>Uses the spelling dictionaries available to your browser.</p>
        </>
      );
      break;
    case 'Save':
      content = (
        <>
          {checkbox('localRecovery', 'Save a recovery copy on this device')}
          <p>Forma saves your current presentation locally as you edit and reopens it when you return.</p>
        </>
      );
      break;
    case 'Language':
      content = (
        <div className="options-field">
          <span>Date and time formats</span>
          <Dropdown
            label="Date and time language"
            choices={dateLanguages}
            value={draft.dateLanguage}
            onChange={(dateLanguage) => change({ dateLanguage })}
          />
          <p>Applies to new dates and times inserted on slides.</p>
        </div>
      );
      break;
    case 'Accessibility':
      content = (
        <>
          {checkbox('reduceMotion', 'Reduce slide transition motion')}
          <p>Applies to transition previews and slide shows.</p>
        </>
      );
      break;
    case 'Advanced':
      content = checkbox('smartGuides', 'Use smart guides to snap objects into alignment');
      break;
    case 'Customize Ribbon':
      content = (
        <>
          {checkbox('ribbonCollapsed', 'Collapse the Ribbon by default')}
          <fieldset className="options-checklist">
            <legend>Main Tabs</legend>
            {mainTabs.map((tab) => (
              <label key={tab} className="options-check">
                <input
                  type="checkbox"
                  disabled={!customRibbonTabs.includes(tab)}
                  checked={!draft.hiddenTabs.includes(tab)}
                  onChange={(event) =>
                    change({
                      hiddenTabs: event.target.checked
                        ? draft.hiddenTabs.filter((hidden) => hidden !== tab)
                        : [...draft.hiddenTabs, tab],
                    })
                  }
                />
                {tab}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="button"
            onClick={() => change({ hiddenTabs: [], ribbonCollapsed: false })}
          >
            Reset Ribbon
          </button>
        </>
      );
      break;
    case 'Quick Access Toolbar':
      content = (
        <>
          {checkbox('showQuickAccess', 'Show Quick Access Toolbar')}
          <fieldset className="options-checklist" disabled={!draft.showQuickAccess}>
            <legend>Toolbar Commands</legend>
            {quickCommands.map((command) => (
              <label key={command} className="options-check">
                <input
                  type="checkbox"
                  checked={draft.quickCommands.includes(command)}
                  onChange={(event) =>
                    change({
                      quickCommands: event.target.checked
                        ? [...draft.quickCommands, command]
                        : draft.quickCommands.filter((item) => item !== command),
                    })
                  }
                />
                {command}
              </label>
            ))}
          </fieldset>
        </>
      );
      break;
    case 'Add-ins':
      content = <p>Microsoft 365 add-ins are unavailable in Forma.</p>;
      break;
    case 'Trust Center':
      content = (
        <>
          {checkbox('allowSlideShowLinks', 'Allow web links to open during slide shows')}
          <p>Forma processes your presentations in this browser.</p>
        </>
      );
      break;
  }
  return (
    <dialog
      className="modal insert-dialog forma-options"
      aria-labelledby={id}
      ref={root}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <header className="transition-gallery-header">
        <h2 id={id}>Forma Options</h2>
        <button className="tool" type="button" aria-label="Close Options" onClick={dismiss}>
          <X size={18} />
        </button>
      </header>
      <div className="options-workspace">
        <nav aria-label="Options categories" className="options-navigation">
          {sections.map(([name, Icon]) => (
            <button
              key={name}
              type="button"
              aria-current={section === name ? 'true' : undefined}
              onClick={() => setSection(name)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{name}</span>
              <ChevronRight className="options-nav-chevron" size={13} aria-hidden="true" />
            </button>
          ))}
        </nav>
        <section className="options-content" key={section} aria-label={section}>
          <h3>{section}</h3>
          {content}
        </section>
      </div>
      <footer className="options-footer">
        <button className="button" type="button" onClick={dismiss}>
          Cancel
        </button>
        <button
          className="button primary"
          type="button"
          onClick={() => {
            apply({ ...draft, author: draft.author.trim() || defaults.author });
            dismiss();
          }}
        >
          OK
        </button>
      </footer>
    </dialog>
  );
}
