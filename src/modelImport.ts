import JSZip from 'jszip';
import {
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  MeshPhongMaterial,
  MeshLambertMaterial,
  SRGBColorSpace,
  Source,
  Texture,
  TextureLoader,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeModel, validateGlb, MAX_MODEL_BYTES } from './model';
import type { ModelSourceFile } from './types';

const modelPattern = /\.(glb|gltf|fbx|obj|stl)$/i;
const assetsPattern = /\.(bin|mtl|jpe?g|png|webp)$/i;
export const modelAccept = '.glb,.gltf,.fbx,.obj,.stl,.zip,.bin,.mtl,.png,.jpg,.jpeg,.webp';
export const isModelInput = (name: string) => modelPattern.test(name) || /\.zip$/i.test(name);

type Resource = ModelSourceFile;
const filename = (path: string) => path.split('/').pop() || path;
function normalizedPath(path: string) {
  try {
    path = decodeURIComponent(path);
  } catch {
    /* Keep literal names with a percent sign. */
  }
  const parts: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/').toLowerCase();
}
function textureStem(path: string) {
  return filename(normalizedPath(path))
    .replace(/\.\d+$/, '')
    .replace(/\.(jpe?g|png|webp)$/i, '')
    .replace(/_opengl$/, '')
    .replace(/[^a-z0-9]/g, '');
}
function unique<T>(items: T[], match: (item: T) => boolean): T | undefined {
  const found = items.filter(match);
  return found.length === 1 ? found[0] : undefined;
}

async function unpack(files: File[]): Promise<Resource[]> {
  const limit = 'Model imports can include up to 100 MB of files.';
  const inputs = files.filter((file) => isModelInput(file.name) || assetsPattern.test(file.name));
  if (inputs.reduce((total, file) => total + file.size, 0) > MAX_MODEL_BYTES) throw new Error(limit);
  const archives = inputs.filter((file) => /\.zip$/i.test(file.name));
  if (!archives.length) return inputs.map((file) => ({ path: file.webkitRelativePath || file.name, file }));
  if (inputs.length !== 1) throw new Error('Select one model ZIP, or one model with its companion files.');
  const zip = await JSZip.loadAsync(await archives[0].arrayBuffer());
  const entries = Object.values(zip.files).filter(
    (entry) =>
      !entry.dir &&
      !entry.name.startsWith('__MACOSX/') &&
      (modelPattern.test(entry.name) || assetsPattern.test(entry.name)),
  );
  const expandedSize = entries.reduce(
    (sum, entry) =>
      sum + ((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0),
    0,
  );
  if (expandedSize > MAX_MODEL_BYTES || entries.length > 2000)
    throw new Error('The model ZIP contains more than 100 MB of supported files or too many entries.');
  return Promise.all(entries.map(async (entry) => ({ path: entry.name, file: await entry.async('blob') })));
}

class FbxTextureReferences extends TextureLoader {
  refs = new Map<Texture, string>();

  override load(url: string) {
    const texture = new Texture();
    this.refs.set(texture, url);
    return texture;
  }
}

async function applyFbxTextures(
  root: Object3D,
  references: FbxTextureReferences,
  resolve: (url: string) => Resource | undefined,
  resources: Resource[],
  maxSize: number,
) {
  const converted = new Map<Material, MeshStandardMaterial>();
  const textures = resources.filter(({ path }) => /\.(jpe?g|png|webp)$/i.test(path));
  const images = new Map<Resource | string, HTMLCanvasElement>();
  const missing = new Set<string>();
  const keys = ['map', 'normalMap', 'emissiveMap', 'aoMap'] as const;
  const aliases = {
    map: ['color', 'basecolor', 'diffuse', 'albedo'],
    normalMap: ['normal', 'normalmap'],
    emissiveMap: ['emissive'],
    aoMap: ['ao', 'occlusion'],
  };

  async function textureImage(texture: Texture, resource: Resource | string) {
    let canvas = images.get(resource);
    if (!canvas) {
      const blob = typeof resource === 'string' ? await (await fetch(resource)).blob() : resource.file;
      const image = await createImageBitmap(blob);
      try {
        canvas = document.createElement('canvas');
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
        images.set(resource, canvas);
      } finally {
        image.close();
      }
    }
    const output = texture.clone();
    output.source = new Source(canvas);
    output.needsUpdate = true;
    return output;
  }

  const meshes: Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof Mesh) meshes.push(node);
  });
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (converted.has(material)) continue;
      if (!(material instanceof MeshPhongMaterial || material instanceof MeshLambertMaterial)) continue;
      const output = new MeshStandardMaterial({
        name: material.name,
        color: material.color,
        emissive: material.emissive,
        opacity: material.opacity,
        transparent: material.transparent,
        side: material.side,
        vertexColors: material.vertexColors,
        roughness: 0.85,
      });
      let baseResource: Resource | undefined;
      for (const key of keys) {
        const texture = (material as MeshPhongMaterial)[key];
        if (!texture) continue;
        const url = references.refs.get(texture);
        if (!url) continue;
        const materialName = material.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const fallback = unique(textures, ({ path }) =>
          aliases[key].some((suffix) => textureStem(path) === materialName + suffix),
        );
        const resource = /^(blob:|data:)/.test(url) ? url : resolve(url) || fallback;
        if (!resource) {
          missing.add(filename(normalizedPath(url)));
          continue;
        }
        try {
          output[key] = await textureImage(texture, resource);
          if (key === 'map' && typeof resource !== 'string') baseResource = resource;
        } catch {
          missing.add(filename(normalizedPath(url)));
        }
      }
      if (output.map) output.map.colorSpace = SRGBColorSpace;
      // The FBX parser skips some roughness and metalness links. Recover companions
      // only when their names match the base texture's own material set.
      if (baseResource && output.map) {
        const base = textureStem(baseResource.path).replace(/(basecolor|albedo|diffuse|color)\d?$/, '');
        if (base !== textureStem(baseResource.path))
          for (const [key, suffixes] of [
            ['roughnessMap', ['roughness']],
            ['metalnessMap', ['metalness', 'metallic']],
          ] as const) {
            const match = unique(textures, ({ path }) =>
              suffixes.some((suffix) => textureStem(path) === base + suffix),
            );
            if (!match) continue;
            try {
              const texture = new Texture();
              texture.wrapS = output.map.wrapS;
              texture.wrapT = output.map.wrapT;
              texture.repeat.copy(output.map.repeat);
              texture.offset.copy(output.map.offset);
              output[key] = await textureImage(texture, match);
              if (key === 'metalnessMap') output.metalness = 1;
              else output.roughness = 1;
            } catch {
              missing.add(filename(match.path));
            }
          }
      }
      converted.set(material, output);
    }
    mesh.material = Array.isArray(mesh.material)
      ? materials.map((material) => converted.get(material) || material)
      : converted.get(materials[0]) || materials[0];
  }
  for (const material of converted.keys()) material.dispose();
  return [...missing];
}

export async function importModelFiles(files: File[], companions: ModelSourceFile[] = []) {
  const picked = await unpack(files);
  const hasModel = picked.some((item) => modelPattern.test(item.path));
  const previous = companions.filter(
    (item) => assetsPattern.test(item.path) || (!hasModel && modelPattern.test(item.path)),
  );
  const merged = new Map<string, Resource>();
  for (const item of [...previous, ...picked]) {
    merged.set(normalizedPath(item.path), item);
  }
  const resources = [...merged.values()];
  if (resources.reduce((total, item) => total + item.file.size, 0) > MAX_MODEL_BYTES) {
    throw new Error('The model and its companion files exceed 100 MB.');
  }
  const models = resources.filter((item) => modelPattern.test(item.path));
  if (models.length !== 1)
    throw new Error(
      models.length ? 'Select one model per import.' : 'Choose a GLB, glTF, FBX, OBJ, STL, or model ZIP.',
    );
  const model = models[0];
  const name = filename(model.path).replace(/\.[^.]+$/, '');
  const extension = model.path.split('.').pop()!.toLowerCase();
  if (extension === 'glb') {
    const bytes = new Uint8Array(await model.file.arrayBuffer());
    validateGlb(bytes);
    return { bytes, name, missing: [] as string[], source: undefined };
  }
  const size = resources.reduce((total, item) => total + item.file.size, 0);
  const textureSize = size >= 45 * 1024 * 1024 ? 1536 : 2048;
  const directory = model.path.slice(0, model.path.lastIndexOf('/') + 1);
  function resolve(url: string) {
    const path = normalizedPath(url);
    const basename = filename(path);
    return (
      resources.find((item) => normalizedPath(item.path) === path) ||
      unique(resources, (item) => filename(normalizedPath(item.path)) === basename) ||
      (/\.(png|jpe?g|webp)$/i.test(basename)
        ? unique(
            resources,
            (item) =>
              assetsPattern.test(item.path) &&
              (textureStem(item.path) === textureStem(basename) ||
                textureStem(item.path) === textureStem(basename).replace(/(basecolor)\d+$/, '$1')),
          )
        : undefined)
    );
  }
  const manager = new LoadingManager();
  const objectUrls = new Map<Resource, string>();
  const missing = new Set<string>();
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const file = resolve(url);
    if (!file) {
      missing.add(filename(normalizedPath(url)));
      // External file references are resolved locally. An empty data URI fails without a network request.
      return 'data:application/octet-stream;base64,';
    }
    let objectUrl = objectUrls.get(file);
    if (!objectUrl) {
      objectUrl = URL.createObjectURL(file.file);
      objectUrls.set(file, objectUrl);
    }
    return objectUrl;
  });

  let root: Object3D | undefined;
  let fbx: FbxTextureReferences | undefined;
  try {
    if (extension === 'fbx') {
      const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
      fbx = new FbxTextureReferences(manager);
      manager.addHandler(/^\./, fbx);
      root = new FBXLoader(manager).parse(await model.file.arrayBuffer(), directory);
      for (const file of await applyFbxTextures(
        root,
        fbx,
        (url) => resolve(directory + url) || resolve(url),
        resources,
        textureSize,
      ))
        missing.add(file);
    } else if (extension === 'gltf') {
      const text = await model.file.text();
      const gltf = JSON.parse(text);
      for (const source of gltf.buffers || []) {
        if (source.uri && !source.uri.startsWith('data:') && !resolve(directory + source.uri)) {
          throw new Error(`Missing model data: ${source.uri}. Select the .bin file with the model.`);
        }
      }
      const loaded = await new GLTFLoader(manager).parseAsync(text, directory);
      root = loaded.scene;
      root.animations = loaded.animations;
    } else if (extension === 'obj') {
      const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
      const loader = new OBJLoader(manager);
      const text = await model.file.text();
      const mtlName = /^\s*mtllib\s+(.+)$/m.exec(text)?.[1].trim();
      const material = mtlName && resolve(directory + mtlName);
      const ready = new Promise<void>((resolve) => {
        manager.onLoad = resolve;
      });
      manager.itemStart('model');
      if (material) {
        const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js');
        const materials = new MTLLoader(manager).parse(
          await material.file.text(),
          material.path.slice(0, material.path.lastIndexOf('/') + 1),
        );
        loader.setMaterials(materials);
      } else if (mtlName) missing.add(mtlName);
      root = loader.parse(text);
      manager.itemEnd('model');
      await ready;
      root.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (!(material instanceof MeshPhongMaterial)) continue;
          for (const key of ['map', 'normalMap', 'bumpMap', 'specularMap', 'emissiveMap', 'alphaMap'] as const) {
            const texture = material[key];
            if (texture && !texture.image) {
              texture.dispose();
              material[key] = null;
            }
          }
        }
      });
    } else {
      const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
      const geometry = new STLLoader().parse(await model.file.arrayBuffer());
      root = new Mesh(
        geometry,
        new MeshStandardMaterial({ color: 0xbbabc9, vertexColors: !!geometry.getAttribute('color') }),
      );
    }

    if (extension === 'fbx' || extension === 'obj') {
      const indexed = new Map<BufferGeometry, BufferGeometry>();
      root.traverse((node) => {
        if (node instanceof Mesh && !node.geometry.index) {
          const geometry = node.geometry;
          if (!indexed.has(geometry)) indexed.set(geometry, mergeVertices(geometry));
          node.geometry = indexed.get(geometry)!;
        }
      });
      for (const geometry of indexed.keys()) geometry.dispose();
    }
    const output = await new GLTFExporter().parseAsync(root, {
      binary: true,
      animations: root.animations,
      maxTextureSize: textureSize,
    });
    const bytes = new Uint8Array(output as ArrayBuffer);
    validateGlb(bytes);
    return { bytes, name, missing: [...missing], source: missing.size ? resources : undefined };
  } finally {
    if (root) disposeModel(root);
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    for (const url of fbx?.refs.values() || []) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
