import { Check, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { BackgroundPaint } from './types';
import { slideLayoutPreviews } from './RibbonPreviews';

export type SlideDialogKind = 'background' | 'layout' | 'zoom';

export function SlideDialog({
  kind,
  background,
  paint,
  presets,
  layouts,
  zoom,
  close,
  changeBackground,
  applyLayout,
  changeZoom,
  fit,
}: {
  kind: SlideDialogKind;
  background: string;
  paint?: BackgroundPaint;
  presets: ReadonlyArray<readonly [string, string]>;
  layouts: ReadonlyArray<readonly [string, string]>;
  zoom: number;
  close: () => void;
  changeBackground: (color: string, allSlides: boolean, paint?: BackgroundPaint, image?: File) => void;
  applyLayout: (layout: string) => void;
  changeZoom: (zoom: number) => void;
  fit: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [color, setColor] = useState(paint?.kind === 'gradient' ? paint.stops[0].color : background);
  const [kindOfFill, setFill] = useState(paint?.kind || 'solid');
  const [secondColor, setSecondColor] = useState(
    paint?.kind === 'gradient'
      ? paint.stops.at(-1)?.color || '#6554c0'
      : paint?.kind === 'pattern'
        ? paint.fore
        : '#6554c0',
  );
  const [angle, setAngle] = useState(paint?.kind === 'gradient' ? paint.angle : 0);
  const [pattern, setPattern] = useState(paint?.kind === 'pattern' ? paint.pattern : 'ltDnDiag');
  const [image, setImage] = useState<File>();
  function apply(allSlides: boolean) {
    const result: BackgroundPaint | undefined =
      kindOfFill === 'gradient'
        ? {
            kind: 'gradient',
            angle,
            stops:
              paint?.kind === 'gradient'
                ? paint.stops.map((stop, index) => ({
                    ...stop,
                    color: index === 0 ? color : index === paint.stops.length - 1 ? secondColor : stop.color,
                  }))
                : [
                    { color, position: 0 },
                    { color: secondColor, position: 1 },
                  ],
          }
        : kindOfFill === 'pattern'
          ? { kind: 'pattern', pattern, back: color, fore: secondColor }
          : kindOfFill === 'image' && paint?.kind === 'image'
            ? paint
            : undefined;
    changeBackground(color, allSlides, result, kindOfFill === 'image' ? image : undefined);
    close();
  }
  const incomplete = kindOfFill === 'image' && !image && paint?.kind !== 'image';
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  let title: string;
  let body: ReactNode;
  switch (kind) {
    case 'background':
      title = 'Format Background';
      body = (
        <form
          className="insert-form"
          onSubmit={(event) => {
            event.preventDefault();
            apply(false);
          }}
        >
          <div className="slide-tool-presets" aria-label="Fill type">
            {(
              [
                ['solid', 'Solid'],
                ['gradient', 'Gradient'],
                ['pattern', 'Pattern'],
                ['image', 'Picture'],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className="button"
                aria-pressed={kindOfFill === value}
                onClick={() => setFill(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {kindOfFill === 'solid' && (
            <div className="background-choices" aria-label="Background presets">
              {presets.map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  aria-label={`${label} background`}
                  aria-pressed={value === color}
                  className="background-swatch"
                  style={{ background: value }}
                  onClick={() => setColor(value)}
                >
                  {value === color && <Check size={14} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
          {kindOfFill !== 'image' && (
            <div className="insert-form-row">
              <label>
                {kindOfFill === 'solid' ? 'Color' : 'Base color'}
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
              </label>
              {kindOfFill !== 'solid' && (
                <label>
                  Second color
                  <input
                    type="color"
                    value={secondColor}
                    onChange={(event) => setSecondColor(event.target.value)}
                  />
                </label>
              )}
              {kindOfFill === 'gradient' && (
                <label>
                  Angle
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={angle}
                    onChange={(event) => setAngle(Number(event.target.value))}
                  />
                </label>
              )}
            </div>
          )}
          {kindOfFill === 'pattern' && (
            <label>
              Pattern
              <select value={pattern} onChange={(event) => setPattern(event.target.value as typeof pattern)}>
                <option value="ltDnDiag">Diagonal lines</option>
                <option value="ltHorz">Horizontal lines</option>
                <option value="ltVert">Vertical lines</option>
              </select>
            </label>
          )}
          {kindOfFill === 'image' && (
            <label>
              Picture file
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => setImage(event.target.files?.[0])}
              />
            </label>
          )}
          <div className="insert-dialog-actions">
            <button type="button" className="button" disabled={incomplete} onClick={() => apply(true)}>
              Apply to All
            </button>
            <button type="submit" className="button primary" disabled={incomplete}>
              Apply
            </button>
          </div>
        </form>
      );
      break;
    case 'layout':
      title = 'Slide Layout';
      body = (
        <div className="slide-layout-picker">
          {layouts.map(([layout, label]) => (
            <button
              key={layout}
              type="button"
              onClick={() => {
                applyLayout(layout);
                close();
              }}
            >
              <span aria-hidden="true">{slideLayoutPreviews[layout]}</span>
              {label}
            </button>
          ))}
        </div>
      );
      break;
    case 'zoom':
      title = 'Slide Zoom';
      body = (
        <form
          className="insert-form"
          onSubmit={(event) => {
            event.preventDefault();
            changeZoom(Number(new FormData(event.currentTarget).get('zoom')) / 100);
            close();
          }}
        >
          <label>
            Zoom (% of fit size){' '}
            <input
              type="number"
              name="zoom"
              required
              min="25"
              max="300"
              defaultValue={Math.round(zoom * 100)}
            />
          </label>
          <div className="insert-dialog-actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                fit();
                close();
              }}
            >
              Fit to Window
            </button>
            <button type="submit" className="button primary">
              Apply
            </button>
          </div>
        </form>
      );
      break;
  }
  return (
    <dialog
      ref={dialog}
      className="modal insert-dialog slide-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <button type="button" className="modal-close" aria-label="Close dialog" onClick={close}>
        <X size={18} />
      </button>
      <h2 id={id}>{title}</h2>
      {body}
    </dialog>
  );
}
