import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  adjustPictureCrop,
  pictureCropPatch,
  pictureSourceRect,
  rotatePoint,
  type CropDraft,
  type CropDrag,
  type CropHandle,
  type PictureHandle,
  type PictureRect,
} from './pictureGeometry';
import type { Asset, SlideObject } from './types';

const handles: [CropHandle, string][] = [
  ['nw', 'top left'],
  ['n', 'top edge'],
  ['ne', 'top right'],
  ['e', 'right edge'],
  ['se', 'bottom right'],
  ['s', 'bottom edge'],
  ['sw', 'bottom left'],
  ['w', 'left edge'],
];
const rectStyle = (r: PictureRect): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });
const pictureHandles = handles.filter(([handle]) => handle.length === 2) as [PictureHandle, string][];

export function PictureCrop({
  object,
  asset,
  scale,
  slideWidth,
  slideHeight,
  onFinish,
}: {
  object: SlideObject;
  asset: Asset;
  scale: number;
  slideWidth: number;
  slideHeight: number;
  onFinish: (patch?: Partial<SlideObject>) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<CropDraft>(() => ({
    frame: { x: 0, y: 0, w: object.w, h: object.h },
    source: pictureSourceRect(object),
  }));
  const initial = useRef(draft);
  const current = useRef(draft);
  const gesture = useRef<{
    id: number;
    handle: CropDrag;
    x: number;
    y: number;
    before: CropDraft;
  } | null>(null);
  const finish = useRef<(apply: boolean) => void>(() => {});
  finish.current = (apply) => {
    const patch =
      apply && current.current !== initial.current ? pictureCropPatch(object, current.current) : undefined;
    onFinish(patch);
  };

  function update(next: CropDraft) {
    current.current = next;
    setDraft(next);
  }

  useLayoutEffect(() => {
    host.current?.focus({ preventScroll: true });
    const outside = (event: globalThis.PointerEvent) => {
      if (event.button === 0 && !host.current?.contains(event.target as Node)) finish.current(true);
    };
    const key = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' &&
        (event.key !== 'Enter' || (event.target as Element).closest('.crop-actions'))
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish.current(event.key === 'Enter');
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', key, true);
    };
  }, []);

  function begin(event: PointerEvent<HTMLElement>, handle: CropDrag) {
    if (event.button !== 0 || gesture.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      id: event.pointerId,
      handle,
      x: event.clientX,
      y: event.clientY,
      before: current.current,
    };
  }

  function end(event: PointerEvent, cancel: boolean) {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    if (cancel) update(active.before);
  }

  const { frame, source } = draft;
  const flip = `scale(${object.flipH ? -1 : 1}, ${object.flipV ? -1 : 1})`;
  function handleButton(handle: CropHandle, label: string, picture?: PictureHandle) {
    const drag: CropDrag = picture ? `picture-${picture}` : handle;
    return (
      <button
        key={handle}
        type="button"
        className={`${picture ? 'crop-picture-handle' : 'crop-handle'} crop-${handle}`}
        aria-label={`${picture ? 'Resize picture' : 'Crop'} ${label}`}
        onPointerDown={(event) => begin(event, drag)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          const x = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
          const y = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
          if (!x && !y) return;
          event.preventDefault();
          event.stopPropagation();
          update(adjustPictureCrop(current.current, drag, { x, y }));
        }}
      />
    );
  }
  return (
    <div
      ref={host}
      className="crop-mode"
      tabIndex={-1}
      role="group"
      aria-label="Picture crop editor"
      style={{ '--crop-unit': `${1 / scale}px` } as CSSProperties}
      onPointerMove={(event) => {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId) return;
        const offset = rotatePoint(
          { x: (event.clientX - active.x) / scale, y: (event.clientY - active.y) / scale },
          -object.rotation,
        );
        if (offset.x || offset.y || current.current !== active.before)
          update(
            offset.x || offset.y ? adjustPictureCrop(active.before, active.handle, offset) : active.before,
          );
      }}
      onPointerUp={(event) => end(event, false)}
      onPointerCancel={(event) => end(event, true)}
      onLostPointerCapture={(event) => end(event, true)}
    >
      <div className="crop-surface">
        <div
          className="crop-slide-size"
          style={{ width: slideWidth, height: slideHeight, transform: `scale(${scale})` }}
        >
          <div
            className="crop-origin"
            style={{ ...rectStyle(object), transform: `rotate(${object.rotation}deg)` }}
          >
            <div className="crop-ghost" style={rectStyle(source)} onPointerDown={(e) => begin(e, 'move')}>
              <img src={asset.url} alt="" draggable={false} style={{ transform: flip }} />
            </div>
            <div
              className="crop-frame"
              style={rectStyle(frame)}
              data-testid="crop-frame"
              onPointerDown={(event) => begin(event, 'move')}
            >
              <div className="crop-window">
                <img
                  src={asset.url}
                  alt=""
                  draggable={false}
                  style={{
                    ...rectStyle({ ...source, x: source.x - frame.x, y: source.y - frame.y }),
                    transform: flip,
                  }}
                />
              </div>
              {handles.map(([handle, label]) => handleButton(handle, label))}
            </div>
            <div className="crop-picture-bounds" style={rectStyle(source)}>
              {pictureHandles.map(([handle, label]) => handleButton(handle, label, handle))}
            </div>
          </div>
        </div>
      </div>
      <div className="crop-actions">
        <button className="button" onClick={() => update({ source, frame: { ...source } })}>
          Reset crop
        </button>
        <button className="button" onClick={() => finish.current(false)}>
          Cancel crop
        </button>
        <button className="button primary" onClick={() => finish.current(true)}>
          Done
        </button>
      </div>
    </div>
  );
}
