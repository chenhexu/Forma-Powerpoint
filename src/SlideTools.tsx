import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SlidePreview } from './Canvas';
import { selectedGaps, type Arrange } from './layout';
import type { Deck, Project, SlideObject, SlideTheme } from './types';

export function SlideToolsDialog({
  title,
  onClose,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog
      ref={dialog}
      className={`modal insert-dialog slide-tools-dialog${className ? ` ${className}` : ''}`}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button type="button" className="modal-close" aria-label="Close dialog" onClick={onClose}>
        <X size={18} />
      </button>
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>
  );
}

export function ObjectSpacing({
  objects,
  apply,
  close,
}: {
  objects: SlideObject[];
  apply: (direction: Arrange, gap?: number) => void;
  close: () => void;
}) {
  return (
    <SlideToolsDialog title="Object Spacing" onClose={close}>
      {(['horizontal', 'vertical'] as const).map((direction) => {
        const label = direction === 'horizontal' ? 'Horizontal' : 'Vertical';
        const gaps = selectedGaps(objects, direction === 'horizontal' ? 'x' : 'y');
        return (
          <form
            className="object-spacing insert-form"
            key={direction}
            onSubmit={(event) => {
              event.preventDefault();
              const gap = Number(new FormData(event.currentTarget).get('gap'));
              if (Number.isFinite(gap) && gap >= 0) apply(direction, gap);
            }}
          >
            <strong>{label}</strong>
            <output aria-label={`${label} distances`}>
              {gaps.map((gap) => `${Math.round(gap * 100) / 100} px`).join(' · ')}
            </output>
            <div className="insert-form-row">
              <label>
                {label} gap (px)
                <input required name="gap" type="number" min="0" step="any" disabled={gaps.length < 1} />
              </label>
              <button type="submit" className="button primary" disabled={gaps.length < 1}>
                Apply Gap
              </button>
              <button
                type="button"
                className="button"
                disabled={gaps.length < 2}
                onClick={() => apply(direction)}
              >
                Equalize
              </button>
            </div>
          </form>
        );
      })}
    </SlideToolsDialog>
  );
}

export function SlideSize({
  deck,
  close,
  save,
}: {
  deck: Deck;
  close: () => void;
  save: (width: number, height: number, fit: boolean) => void;
}) {
  const [size, setSize] = useState([deck.width / 96, deck.height / 96]);
  return (
    <SlideToolsDialog title="Slide Size" onClose={close}>
      <form
        className="insert-form"
        onSubmit={(event) => {
          event.preventDefault();
          save(size[0] * 96, size[1] * 96, new FormData(event.currentTarget).has('fit'));
          close();
        }}
      >
        <div className="slide-tool-presets">
          {(
            [
              ['Widescreen', 40 / 3, 7.5],
              ['Standard (4:3)', 10, 7.5],
              ['Portrait', 7.5, 10],
            ] as const
          ).map(([label, width, height]) => (
            <button key={label} type="button" className="button" onClick={() => setSize([width, height])}>
              {label}
            </button>
          ))}
        </div>
        <div className="insert-form-row">
          {['Width (inches)', 'Height (inches)'].map((label, i) => (
            <label key={label}>
              {label}
              <input
                type="number"
                required
                min="1"
                max="56"
                step="any"
                value={Number(size[i].toFixed(4))}
                onChange={(event) =>
                  setSize((old) => old.map((value, j) => (i === j ? Number(event.target.value) : value)))
                }
              />
            </label>
          ))}
        </div>
        <label className="insert-check">
          <input type="checkbox" name="fit" /> Scale object frames to fit
        </label>
        <div className="insert-dialog-actions">
          <button className="button primary" type="submit">
            Apply
          </button>
        </div>
      </form>
    </SlideToolsDialog>
  );
}

export function ThemeSettings({
  theme,
  close,
  save,
}: {
  theme?: SlideTheme;
  close: () => void;
  save: (theme: SlideTheme) => void;
}) {
  const base = theme ?? { heading: 'Aptos Display', body: 'Aptos', accent: '#6554c0' };
  return (
    <SlideToolsDialog title="Theme Fonts and Colors" onClose={close}>
      <form
        className="insert-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          save({
            heading: String(data.get('heading')).trim(),
            body: String(data.get('body')).trim(),
            accent: String(data.get('accent')),
          });
          close();
        }}
      >
        <label>
          Heading font
          <input name="heading" required defaultValue={base.heading} />
        </label>
        <label>
          Body font
          <input name="body" required defaultValue={base.body} />
        </label>
        <label>
          Accent color
          <input name="accent" type="color" defaultValue={base.accent} />
        </label>
        <div className="insert-dialog-actions">
          <button className="button primary" type="submit">
            Apply Theme
          </button>
        </div>
      </form>
    </SlideToolsDialog>
  );
}

export function ReuseSlides({
  project,
  close,
  load,
  insert,
  busy,
  notice,
}: {
  project: Project | null;
  close: () => void;
  load: (file: File) => void;
  insert: (positions: number[]) => void;
  busy: boolean;
  notice: string;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => setSelected([]), [project]);
  return (
    <SlideToolsDialog title="Reuse Slides" onClose={close}>
      <div className="insert-form">
        <label>
          Choose a PPTX
          <input
            type="file"
            accept=".pptx"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) load(file);
            }}
          />
        </label>
        {project && (
          <>
            <label className="insert-check">
              <input
                type="checkbox"
                disabled={busy}
                checked={selected.length === project.deck.slides.length}
                onChange={(event) =>
                  setSelected(event.target.checked ? project.deck.slides.map((_, index) => index) : [])
                }
              />{' '}
              Select all slides
            </label>
            <div className="reuse-slide-grid">
              {project.deck.slides.map((slide, index) => (
                <label key={slide.id}>
                  <SlidePreview
                    slide={slide}
                    width={project.deck.width}
                    height={project.deck.height}
                    assets={project.assets}
                    size={136}
                  />
                  <span>
                    <input
                      type="checkbox"
                      checked={selected.includes(index)}
                      disabled={busy}
                      onChange={(event) =>
                        setSelected((previous) =>
                          event.target.checked ? [...previous, index] : previous.filter((i) => i !== index),
                        )
                      }
                    />{' '}
                    Slide {index + 1}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="insert-dialog-actions">
          <button
            className="button primary"
            type="button"
            disabled={!selected.length || busy}
            onClick={() => insert([...selected].sort((a, b) => a - b))}
          >
            Insert Selected Slides
          </button>
        </div>
      </div>
    </SlideToolsDialog>
  );
}

export function SlideMaster({
  footer,
  hasLogo,
  close,
  save,
  busy,
  notice,
}: {
  footer: string;
  hasLogo: boolean;
  close: () => void;
  save: (footer: string, logo: File | undefined, removeLogo: boolean) => void;
  busy: boolean;
  notice: string;
}) {
  const [file, setFile] = useState<File>();
  return (
    <SlideToolsDialog title="Slide Master" onClose={close}>
      <form
        className="insert-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          save(String(form.get('footer')).trim(), file, form.has('remove-logo'));
        }}
      >
        <p>Slides with master graphics enabled inherit the shared logo and footer.</p>
        <label>
          Footer text
          <input name="footer" defaultValue={footer} maxLength={250} />
        </label>
        <label>
          {hasLogo ? 'Replace logo' : 'Logo'}
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </label>
        {hasLogo && (
          <label className="insert-check">
            <input name="remove-logo" type="checkbox" disabled={!!file} /> Remove existing logo
          </label>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="insert-dialog-actions">
          <button className="button primary" disabled={busy} type="submit">
            Apply to Master
          </button>
        </div>
      </form>
    </SlideToolsDialog>
  );
}
