import { slideBackground } from './slideEditing';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import { Box, Lock, Minus, Plus, RotateCw } from 'lucide-react';
import {
  modelDisplayFrame,
  modelPreviewKey,
  modelZoomFactor,
  type Asset,
  type Point,
  type Slide,
  type SlideObject,
} from './types';
import { ModelView } from './ModelView';
import { ModelThumbnail } from './ModelThumbnail';
import { RotationGizmo } from './RotationGizmo';
import { combinedBounds, dragAlignment, editable, objectBounds, type Axis } from './layout';
import { PictureCrop } from './PictureCrop';
import { xrayObjects } from './xray';
import { ChartPreview, MediaPreview, TablePreview } from './InsertPreview';
import { rotatePoint, pictureSourceRect } from './pictureGeometry';
import {
  adjustShape,
  adjustmentHandles,
  cornerRadius,
  frameHandles,
  isLine,
  isPolygon,
  polygonPoints,
  connectorFrame,
  linePoints,
  resizeFrame,
  resizeLine,
  type FrameHandle,
  type ShapeAdjustment,
} from './shapeGeometry';

import { TextDisplay } from './TextDisplay';
import {
  restoreTextSelection,
  textSelectionAt,
  type TextEditSession,
  type TextSelection,
} from './textSelection';
import type { ReactNode } from 'react';
import type { SlideAnimation } from './animations';

import {
  eraserRadius,
  localInkPoints,
  smoothInk,
  type DrawTool,
  type EraserMode,
  type InkStyle,
} from './ink';
export type EditRequest = { id: string; token: number; kind: 'text' | 'crop'; selection?: TextSelection };

type DragMode =
  | FrameHandle
  | 'move'
  | 'rotate'
  | 'line-start'
  | 'line-end'
  | ShapeAdjustment
  | { ring: number; point: number };

export function ObjectContent({
  o,
  assets,
  thumbnail,
  orbit,
  onPose,
  onPosePreview,
  onZoom,
  playing,
  lineEdit,
  inkReplay,
}: {
  o: SlideObject;
  assets: Record<string, Asset>;
  thumbnail?: boolean;
  orbit?: boolean;
  onPose?: (pose: Pose) => void;
  onPosePreview?: (pose: Pose | null) => void;
  onZoom?: (direction: number) => void;
  playing?: boolean;
  lineEdit?: { scale: number; selected: boolean };
  inkReplay?: { token: number; delay: number };
}) {
  if (o.kind === 'text') return <TextDisplay object={o} />;
  if (o.table) return <TablePreview data={o.table} width={o.w} height={o.h} />;
  if (o.chart) return <ChartPreview data={o.chart} width={o.w} height={o.h} />;
  if (o.kind === 'media') return <MediaPreview object={o} assets={assets} playing={playing} />;
  if (o.kind === 'image') {
    const asset = assets[o.asset || ''];
    if (!asset) return <div className="placeholder">Missing image</div>;
    const source = pictureSourceRect(o);
    return (
      <div
        className="image-crop"
        style={{
          opacity: o.pictureOpacity,
          borderRadius:
            o.pictureShape === 'ellipse'
              ? '50%'
              : o.pictureShape === 'roundRect'
                ? cornerRadius(o)
                : undefined,
          clipPath: o.pictureShape === 'triangle' ? 'polygon(50% 0%, 100% 100%, 0% 100%)' : undefined,
        }}
      >
        <img
          draggable={false}
          alt={o.altText ?? o.name}
          src={asset.url}
          style={{
            width: `${(100 * source.w) / o.w}%`,
            height: `${(100 * source.h) / o.h}%`,
            left: `${(100 * source.x) / o.w}%`,
            top: `${(100 * source.y) / o.h}%`,
            transform: `scale(${o.flipH ? -1 : 1}, ${o.flipV ? -1 : 1})`,
            filter: o.pictureBrightness ? `brightness(${Math.max(0, 1 + o.pictureBrightness)})` : undefined,
          }}
        />
      </div>
    );
  }
  if (o.kind === 'model') {
    const asset = assets[o.asset || ''];
    const poster = assets[o.preview || '']?.url;
    if (thumbnail && !o.locked && asset)
      return (
        <ModelThumbnail
          object={o}
          asset={asset}
          fallback={poster}
          posterIsCurrent={!!poster && o.modelPreviewKey === modelPreviewKey(o)}
        />
      );
    if ((thumbnail || o.locked) && poster)
      return <img draggable={false} src={poster} alt={o.altText ?? o.name} />;
    if (!thumbnail && !o.locked && asset)
      return (
        <ModelView
          object={o}
          asset={asset}
          onPose={orbit ? onPose : undefined}
          onPosePreview={onPosePreview}
          onZoom={onZoom}
        />
      );
    return (
      <div className="placeholder">
        <Box size={40} />
        <span>{o.locked ? 'Preserved 3D model' : '3D model'}</span>
      </div>
    );
  }
  if (o.kind === 'unsupported' && o.preview && assets[o.preview])
    return <img draggable={false} src={assets[o.preview].url} alt={o.altText ?? o.name} />;
  if (o.kind === 'unsupported')
    return (
      <div className="placeholder unsupported">
        <Lock size={20} />
        <span>{o.name}</span>
        <small>Preserved object</small>
      </div>
    );
  if (o.stroke) {
    const coords = localInkPoints({ ...o, stroke: o.stroke })
      .map(({ x, y }) => `${x},${y}`)
      .join(' ');
    return (
      <svg className="ink-art" viewBox={`0 0 ${o.w} ${o.h}`} aria-label={o.altText || o.name}>
        <polyline
          key={inkReplay?.token}
          className={inkReplay ? 'ink-replay-stroke' : undefined}
          pathLength={inkReplay ? 1 : undefined}
          style={inkReplay ? { animationDelay: `${inkReplay.delay}ms` } : undefined}
          points={coords}
          fill="none"
          stroke={o.stroke.color}
          strokeOpacity={o.stroke.opacity}
          strokeWidth={o.stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {lineEdit && (
          <polyline
            className="ink-hit-target"
            points={coords}
            fill="none"
            stroke="transparent"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={Math.max(o.stroke.width, 10 / lineEdit.scale)}
          />
        )}
      </svg>
    );
  }
  const points = polygonPoints(o);
  if (isLine(o) || points || o.customPaths) {
    const {
      color: stroke,
      width: strokeWidth,
      dash,
    } = o.outline ?? { color: o.geometry === 'line' ? '#6345bd' : 'none', width: 1, dash: 'solid' };
    const paint = {
      stroke,
      strokeWidth,
      strokeLinejoin: 'round' as const,
      strokeDasharray:
        dash === 'dash'
          ? `${strokeWidth * 4} ${strokeWidth * 3}`
          : dash === 'dot'
            ? `${strokeWidth} ${strokeWidth * 2}`
            : undefined,
    };
    const w = Math.max(o.w, 1),
      h = Math.max(o.h, 1);
    const [a, b] = linePoints(o);
    const line = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    return (
      <svg
        className="polygon-shape"
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden="true"
        style={{ overflow: 'visible', width: w, height: h }}
      >
        {o.customPaths ? (
          <path
            d={o.customPaths
              .map(
                (ring) =>
                  ring
                    .map(
                      ({ x, y }, i) =>
                        `${i ? 'L' : 'M'} ${(o.flipH ? 1 - x : x) * o.w} ${(o.flipV ? 1 - y : y) * o.h}`,
                    )
                    .join(' ') + ' Z',
              )
              .join(' ')}
            fill={o.fill || 'transparent'}
            fillRule="evenodd"
            {...paint}
          />
        ) : points ? (
          <polygon
            points={points.map(([x, y]) => `${o.flipH ? o.w - x : x},${o.flipV ? o.h - y : y}`).join(' ')}
            fill={o.fill || 'transparent'}
            {...paint}
          />
        ) : (
          <>
            {lineEdit?.selected && (
              <line
                className="line-selection"
                {...line}
                strokeWidth={strokeWidth + 4 / lineEdit.scale}
                strokeLinecap="round"
              />
            )}
            <line {...line} {...paint} pointerEvents="none" />
            {lineEdit && (
              <line
                className="line-hit-target"
                {...line}
                stroke="transparent"
                strokeWidth={Math.max(12 / lineEdit.scale, strokeWidth + 4 / lineEdit.scale)}
                strokeLinecap="round"
              />
            )}
          </>
        )}
      </svg>
    );
  }
  return null;
}
export function objectStyle(o: SlideObject): CSSProperties {
  const hasCustomPaint = isLine(o) || isPolygon(o) || !!o.customPaths;
  return {
    position: 'absolute',
    left: o.x,
    top: o.y,
    width: o.w,
    height: o.h,
    transform: `rotate(${o.rotation}deg)`,
    background: o.kind === 'text' || (o.kind === 'shape' && !hasCustomPaint) ? o.fill : undefined,
    borderRadius: o.geometry === 'ellipse' ? '50%' : o.geometry === 'roundRect' ? cornerRadius(o) : undefined,
    border:
      o.outline && o.outline.color !== 'transparent' && !(o.kind === 'shape' && hasCustomPaint)
        ? `${o.outline.width}px ${o.outline.dash === 'dash' ? 'dashed' : o.outline.dash === 'dot' ? 'dotted' : 'solid'} ${o.outline.color}`
        : undefined,
  };
}
export function SlidePreview({
  slide,
  width,
  height,
  assets,
  size = 160,
}: {
  slide: Slide;
  width: number;
  height: number;
  assets: Record<string, Asset>;
  size?: number;
}) {
  return (
    <div className="slide-preview" style={{ width: size, height: (size * height) / width }}>
      <div
        style={{
          width,
          height,
          transform: `scale(${size / width})`,
          transformOrigin: 'top left',
          background: slideBackground(slide, assets),
          position: 'relative',
        }}
      >
        {[...(slide.masterObjects ?? []), ...slide.objects]
          .filter((o) => !o.hidden)
          .map((o) => (
            <div key={o.id} className="slide-object" style={objectStyle(modelDisplayFrame(o))}>
              <ObjectContent o={o} assets={assets} thumbnail />
            </div>
          ))}
      </div>
    </div>
  );
}
type Pose = [number, number, number];

interface CanvasProps {
  slide: Slide;
  editPoints?: string;
  inkReplay?: number;
  width: number;
  height: number;
  scale: number;
  pan: Point;
  onCreateText: (point: Point) => void;
  onEditData: (id: string) => void;
  assets: Record<string, Asset>;
  selected: string | null;
  selection: string[];
  onSelect: (id: string | null) => void;
  onPick: (id: string, extend: boolean) => boolean | void;
  onPatch: (id: string, patch: Partial<SlideObject>) => void;
  onMoveGroup: (ids: string[], delta: Point) => void;
  onMenu: (event: ReactMouseEvent, objectId?: string) => void;
  orbit: boolean;
  onModelZoom: (id: string, direction?: number) => void;
  drawTool: DrawTool;
  ink: InkStyle;
  eraser: EraserMode;
  onInk: (points: Point[]) => void;
  onErase: (points: Point[]) => void;
  onLasso: (points: Point[], extend: boolean) => void;
  showGrid: boolean;
  showGuides: boolean;
  showRuler: boolean;
  smartGuides: boolean;
  dragAxis?: Axis;
  spellCheck: boolean;
  editRequest: EditRequest | null;
  textEditor: RefObject<TextEditSession | null>;
  overlay?: ReactNode;
  previewing?: boolean;
  xrayEnabled: boolean;
  annotation?: (animation: SlideAnimation) => void;
}

export function Canvas({
  slide,
  editPoints,
  inkReplay,
  width,
  height,
  scale,
  pan,
  onCreateText,
  onEditData,
  assets,
  selected,
  selection,
  onSelect,
  onPick,
  onPatch,
  onMoveGroup,
  onMenu,
  orbit,
  onModelZoom,
  drawTool,
  ink,
  eraser,
  onInk,
  onErase,
  onLasso,
  showGrid,
  showGuides,
  showRuler,
  smartGuides,
  dragAxis,
  editRequest,
  textEditor,
  spellCheck,
  overlay,
  previewing,
  xrayEnabled,
  annotation,
}: CanvasProps) {
  const [draft, setDraft] = useState<SlideObject | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const initialTextSelection = useRef<TextSelection | undefined>(undefined);
  const [cropping, setCropping] = useState<string | null>(null);
  const [lastEdit, setLastEdit] = useState<number | undefined>();
  const [delta, setDelta] = useState<Point | null>(null);
  const [ringPose, setRingPose] = useState<Pose | null>(null);
  const [freePose, setFreePose] = useState<Pose | null>(null);
  const [inkDraft, setInkDraft] = useState<Point[]>([]);
  const [alignment, setAlignment] = useState<ReturnType<typeof dragAlignment>>();
  const [xray, setXray] = useState<{ key: 'Control' | 'Shift'; depth: number }>();
  const root = useRef<HTMLDivElement>(null);
  const stroke = useRef<{ pointer: number; points: Point[]; extend: boolean } | null>(null);

  if (editRequest && editRequest.token !== lastEdit) {
    setLastEdit(editRequest.token);
    initialTextSelection.current = editRequest.selection;
    setEditing(editRequest.kind === 'text' ? editRequest.id : null);
    setCropping(editRequest.kind === 'crop' ? editRequest.id : null);
  }

  const cropObject =
    drawTool === 'select' &&
    cropping &&
    slide.objects.find(
      (o) => o.id === cropping && o.kind === 'image' && editable(o) && o.asset && assets[o.asset],
    );
  const canXray = xrayEnabled && drawTool === 'select' && !editing && !cropObject && !overlay;
  useEffect(() => {
    if (!canXray) return;
    const taps: Record<'Control' | 'Shift', number> = { Control: -Infinity, Shift: -Infinity };
    let pressed: { key: 'Control' | 'Shift'; time: number; tap: boolean } | undefined;
    const reset = () => {
      pressed = undefined;
      taps.Control = taps.Shift = -Infinity;
      setXray(undefined);
    };
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const { key, timeStamp } = event;
      if (key === 'Escape') {
        reset();
        return;
      }
      if (
        (key !== 'Control' && key !== 'Shift') ||
        event.altKey ||
        event.metaKey ||
        document.querySelector('dialog[open], .modal-backdrop') ||
        (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable], .context-menu'))
      ) {
        if (pressed) pressed.tap = false;
        taps.Control = taps.Shift = -Infinity;
        return;
      }
      if (pressed) return;
      const twice = timeStamp - taps[key] < 350;
      pressed = { key, time: timeStamp, tap: !twice };
      taps[key] = -Infinity;
      if (twice || key === 'Control') setXray({ key, depth: twice ? 2 : 1 });
    };
    const up = (event: KeyboardEvent) => {
      if (pressed?.key !== event.key) return;
      if (pressed.tap && event.timeStamp - pressed.time < 280) taps[pressed.key] = event.timeStamp;
      pressed = undefined;
      setXray(undefined);
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, [canXray]);
  const xrayDepth = canXray ? xray?.depth : undefined;
  const dimmed = useMemo(
    () => (xrayDepth ? xrayObjects(slide.objects, xrayDepth) : undefined),
    [slide.objects, xrayDepth],
  );
  const rotationModel =
    orbit && drawTool === 'select' && selection.length === 1
      ? slide.objects.find((o) => o.id === selected && o.kind === 'model' && editable(o))
      : undefined;
  const rotationId = rotationModel?.id;
  const zoom = rotationModel?.modelZoom ?? 100;
  function changeModelZoom(direction?: number) {
    if (rotationId) onModelZoom(rotationId, direction);
  }

  function localPoint(e: { clientX: number; clientY: number }, clip = false): Point {
    const rect = root.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale,
      y = (e.clientY - rect.top) / scale;
    return clip ? { x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) } : { x, y };
  }

  function drag(e: ReactPointerEvent, o: SlideObject, mode: DragMode) {
    if (e.button !== 0 || drawTool !== 'select') return;
    e.stopPropagation();
    const extendOnClick = e.shiftKey && xray?.key !== 'Shift' && mode === 'move';
    const group =
      mode === 'move'
        ? selection.length > 1 && selection.includes(o.id)
          ? selection
          : o.groupId
            ? slide.objects.filter((item) => item.groupId === o.groupId && editable(item)).map(({ id }) => id)
            : []
        : [];
    if (!extendOnClick && (!group.length || !selection.includes(o.id)) && onPick(o.id, false)) return;
    if (!editable(o) || editing === o.id || rotationModel?.id === o.id || o.connector) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    const start = localPoint(e);
    const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    const angleAt = (point: Point) => Math.atan2(point.y - center.y, point.x - center.x);
    let result = { ...o };
    let moved = false;
    let lockedAxis: keyof Point | undefined;
    let groupDelta: Point | null = null;
    const pointer = e.pointerId;
    const movingIds = group.length ? group : [o.id];
    const movingBounds = combinedBounds(
      slide.objects.filter((item) => movingIds.includes(item.id)).map(objectBounds),
    );
    const snapTargets = slide.objects
      .filter((item) => !item.hidden && !movingIds.includes(item.id))
      .map(objectBounds);

    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      if (!moved) {
        if (Math.hypot(event.clientX - e.clientX, event.clientY - e.clientY) < 2) return;
        moved = true;
        if (extendOnClick && !selection.includes(o.id) && onPick(o.id, false)) return;
      }
      const point = localPoint(event),
        dx = point.x - start.x,
        dy = point.y - start.y;
      let offset = { x: dx, y: dy };
      if (mode === 'move') {
        lockedAxis =
          dragAxis ??
          (event.shiftKey && xray?.key !== 'Shift'
            ? (lockedAxis ?? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'))
            : undefined);
        if (lockedAxis === 'x') offset.y = 0;
        if (lockedAxis === 'y') offset.x = 0;
        if (smartGuides && !event.altKey && !event.metaKey) {
          const snap = dragAlignment(
            { ...movingBounds, x: movingBounds.x + offset.x, y: movingBounds.y + offset.y },
            snapTargets,
            6 / scale,
            { x: 0, y: 0, width, height },
            lockedAxis,
          );
          offset.x += snap.delta.x;
          offset.y += snap.delta.y;
          setAlignment(snap);
        } else setAlignment(undefined);
      }
      if (group.length) {
        groupDelta = offset;
        setDelta(groupDelta);
        return;
      }
      result = { ...o };
      if (mode === 'rotate') {
        result.rotation = o.rotation + ((angleAt(point) - angleAt(start)) * 180) / Math.PI;
        if (event.shiftKey) result.rotation = Math.round(result.rotation / 15) * 15;
      } else if (mode === 'move') {
        result.x = o.x + offset.x;
        result.y = o.y + offset.y;
      } else if (typeof mode !== 'string' && 'ring' in mode && o.customPaths) {
        const local = rotatePoint(offset, -o.rotation);
        const original = o.customPaths[mode.ring][mode.point];
        result.customPaths = o.customPaths.map((points, index) =>
          index !== mode.ring
            ? points
            : points.map((point, index) =>
                index !== mode.point
                  ? point
                  : {
                      x: original.x + ((o.flipH ? -1 : 1) * local.x) / o.w,
                      y: original.y + ((o.flipV ? -1 : 1) * local.y) / o.h,
                    },
              ),
        );
      } else if (typeof mode !== 'string' && 'guide' in mode) {
        const adjustments = adjustShape(o, mode, offset);
        if (adjustments[mode.guide] !== mode.value) result.adjustments = adjustments;
      } else if (mode === 'line-start' || mode === 'line-end') {
        Object.assign(
          result,
          resizeLine(o, mode === 'line-start' ? 0 : 1, offset, event.altKey || event.ctrlKey, event.shiftKey),
        );
      } else if (typeof mode === 'string') {
        Object.assign(result, resizeFrame(o, mode, offset, event.altKey || event.ctrlKey, event.shiftKey));
      }
      setDraft(result);
    };

    const endDrag = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('keydown', cancel, true);
      setDraft(null);
      setDelta(null);
      setAlignment(undefined);
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      endDrag();
    };
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      endDrag();
      if (event.type !== 'pointerup') return;
      if (extendOnClick && !moved) {
        onPick(o.id, true);
        return;
      }
      if (groupDelta) {
        if (groupDelta.x || groupDelta.y) onMoveGroup(group, groupDelta);
        return;
      }
      const patch: Partial<SlideObject> = {};
      for (const key of ['x', 'y', 'w', 'h', 'rotation'] as const) {
        const value = Math.round(result[key] * 100) / 100;
        if (value !== Math.round(o[key] * 100) / 100) patch[key] = value;
      }
      for (const key of ['flipH', 'flipV'] as const) {
        if (!!result[key] !== !!o[key]) patch[key] = result[key];
      }
      if (result.customPaths !== o.customPaths) patch.customPaths = result.customPaths;
      if (result.adjustments !== o.adjustments) patch.adjustments = result.adjustments;
      if (Object.keys(patch).length) onPatch(o.id, patch);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('keydown', cancel, true);
  }

  const workspace = combinedBounds([{ x: 0, y: 0, width, height }, ...slide.objects.map(objectBounds)]);
  let animationStep = 0;
  const objectSteps = new Map<string, { step: number; animation: SlideAnimation }[]>();
  if (annotation && !overlay)
    for (const animation of slide.animations ?? []) {
      if (animation.start === 'click' && !animation.trigger) animationStep++;
      const marks = objectSteps.get(animation.target) ?? [];
      marks.push({ step: animationStep, animation });
      objectSteps.set(animation.target, marks);
    }
  return (
    <div
      className="canvas-workspace"
      style={{
        translate: `${pan.x}px ${pan.y}px`,
        paddingLeft: Math.max(0, -workspace.x * scale) + (showRuler ? 22 : 0),
        paddingTop: Math.max(0, -workspace.y * scale) + (showRuler ? 22 : 0),
        paddingRight: Math.max(0, (workspace.x + workspace.width - width) * scale),
        paddingBottom: Math.max(0, (workspace.y + workspace.height - height) * scale),
      }}
    >
      <div className="canvas-shell" style={{ width: width * scale, height: height * scale }}>
        {!!dimmed?.size && (
          <span className="xray-status" role="status">
            X-ray · {xrayDepth === 2 ? '2 layers' : '1 layer'}
          </span>
        )}
        {showRuler &&
          (['horizontal', 'vertical'] as const).map((axis) => {
            const length = axis === 'horizontal' ? width : height;
            const step = 96 * Math.max(1, Math.ceil(30 / (96 * scale)));
            return (
              <div
                aria-hidden="true"
                className={`canvas-ruler ${axis}`}
                key={axis}
                style={{
                  backgroundSize:
                    axis === 'horizontal' ? `${(step * scale) / 8}px 5px` : `5px ${(step * scale) / 8}px`,
                }}
              >
                {Array.from({ length: Math.floor(length / step) + 1 }, (_, i) => (
                  <span
                    key={i}
                    style={axis === 'horizontal' ? { left: i * step * scale } : { top: i * step * scale }}
                  >
                    {(i * step) / 96}
                  </span>
                ))}
              </div>
            );
          })}
        <div
          className="canvas-surface"
          inert={!!overlay}
          style={{ visibility: previewing ? 'hidden' : undefined }}
        >
          <div
            ref={root}
            data-testid="slide-canvas"
            tabIndex={0}
            aria-label="Slide canvas"
            className={`slide-canvas draw-${drawTool}`}
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              background: slideBackground(slide, assets),
            }}
            onContextMenuCapture={(event) => {
              if (!xrayDepth || !event.ctrlKey) return;
              event.preventDefault();
              event.stopPropagation();
            }}
            onContextMenu={(e) => {
              if (!(e.target as HTMLElement).closest('textarea, [contenteditable]')) onMenu(e);
            }}
            onDoubleClick={(event) => {
              if (drawTool === 'select' && event.target === event.currentTarget)
                onCreateText(localPoint(event, true));
            }}
            onKeyDown={(e) => {
              if (
                e.target !== e.currentTarget ||
                !(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))
              )
                return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const event = new MouseEvent('contextmenu', {
                bubbles: true,
                clientX: rect.left + 20,
                clientY: rect.top + 20,
              });
              e.currentTarget.dispatchEvent(event);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0 || !event.isPrimary) return;
              if (
                editing &&
                document.activeElement instanceof HTMLElement &&
                document.activeElement.isContentEditable
              )
                document.activeElement.blur();
              setEditing(null);
              event.currentTarget.focus({ preventScroll: true });
              if (drawTool === 'select') {
                onSelect(null);
                return;
              }
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              const points = [localPoint(event, true)];
              stroke.current = { pointer: event.pointerId, points, extend: event.shiftKey };
              setInkDraft(points);
            }}
            onPointerMove={(event) => {
              const session = stroke.current;
              if (!session || session.pointer !== event.pointerId) return;
              const point = localPoint(event, true),
                last = session.points.at(-1)!;
              if (Math.hypot(point.x - last.x, point.y - last.y) < Math.max(1, 1.25 / scale)) return;
              session.points.push(point);
              setInkDraft([...session.points]);
            }}
            onPointerUp={(event) => {
              const session = stroke.current;
              if (session?.pointer !== event.pointerId) return;
              stroke.current = null;
              setInkDraft([]);
              const tail = localPoint(event, true),
                last = session.points.at(-1)!;
              if (tail.x !== last.x || tail.y !== last.y) session.points.push(tail);
              if (drawTool === 'lasso') onLasso(session.points, session.extend);
              if (drawTool === 'eraser') onErase(session.points);
              if (drawTool === 'pen') {
                const [first] = session.points;
                if (event.shiftKey && session.points.length > 1) {
                  const dx = tail.x - first.x,
                    dy = tail.y - first.y;
                  const angle = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4;
                  const length = Math.hypot(dx, dy);
                  onInk([
                    first,
                    { x: first.x + Math.cos(angle) * length, y: first.y + Math.sin(angle) * length },
                  ]);
                } else
                  onInk(
                    smoothInk(
                      session.points.length === 1 ? [first, { ...first, x: first.x + 0.02 }] : session.points,
                    ),
                  );
              }
            }}
            onLostPointerCapture={(event) => {
              if (stroke.current?.pointer !== event.pointerId) return;
              stroke.current = null;
              setInkDraft([]);
            }}
          >
            {slide.masterObjects?.map((o) => (
              <div
                key={o.id}
                className="slide-object"
                style={{ ...objectStyle(o), pointerEvents: 'none' }}
                aria-hidden="true"
              >
                <ObjectContent o={o} assets={assets} />
              </div>
            ))}
            {slide.objects
              .filter((object) => !object.hidden)
              .map((original, visibleIndex) => {
                const active = selection.includes(original.id) && drawTool === 'select';
                let o = draft?.id === original.id ? draft : original;
                if (delta && active) o = { ...o, x: o.x + delta.x, y: o.y + delta.y };
                if (o.connector && (draft || delta)) {
                  const target = (id: string) => {
                    const item = draft?.id === id ? draft : slide.objects.find((object) => object.id === id);
                    return delta && item && selection.includes(id)
                      ? { ...item, x: item.x + delta.x, y: item.y + delta.y }
                      : item;
                  };
                  const from = target(o.connector.from),
                    to = target(o.connector.to);
                  if (from && to) o = { ...o, ...connectorFrame(from, to).frame };
                }
                if (rotationModel?.id === o.id && ringPose) o = { ...o, pose: ringPose };
                const isCropping = !!cropObject && cropObject.id === o.id;
                const line = isLine(o);
                return (
                  <div
                    key={o.id}
                    data-testid={`object-${o.kind}`}
                    data-xray={dimmed?.has(o.id) || undefined}
                    inert={dimmed?.has(o.id)}
                    data-text-editable={(o.kind === 'text' && !o.slideNumber && editable(o)) || undefined}
                    data-ink={!!o.stroke}
                    data-vector-hit={line || isPolygon(o) || !!o.stroke || !!o.customPaths || undefined}
                    data-smaller-model={modelZoomFactor(o) < 1 && !!assets[o.asset || ''] ? true : undefined}
                    role="group"
                    tabIndex={active && o.id === selected ? 0 : -1}
                    aria-label={o.altText || o.name}
                    className={`slide-object ${active ? 'selected' : ''} ${o.locked ? 'locked' : ''}`}
                    style={{ ...objectStyle(o), visibility: isCropping ? 'hidden' : undefined }}
                    onContextMenu={(event) => {
                      if (
                        event.button !== 2 &&
                        (event.target as HTMLElement).closest('textarea, [contenteditable]')
                      )
                        return;
                      event.stopPropagation();
                      onMenu(event, o.id);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.target !== event.currentTarget ||
                        !(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
                      )
                        return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      event.currentTarget.dispatchEvent(
                        new MouseEvent('contextmenu', {
                          bubbles: true,
                          clientX: rect.left + 8,
                          clientY: rect.top + 8,
                        }),
                      );
                    }}
                    onPointerDown={(event) => {
                      if (
                        editing === o.id &&
                        event.button === 0 &&
                        !(event.target as Element).closest('button')
                      ) {
                        const editor = textEditor.current;
                        const content = event.currentTarget.querySelector<HTMLElement>('.inline-text');
                        if (editor?.id === o.id && content) {
                          event.preventDefault();
                          event.stopPropagation();
                          restoreTextSelection(
                            content,
                            textSelectionAt(content, event.clientX, event.clientY),
                          );
                        }
                        return;
                      }
                      drag(event, o, 'move');
                    }}
                    onDoubleClick={(event) => {
                      if (
                        drawTool !== 'select' ||
                        !editable(o) ||
                        (event.target as Element).closest('button, textarea, [contenteditable]')
                      )
                        return;
                      if (o.kind === 'text' && !o.slideNumber) {
                        const content = event.currentTarget.querySelector<HTMLElement>('.text-content');
                        initialTextSelection.current = content
                          ? textSelectionAt(content, event.clientX, event.clientY, true)
                          : undefined;
                        setEditing(o.id);
                      }
                      if (o.table || o.chart) onEditData(o.id);
                      if (o.kind === 'image' && o.asset && assets[o.asset]) setCropping(o.id);
                    }}
                  >
                    {editing === o.id ? (
                      <TextDisplay
                        object={o}
                        edit={{
                          spellCheck,
                          session: textEditor,
                          selection: initialTextSelection.current,
                          finish: (text) => {
                            if (text !== (o.text ?? '')) onPatch(o.id, { text });
                            setEditing(null);
                          },
                        }}
                      />
                    ) : (
                      <ObjectContent
                        o={o}
                        assets={assets}
                        orbit={rotationId === o.id}
                        onPose={(pose) => onPatch(o.id, { pose })}
                        onPosePreview={rotationId === o.id ? setFreePose : undefined}
                        onZoom={rotationId === o.id ? changeModelZoom : undefined}
                        inkReplay={
                          inkReplay !== undefined && o.stroke
                            ? {
                                token: inkReplay,
                                delay:
                                  slide.objects
                                    .slice(0, visibleIndex)
                                    .filter((item) => !item.hidden && item.stroke).length * 240,
                              }
                            : undefined
                        }
                        lineEdit={
                          (line || o.stroke) && drawTool === 'select'
                            ? { scale, selected: active }
                            : undefined
                        }
                      />
                    )}
                    {active && editable(o) && rotationId !== o.id && !line && (
                      <div
                        className="selection-outline"
                        style={{ borderWidth: 1.4 / scale, borderRadius: 'inherit' }}
                      />
                    )}
                    {active &&
                      editable(o) &&
                      selection.length === 1 &&
                      line &&
                      !o.connector &&
                      linePoints(o).map((point, i) => (
                        <button
                          type="button"
                          key={i}
                          aria-label={i ? 'Move line end' : 'Move line start'}
                          className="resize-handle line-endpoint"
                          style={{
                            left: point.x,
                            top: point.y,
                            width: 11 / scale,
                            height: 11 / scale,
                            borderWidth: 1.5 / scale,
                          }}
                          onPointerDown={(e) => drag(e, o, i ? 'line-end' : 'line-start')}
                        />
                      ))}
                    {active &&
                      editable(o) &&
                      selection.length === 1 &&
                      !rotationModel &&
                      editing !== o.id &&
                      !line && (
                        <>
                          <div
                            className="object-tag"
                            style={{ transform: `scale(${1 / scale})`, transformOrigin: 'bottom left' }}
                          >
                            {o.kind === 'model' && <Box size={12} />}
                            {o.kind === 'model' ? 'Native 3D' : o.kind}
                          </div>
                          {editPoints === o.id &&
                            o.customPaths?.flatMap((ring, path) =>
                              ring.map(({ x, y }, point) => (
                                <button
                                  type="button"
                                  key={`${path}-${point}`}
                                  className="shape-adjustment"
                                  aria-label={`Move shape point ${point + 1}`}
                                  style={{
                                    left: (o.flipH ? 1 - x : x) * o.w,
                                    top: (o.flipV ? 1 - y : y) * o.h,
                                    width: 10 / scale,
                                    height: 10 / scale,
                                  }}
                                  onPointerDown={(event) => drag(event, o, { ring: path, point })}
                                />
                              )),
                            )}
                          {editPoints !== o.id &&
                            frameHandles.map((handle) => (
                              <button
                                type="button"
                                aria-label={`Resize ${handle}`}
                                key={handle}
                                className={`resize-handle ${handle}`}
                                style={{ width: 8 / scale, height: 8 / scale, borderWidth: 1 / scale }}
                                onPointerDown={(e) => drag(e, o, handle)}
                              />
                            ))}
                          {adjustmentHandles(o).map((handle) => {
                            const x =
                              handle.point.x + (handle.axis === 'y' ? Math.min(o.w / 4, 10 / scale) : 0);
                            const y =
                              handle.point.y + (handle.axis === 'x' ? Math.min(o.h / 4, 10 / scale) : 0);
                            return (
                              <button
                                type="button"
                                className="shape-adjustment"
                                key={handle.guide}
                                aria-label={`Adjust ${handle.label.toLowerCase()}`}
                                title={handle.label}
                                style={{
                                  left: o.flipH ? o.w - x : x,
                                  top: o.flipV ? o.h - y : y,
                                  width: 9 / scale,
                                  height: 9 / scale,
                                  borderWidth: 1 / scale,
                                }}
                                onPointerDown={(e) => drag(e, o, handle)}
                              />
                            );
                          })}
                          <button
                            aria-label="Rotate frame"
                            className="rotate-handle"
                            onPointerDown={(e) => drag(e, o, 'rotate')}
                            style={{
                              transform: `translateX(-50%) scale(${1 / scale})`,
                              transformOrigin: 'bottom center',
                            }}
                          >
                            <RotateCw size={12} />
                          </button>
                        </>
                      )}
                  </div>
                );
              })}
            {showGrid && <div className="canvas-grid" />}
            {showGuides && <div className="guide vertical" style={{ left: width / 2 }} />}
            {showGuides && <div className="guide horizontal" style={{ top: height / 2 }} />}
            {alignment?.guides.map(({ axis, at, from, to, main }) => (
              <div
                key={`${axis}:${at}`}
                data-testid="smart-guide"
                className={`guide smart-guide snapped ${axis === 'x' ? 'vertical' : 'horizontal'}`}
                style={
                  axis === 'x'
                    ? { left: at, top: from, height: to - from, borderLeftWidth: (main ? 2.5 : 1.5) / scale }
                    : { top: at, left: from, width: to - from, borderTopWidth: (main ? 2.5 : 1.5) / scale }
                }
              />
            ))}
            {!!alignment?.spacing.length && (
              <svg className="spacing-guides" aria-hidden="true">
                {alignment.spacing.map(({ axis, at, from, to }) => {
                  const horizontal = axis === 'x';
                  const tick = 4 / scale;
                  const point = (along: number, across: number) =>
                    horizontal ? `${along} ${across}` : `${across} ${along}`;
                  return (
                    <g key={`${axis}:${at}:${from}:${to}`}>
                      <path
                        vectorEffect="non-scaling-stroke"
                        d={`M ${point(from, at)} L ${point(to, at)} M ${point(from, at - tick)} L ${point(from, at + tick)} M ${point(to, at - tick)} L ${point(to, at + tick)}`}
                      />
                      <text
                        x={horizontal ? (from + to) / 2 : at + tick * 2}
                        y={horizontal ? at - tick * 2 : (from + to) / 2}
                        textAnchor={horizontal ? 'middle' : 'start'}
                        dominantBaseline={horizontal ? 'auto' : 'middle'}
                        fontSize={12 / scale}
                        strokeWidth={3 / scale}
                      >
                        {Math.round((to - from) * 10) / 10}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
            {inkDraft.length > 0 && (
              <svg className="ink-draft" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
                {drawTool === 'eraser' ? (
                  <circle
                    className="ink-eraser-tip"
                    cx={inkDraft.at(-1)!.x}
                    cy={inkDraft.at(-1)!.y}
                    r={eraserRadius[eraser]}
                  />
                ) : drawTool === 'lasso' ? (
                  <polygon className="ink-lasso" points={inkDraft.map(({ x, y }) => `${x},${y}`).join(' ')} />
                ) : inkDraft.length === 1 ? (
                  <circle
                    cx={inkDraft[0].x}
                    cy={inkDraft[0].y}
                    r={ink.width / 2}
                    fill={ink.color}
                    fillOpacity={ink.opacity}
                  />
                ) : (
                  <polyline
                    points={smoothInk(inkDraft)
                      .map(({ x, y }) => `${x},${y}`)
                      .join(' ')}
                    stroke={ink.color}
                    strokeWidth={ink.width}
                    strokeOpacity={ink.opacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}
              </svg>
            )}
          </div>
        </div>
        {annotation &&
          [...objectSteps].map(([id, marks]) => {
            const o = slide.objects.find((item) => item.id === id);
            if (!o) return null;
            return (
              <div
                key={id}
                className="canvas-animation-steps"
                style={{ left: o.x * scale, top: o.y * scale }}
              >
                {marks.map(({ step, animation }) => (
                  <button
                    key={animation.id}
                    type="button"
                    onClick={() => annotation(animation)}
                    aria-label={`Select animation step ${animation.trigger ? 'on object click' : step || 'automatic'} for ${o.name}`}
                  >
                    {animation.trigger ? '⚡' : step || '–'}
                  </button>
                ))}
              </div>
            );
          })}
        {overlay}
        {!overlay && cropObject && (
          <PictureCrop
            key={cropObject.id}
            object={cropObject}
            asset={assets[cropObject.asset!]}
            scale={scale}
            slideWidth={width}
            slideHeight={height}
            onFinish={(change) => {
              setCropping(null);
              if (change) onPatch(cropObject.id, change);
            }}
          />
        )}
        {!overlay && rotationModel && (
          <>
            <RotationGizmo
              key={rotationModel.id}
              object={rotationModel}
              preview={ringPose || freePose}
              scale={scale}
              onPreview={setRingPose}
              onFinish={() => setRingPose(null)}
              onCommit={(pose) => onPatch(rotationModel.id, { pose })}
            />
            <div className="model-zoom" role="group" aria-label="3D view zoom">
              <button
                type="button"
                aria-label="Zoom out 3D view"
                title="Zoom out 3D view"
                disabled={zoom <= 50}
                onClick={() => changeModelZoom(-1)}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                aria-label={`Reset 3D view zoom (${zoom}%)`}
                title="Reset 3D view zoom"
                onClick={() => changeModelZoom()}
              >
                {zoom}%
              </button>
              <button
                type="button"
                aria-label="Zoom in 3D view"
                title="Zoom in 3D view"
                disabled={zoom >= 200}
                onClick={() => changeModelZoom(1)}
              >
                <Plus size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
