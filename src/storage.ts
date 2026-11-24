import { get, set, del } from 'idb-keyval';
import { importPptx, makeAsset, releaseProject } from './pptx';
import type { Project, SlideObject } from './types';
const KEY = 'forma-project-v1';
export async function saveProject(project: Project) {
  await set(KEY, {
    ...project,
    assets: Object.fromEntries(
      Object.entries(project.assets).map(([k, a]) => [k, { bytes: a.bytes, mime: a.mime }]),
    ),
  });
}
export async function restoreProject(): Promise<Project | undefined> {
  const saved = await get<Project & { modelViewZoom?: Record<string, number> }>(KEY);
  if (!saved) return;
  await restoreInheritedText(saved);
  const { modelViewZoom, ...project } = saved;
  if (modelViewZoom) {
    for (const slide of project.deck.slides) {
      for (const object of slide.objects) {
        const zoom = modelViewZoom[object.id];
        if (object.kind !== 'model' || object.locked || object.modelZoom !== undefined) continue;
        if (!Number.isFinite(zoom) || zoom < 50 || zoom > 200 || zoom === 100) continue;
        object.modelZoom = zoom;
        slide.dirty = true;
      }
    }
  }
  const assets = Object.fromEntries(
    Object.entries(saved.assets as Project['assets']).map(([k, a]) => [k, makeAsset(a.bytes, a.mime)]),
  );
  return { ...project, assets };
}

async function restoreInheritedText(saved: Project) {
  const legacy = saved.deck.slides
    .flatMap((slide) => slide.objects)
    .filter((o) => o.kind === 'text' && o.sourceXml && (!o.textInsets || !o.textFlow));
  if (!legacy.length) return;
  const source = await importPptx(saved.original, saved.deck.name).catch(() => undefined);
  if (!source) return;
  try {
    const key = (o: SlideObject) => `${o.sourcePart}\u0000${o.sourceXml}`;
    const shapes = new Map(source.deck.slides.flatMap((slide) => slide.objects).map((o) => [key(o), o]));
    for (const o of legacy) {
      const original = shapes.get(key(o));
      if (!original) continue;
      o.textAnchor = original.textAnchor;
      o.textInsets = original.textInsets;
      o.textFlow = original.textFlow;
      for (const field of ['fontFamily', 'color', 'bold', 'italic', 'underline'] as const) {
        if (!o.changed.includes(field)) Object.assign(o, { [field]: original[field] });
      }
      if (!o.changed.includes('alignment')) o.alignment = original.alignment;
      if (!o.changed.includes('fontSize')) o.fontSize = original.fontSize;
    }
  } finally {
    releaseProject(source);
  }
}
export const clearSavedProject = () => del(KEY);
