import { useRef, useState } from 'react';
import { MathUtils, Vector3 } from 'three';
import { poseQuaternion, rotateOnModelAxis, type RotationAxis } from './model';
import type { Point, SlideObject } from './types';

type Pose = [number, number, number];
const radius = 64;
const ringSize = 168;
const minThickness = 0.22;
const axes = {
  X: { plane: [1, 2], color: '#b5284b', labelDirection: { x: 0.45, y: -0.89 } },
  Y: { plane: [2, 0], color: '#0d7758', labelDirection: { x: 0.64, y: 0.77 } },
  Z: { plane: [0, 1], color: '#265ab6', labelDirection: { x: 1, y: -0.13 } },
} as const;

function projectRing(axis: RotationAxis, pose: Pose, frame: number) {
  const orientation = poseQuaternion(pose);
  const frameAngle = MathUtils.degToRad(frame);
  const cos = Math.cos(frameAngle),
    sin = Math.sin(frameAngle);
  const project = (v: Vector3): Point => ({ x: v.x * cos + v.y * sin, y: v.x * sin - v.y * cos });
  const vector = (index: number) => new Vector3().setComponent(index, 1).applyQuaternion(orientation);
  const [a, b] = axes[axis].plane.map(vector);
  let u = project(a),
    v = project(b);
  const normal = new Vector3().crossVectors(a, b);

  // Give edge-on rings a small visible width so they can still be dragged.
  if (Math.abs(normal.z) < minThickness) {
    const n = project(normal);
    const length = Math.hypot(n.x, n.y);
    n.x /= length;
    n.y /= length;
    const t = { x: -n.y, y: n.x };
    const sign = normal.z < -1e-10 ? -1 : 1;
    const alongA = u.x * t.x + u.y * t.y,
      alongB = v.x * t.x + v.y * t.y;
    u = {
      x: t.x * alongA - n.x * alongB * minThickness * sign,
      y: t.y * alongA - n.y * alongB * minThickness * sign,
    };
    v = {
      x: t.x * alongB + n.x * alongA * minThickness * sign,
      y: t.y * alongB + n.y * alongA * minThickness * sign,
    };
  }

  const direction = axes[axis].labelDirection;
  const x = direction.x * u.x + direction.y * u.y,
    y = direction.x * v.x + direction.y * v.y;
  const length = Math.hypot(x, y);
  const label = {
    x: (radius * (u.x * x + v.x * y)) / length + 10 * direction.x,
    y: (radius * (u.y * x + v.y * y)) / length + 10 * direction.y,
  };
  return { u, v, label };
}

export function RotationGizmo({
  object,
  preview,
  scale,
  onPreview,
  onCommit,
  onFinish,
}: {
  object: SlideObject;
  preview: Pose | null;
  scale: number;
  onPreview: (pose: Pose) => void;
  onCommit: (pose: Pose) => void;
  onFinish: () => void;
}) {
  const size = Math.min(228, Math.max(88, Math.min(object.w, object.h) * scale * 0.84));
  const [active, setActive] = useState<{ axis: RotationAxis; angle: number } | null>(null);
  const drag = useRef<{
    pointer: number;
    axis: RotationAxis;
    start: Pose;
    projection: ReturnType<typeof projectRing>;
    last: number;
    sum: number;
    pose: Pose;
    moved: boolean;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  function angle(x: number, y: number, { u, v }: ReturnType<typeof projectRing>) {
    const rect = svg.current!.getBoundingClientRect();
    const dx = x - rect.left - rect.width / 2,
      dy = y - rect.top - rect.height / 2;
    const det = u.x * v.y - u.y * v.x;
    return Math.atan2((u.x * dy - u.y * dx) / det, (v.y * dx - v.x * dy) / det);
  }

  function finish(commit: boolean) {
    const gesture = drag.current;
    drag.current = null;
    setActive(null);
    onFinish();
    if (commit && gesture?.moved) onCommit(gesture.pose);
  }

  return (
    <div
      className="rotation-gizmo"
      style={{
        left: (object.x + object.w / 2) * scale,
        top: (object.y + object.h / 2) * scale,
        width: size,
        height: size,
      }}
    >
      <svg
        ref={svg}
        viewBox={`${-ringSize / 2} ${-ringSize / 2} ${ringSize} ${ringSize}`}
        aria-label="3D rotation rings"
      >
        {(Object.keys(axes) as RotationAxis[]).map((axis) => {
          const { color } = axes[axis];
          const projection = projectRing(axis, preview || object.pose || [0, 0, 0], object.rotation);
          const { u, v, label } = projection;
          const transform = `matrix(${u.x} ${u.y} ${v.x} ${v.y} 0 0)`;
          return (
            <g
              key={axis}
              role="button"
              tabIndex={0}
              aria-label={`Rotate around ${axis} axis`}
              className={`rotation-ring ${active?.axis === axis ? 'dragging' : ''}`}
              onPointerDown={(event) => {
                if (event.button !== 0 || drag.current) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.focus({ preventScroll: true });
                event.currentTarget.setPointerCapture(event.pointerId);
                const start = object.pose || [0, 0, 0];
                drag.current = {
                  pointer: event.pointerId,
                  axis,
                  start,
                  projection,
                  last: angle(event.clientX, event.clientY, projection),
                  sum: 0,
                  pose: start,
                  moved: false,
                };
                setActive({ axis, angle: 0 });
              }}
              onPointerMove={(event) => {
                const gesture = drag.current;
                if (!gesture || gesture.pointer !== event.pointerId || gesture.axis !== axis) return;
                const next = angle(event.clientX, event.clientY, gesture.projection);
                const step = next - gesture.last;
                gesture.sum += Math.atan2(Math.sin(step), Math.cos(step));
                gesture.last = next;
                const degrees = MathUtils.radToDeg(gesture.sum);
                const delta = event.shiftKey ? Math.round(degrees / 15) * 15 : degrees;
                gesture.moved = Math.abs(delta) > 0.001;
                gesture.pose = rotateOnModelAxis(gesture.start, axis, delta);
                setActive({ axis, angle: delta });
                onPreview(gesture.pose);
              }}
              onPointerUp={(event) => {
                if (drag.current?.pointer === event.pointerId) finish(true);
              }}
              onLostPointerCapture={(event) => {
                if (drag.current?.pointer === event.pointerId) finish(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && drag.current) {
                  event.stopPropagation();
                  finish(false);
                } else if (!drag.current && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
                  event.preventDefault();
                  event.stopPropagation();
                  const step = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 15 : 1);
                  onCommit(rotateOnModelAxis(object.pose || [0, 0, 0], axis, step));
                }
              }}
            >
              <circle className="ring-hit" r={radius} transform={transform} />
              <circle className="ring-track" r={radius} transform={transform} stroke={color} />
              <text
                className="ring-label"
                x={label.x}
                y={label.y}
                fill={color}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {axis}
              </text>
            </g>
          );
        })}
      </svg>
      {active && (
        <span className="rotation-angle">
          {active.axis} {Math.round(active.angle)}°
        </span>
      )}
    </div>
  );
}
