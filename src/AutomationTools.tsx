import { useId, useState } from 'react';
import { SlideToolsDialog } from './SlideTools';
import { runRecipe, slidesFromCsv } from './automation';
import type { Deck } from './types';

const examples = {
  replaceText: '{ "action": "replaceText", "find": "Old text", "replace": "New text" }',
  replaceFont: '{ "action": "replaceFont", "from": "Arial", "to": "Aptos" }',
  setBackground: '{ "action": "setBackground", "color": "#f5f0ff" }',
  setTransition: '{ "action": "setTransition", "effect": "fade", "duration": 1 }',
};

export function AutomationTools({
  deck,
  close,
  save,
  exportShows,
  busy,
}: {
  deck: Deck;
  close: () => void;
  save: (deck: Deck, message: string, slideIndex?: number) => void;
  exportShows: () => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<'csv' | 'recipe' | 'export'>('csv');
  const [csv, setCsv] = useState('');
  const [title, setTitle] = useState('{{Title}}');
  const [body, setBody] = useState('{{Body}}');
  const [recipe, setRecipe] = useState('[\n  ' + examples.setTransition + '\n]');
  const [error, setError] = useState('');
  const csvId = useId();
  async function load(file: File) {
    if (file.size > 1000000) {
      setError('Choose a CSV under 1 MB.');
      return;
    }
    try {
      setCsv(await file.text());
      setError('');
    } catch {
      setError('The CSV could not be opened.');
    }
  }
  return (
    <SlideToolsDialog title="Automation" onClose={close}>
      <form
        className="insert-form"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            setError('');
            if (mode === 'csv') {
              const result = slidesFromCsv(deck, csv, title, body);
              save(result.deck, `Generated ${result.count} slides.`, result.start);
            } else if (mode === 'recipe') {
              const result = runRecipe(deck, recipe);
              if (result.changed) save(result.deck, `Updated ${result.changed} slides.`);
              else setError('The recipe made no changes.');
            } else exportShows();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Automation failed.');
          }
        }}
      >
        <div className="slide-tool-presets">
          {(
            [
              ['csv', 'Generate Slides'],
              ['recipe', 'Run Recipe'],
              ['export', 'Batch Export'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setError('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'csv' && (
          <>
            <label>
              CSV file{' '}
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void load(file);
                }}
              />
            </label>
            <label htmlFor={csvId}>CSV data</label>
            <textarea
              id={csvId}
              rows={5}
              placeholder={'Title,Body\nOverview,Goals for this quarter'}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              required
            />
            <p>Use double braces around a column name to insert that value on each slide.</p>
            <label>
              Title template
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              Body template
              <textarea value={body} rows={3} onChange={(event) => setBody(event.target.value)} />
            </label>
          </>
        )}
        {mode === 'recipe' && (
          <>
            <div className="slide-tool-presets" aria-label="Recipe examples">
              {Object.entries(examples).map(([action, code]) => (
                <button
                  type="button"
                  key={action}
                  className="button"
                  onClick={() => setRecipe('[\n  ' + code + '\n]')}
                >
                  {action}
                </button>
              ))}
            </div>
            <label>
              Recipe JSON{' '}
              <textarea
                rows={8}
                className="recipe-source"
                value={recipe}
                onChange={(event) => setRecipe(event.target.value)}
                required
                spellCheck={false}
              />
            </label>
          </>
        )}
        {mode === 'export' &&
          (deck.customShows?.length ? (
            <ul className="automation-show-list">
              {deck.customShows.map(({ id, name }) => (
                <li key={id}>{name}</li>
              ))}
            </ul>
          ) : (
            <p>Save a show under Slide Show → Custom Slide Shows to export it here.</p>
          ))}
        {error && (
          <p role="alert" className="insert-error">
            {error}
          </p>
        )}
        <div className="insert-dialog-actions">
          <button
            type="submit"
            className="button primary"
            disabled={busy || (mode === 'export' && !deck.customShows?.length)}
          >
            {mode === 'csv'
              ? 'Generate Slides'
              : mode === 'recipe'
                ? 'Apply Recipe'
                : 'Download Shows as ZIP'}
          </button>
        </div>
      </form>
    </SlideToolsDialog>
  );
}
