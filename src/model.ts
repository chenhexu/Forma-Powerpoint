import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { modelCameraDistance, type Asset, type SlideObject } from './types';

export const MAX_MODEL_BYTES = 100 * 1024 * 1024;

export function validateGlb(bytes: Uint8Array) {
  if (bytes.length < 20) throw new Error('This is not a valid GLB file.');
  if (bytes.byteLength > MAX_MODEL_BYTES)
    throw new Error('The model GLB exceeds 100 MB. Try reducing texture sizes or simplifying the mesh.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error('Expected a valid glTF 2.0 binary (.glb).');
  const length = view.getUint32(12, true);
  if (length > bytes.length - 20) throw new Error('The GLB JSON chunk is incomplete.');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  const unsupported = [
    'KHR_draco_mesh_compression',
    'EXT_meshopt_compression',
    'KHR_texture_basisu',
    'EXT_texture_webp',
    'EXT_texture_avif',
  ];
  if ((json.extensionsUsed || []).some((e: string) => unsupported.includes(e)))
    throw new Error(
      'This model uses compressed geometry or textures. Export an uncompressed GLB and try again.',
    );
  for (const source of [...(json.buffers || []), ...(json.images || [])]) {
    if (source.uri && !source.uri.startsWith('data:'))
      throw new Error(
        'The GLB references external assets. Export a self-contained GLB with embedded textures.',
      );
  }
  return json;
}
export async function loadModel(asset: Asset) {
  validateGlb(asset.bytes);
  const gltf = await new GLTFLoader().parseAsync(asset.bytes.slice().buffer, '');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(max) || max < 0.000001) {
    disposeModel(gltf.scene);
    throw new Error('The model has no visible geometry.');
  }
  return { scene: gltf.scene, center: center.toArray() as [number, number, number], size: max };
}
export function disposeModel(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const value of Object.values(mat))
          if (value instanceof THREE.Texture) {
            value.dispose();
            const img = value.image;
            if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) img.close();
          }
        mat.dispose();
      }
    }
  });
}
export const modelDirectionalLights = [
  { color: 0xffffff, position: [3, 4, 5], intensity: 3.4, officeIlluminance: 1.4 },
  { color: 0xb8bbff, position: [-3, 1, -2], intensity: 2, officeIlluminance: 0.8 },
] as const;

export function sceneForModel(root: THREE.Object3D, center: [number, number, number], size: number) {
  const scene = new THREE.Scene();
  const pivot = new THREE.Group();
  const normalizer = new THREE.Group();
  root.position.sub(new THREE.Vector3(...center));
  normalizer.add(root);
  normalizer.scale.setScalar(2 / size);
  pivot.add(normalizer);
  scene.add(pivot);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a7498, 2.8));
  for (const { color, position, intensity } of modelDirectionalLights) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.fromArray(position);
    scene.add(light);
  }
  return { scene, pivot };
}
export function setPose(pivot: THREE.Object3D, pose: number[]) {
  pivot.rotation.set(...(pose.map(THREE.MathUtils.degToRad) as [number, number, number]), 'XYZ');
}
export async function renderModelPng(
  o: SlideObject,
  asset: Asset,
  loaded?: Awaited<ReturnType<typeof loadModel>>,
): Promise<Uint8Array> {
  const model = loaded || (await loadModel(asset));
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    const scale = Math.min(1600 / Math.max(o.w, o.h), Math.max(1.5, 256 / Math.max(o.w, o.h)));
    const width = Math.max(1, Math.round(o.w * scale));
    const height = Math.max(1, Math.round(o.h * scale));
    renderer.setSize(width, height);
    renderer.setClearColor(0, 0);
    const { scene, pivot } = sceneForModel(model.scene, model.center, model.size);
    setPose(pivot, o.pose || [0, 0, 0]);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 200);
    camera.position.z = modelCameraDistance(width / height);
    renderer.render(scene, camera);
    const blob = await new Promise<Blob>((resolve, reject) =>
      renderer!.domElement.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not generate a 3D preview.'))),
        'image/png',
      ),
    );
    return new Uint8Array(await blob.arrayBuffer());
  } catch (e) {
    throw new Error(`3D preview export failed. WebGL is required. ${e instanceof Error ? e.message : ''}`);
  } finally {
    disposeModel(model.scene);
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
export async function demoGlb() {
  const mesh = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.65, 0.23, 160, 24),
    new THREE.MeshStandardMaterial({ color: 0xb19bea, metalness: 0.32, roughness: 0.27 }),
  );
  const scene = new THREE.Scene();
  scene.add(mesh);
  const data = await new GLTFExporter().parseAsync(scene, { binary: true });
  disposeModel(scene);
  return new Uint8Array(data as ArrayBuffer);
}
export function interpolatedPose(a: number[], b: number[], t: number): [number, number, number] {
  const q = (p: number[]) =>
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...(p.map(THREE.MathUtils.degToRad) as [number, number, number])),
    );
  const e = new THREE.Euler().setFromQuaternion(q(a).slerp(q(b), t));
  return [e.x, e.y, e.z].map(THREE.MathUtils.radToDeg) as [number, number, number];
}

export type RotationAxis = 'X' | 'Y' | 'Z';

export function poseQuaternion(pose: readonly [number, number, number]) {
  const radians = THREE.MathUtils.degToRad;
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(radians(pose[0]), radians(pose[1]), radians(pose[2]), 'XYZ'),
  );
}

// PowerPoint reads the same axis signs as Three.js, but applies X, Y, then Z in world space.
export function convertModelPose(
  pose: [number, number, number],
  to: 'powerpoint' | 'forma',
): [number, number, number] {
  if (pose.filter(Boolean).length < 2) return pose;
  const [x, y, z] = pose.map(THREE.MathUtils.degToRad);
  const rotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(x, y, z, to === 'powerpoint' ? 'XYZ' : 'ZYX'),
  );
  const angles = new THREE.Euler().setFromQuaternion(rotation, to === 'powerpoint' ? 'ZYX' : 'XYZ');
  return [angles.x, angles.y, angles.z].map(THREE.MathUtils.radToDeg) as [number, number, number];
}

export function rotateOnModelAxis(pose: [number, number, number], axis: RotationAxis, degrees: number) {
  const vector = new THREE.Vector3(axis === 'X' ? 1 : 0, axis === 'Y' ? 1 : 0, axis === 'Z' ? 1 : 0);
  const turn = new THREE.Quaternion().setFromAxisAngle(vector, THREE.MathUtils.degToRad(degrees));
  const result = new THREE.Euler().setFromQuaternion(poseQuaternion(pose).multiply(turn), 'XYZ');
  return [result.x, result.y, result.z].map(THREE.MathUtils.radToDeg) as [number, number, number];
}
