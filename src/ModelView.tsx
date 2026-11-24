import { useEffect, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { modelCameraDistance, modelZoomFactor, type Asset, type SlideObject } from './types';
import { disposeModel, loadModel, sceneForModel, setPose } from './model';

export function ModelView({
  object,
  asset,
  onPose,
  onPosePreview,
  onZoom,
}: {
  object: SlideObject;
  asset: Asset;
  onPose?: (pose: [number, number, number]) => void;
  onPosePreview?: (pose: [number, number, number] | null) => void;
  onZoom?: (direction: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<{ render: () => void; pivot: THREE.Group } | null>(null);
  const cancelDrag = useRef<(() => void) | null>(null);
  const pose = useRef(object.pose || [0, 0, 0]);
  if (!cancelDrag.current) pose.current = object.pose || [0, 0, 0];
  const viewZoom = modelZoomFactor(object);
  const [error, setError] = useState('');
  useEffect(() => {
    const host = container.current!;
    let canceled = false;
    let dispose = () => {};
    setError('');
    loadModel(asset)
      .then((model) => {
        if (canceled) {
          disposeModel(model.scene);
          return;
        }
        let renderer: THREE.WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        } catch {
          disposeModel(model.scene);
          setError('WebGL unavailable. The native model is still preserved.');
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0, 0);
        host.appendChild(renderer.domElement);
        const { scene, pivot } = sceneForModel(model.scene, model.center, model.size);
        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
        const render = () => {
          const w = Math.max(host.clientWidth, 1),
            h = Math.max(host.clientHeight, 1);
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.position.z = modelCameraDistance(camera.aspect);
          camera.updateProjectionMatrix();
          setPose(pivot, pose.current);
          renderer.render(scene, camera);
        };
        state.current = { pivot, render };
        const observer = new ResizeObserver(render);
        observer.observe(host);
        render();
        dispose = () => {
          observer.disconnect();
          state.current = null;
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
          disposeModel(model.scene);
        };
      })
      .catch((e) => {
        if (!canceled) setError(e.message);
      });
    return () => {
      canceled = true;
      cancelDrag.current?.();
      dispose();
    };
  }, [asset]);
  useEffect(() => {
    state.current?.render();
  }, [object.pose, object.w, object.h]);
  useEffect(() => {
    if (!onZoom) return;
    const host = container.current!;
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      onZoom(-Math.sign(event.deltaY));
    };
    host.addEventListener('wheel', wheel, { passive: false });
    return () => host.removeEventListener('wheel', wheel);
  }, [onZoom]);
  return (
    <div
      ref={container}
      data-view-zoom={viewZoom}
      className={`model-view ${onPose ? 'orbit-enabled' : ''}`}
      style={{ '--model-zoom': viewZoom } as CSSProperties}
      onPointerDown={
        onPose
          ? (e) => {
              if (e.button !== 0 || cancelDrag.current) return;
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              const pointer = e.pointerId;
              const start = {
                x: e.clientX,
                y: e.clientY,
                pose: [...pose.current] as [number, number, number],
              };
              let moved = false;
              let next = start.pose;
              const move = (ev: PointerEvent) => {
                if (ev.pointerId !== pointer) return;
                const dx = ev.clientX - start.x,
                  dy = ev.clientY - start.y;
                const frame = (object.rotation * Math.PI) / 180;
                moved = Math.hypot(dx, dy) > 1;
                next = [
                  start.pose[0] + (-dx * Math.sin(frame) + dy * Math.cos(frame)) * 0.6,
                  start.pose[1] + (dx * Math.cos(frame) + dy * Math.sin(frame)) * 0.6,
                  start.pose[2],
                ];
                pose.current = next;
                state.current?.render();
                onPosePreview?.(next);
              };
              const finish = (commit: boolean) => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
                window.removeEventListener('keydown', escape, true);
                cancelDrag.current = null;
                onPosePreview?.(null);
                if (commit && moved) onPose(next);
                else {
                  pose.current = start.pose;
                  state.current?.render();
                }
              };
              const up = (ev: PointerEvent) => {
                if (ev.pointerId === pointer) finish(ev.type === 'pointerup');
              };
              const escape = (ev: KeyboardEvent) => {
                if (ev.key !== 'Escape') return;
                ev.stopImmediatePropagation();
                finish(false);
              };
              cancelDrag.current = () => finish(false);
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
              window.addEventListener('pointercancel', up);
              window.addEventListener('keydown', escape, true);
            }
          : undefined
      }
    >
      {error && <div className="model-error">{error}</div>}
    </div>
  );
}
