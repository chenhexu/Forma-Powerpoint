import { useEffect, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import { PerspectiveCamera, WebGLRenderer } from 'three';
import { disposeModel, loadModel, sceneForModel, setPose } from './model';
import { modelCameraDistance, type Asset, type SlideObject } from './types';

type Pose = [number, number, number];
let queue = Promise.resolve();
let renderer: WebGLRenderer | undefined;
let loaded: (ReturnType<typeof sceneForModel> & { asset: Asset }) | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const thumbnails = new WeakMap<Asset, Map<string, Promise<string>>>();

function releaseRenderer() {
  if (loaded) disposeModel(loaded.scene);
  loaded = undefined;
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = undefined;
}

function renderThumbnail(asset: Asset, aspect: number, pose: Pose) {
  let cache = thumbnails.get(asset);
  if (!cache) {
    cache = new Map();
    thumbnails.set(asset, cache);
  }
  const key = [aspect, ...pose].join(',');
  const cached = cache.get(key);
  if (cached) return cached;
  const next = queue.then(async () => {
    clearTimeout(idleTimer);
    try {
      renderer ??= new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      if (loaded?.asset !== asset) {
        if (loaded) disposeModel(loaded.scene);
        loaded = undefined;
        const model = await loadModel(asset);
        loaded = { asset, ...sceneForModel(model.scene, model.center, model.size) };
      }
      const longest = 240;
      const width = aspect >= 1 ? longest : Math.max(1, Math.round(longest * aspect));
      const height = aspect <= 1 ? longest : Math.max(1, Math.round(longest / aspect));
      renderer.setSize(width, height, false);
      renderer.setClearColor(0, 0);
      const camera = new PerspectiveCamera(45, aspect, 0.01, 200);
      camera.position.z = modelCameraDistance(aspect);
      setPose(loaded.pivot, pose);
      renderer.render(loaded.scene, camera);
      return renderer.domElement.toDataURL();
    } finally {
      // Keep one scene warm for repeated turns and consecutive Morph slides.
      idleTimer = setTimeout(releaseRenderer, 10_000);
    }
  });
  queue = next.then(
    () => {},
    () => {},
  );
  cache.set(key, next);
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  return next;
}

export function ModelThumbnail({
  object,
  asset,
  fallback,
  posterIsCurrent,
}: {
  object: SlideObject;
  asset: Asset;
  fallback?: string;
  posterIsCurrent: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<{ asset: Asset; src: string }>();
  const [x, y, z] = object.pose || [0, 0, 0];
  const aspect = Math.max(1, object.w) / Math.max(1, object.h);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || posterIsCurrent) return;
    let active = true;
    const timer = setTimeout(() => {
      void renderThumbnail(asset, aspect, [x, y, z])
        .then((src) => {
          if (active) setPreview({ asset, src });
        })
        .catch(() => {
          // Preserve the embedded poster if this device cannot draw a live thumbnail.
        });
    }, 80);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [asset, aspect, visible, posterIsCurrent, x, y, z]);

  const src = posterIsCurrent ? fallback : (preview?.asset === asset && preview.src) || fallback;
  return (
    <div ref={container} className="model-thumbnail">
      {src ? (
        <img src={src} alt={object.altText ?? object.name} draggable={false} />
      ) : (
        <div className="placeholder">
          <Box size={40} />
          <span>3D model</span>
        </div>
      )}
    </div>
  );
}
