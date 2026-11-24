import JSZip from 'jszip';
import { Euler, Quaternion, Vector3, MathUtils } from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createProject,
  duplicateSlide,
  exportPptx,
  importPptx,
  insertBlankSlide,
  makeAsset,
  newObject,
} from './pptx';
import { all, child, first, NS, parseXml, relPath, resolvePart, serialize } from './xml';
import { History } from './history';
import { interpolatedPose, poseQuaternion, rotateOnModelAxis, validateGlb } from './model';
import { arrangeObjects } from './layout';
import { sampleGlb } from '../tests/sampleGlb';
import { EMU } from './types';
import { animationEffects } from './animations';
import { adjustPictureCrop, pictureCropPatch, pictureSourceRect } from './pictureGeometry';
import {
  defaultTransitionOption,
  nativeTransition,
  primaryTransition,
  slideTransitionNode,
  transitionChoices,
} from './transitions';

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fixture'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});
const neverRender = () => {
  throw new Error('Unexpected model render');
};

it('writes native animation targets and unique timing IDs, including on duplicate slides', async () => {
  const project = await createProject();
  const slide = project.deck.slides[0];
  const target = newObject('shape', project.deck);
  slide.objects = [target];
  const idsToCheck = [
    'entr:1',
    'entr:2',
    'entr:10',
    'entr:16',
    'entr:26',
    'exit:1',
    'exit:10',
    'emph:6',
    'emph:8',
    'emph:37',
    'emph:38',
    'path:0',
    'path:44',
    'path:42',
  ];
  slide.animations = animationEffects
    .filter(({ id }) => idsToCheck.includes(id))
    .map(({ id }, i) => ({
      id,
      effect: id,
      target: target.id,
      start: i % 3 === 0 ? 'click' : i % 3 === 1 ? 'with' : 'after',
      duration: 0.5,
      delay: 0.1,
      ...(id === 'path:0' && {
        path: [
          { x: 0, y: 0 },
          { x: 0.2, y: 0.1 },
        ],
      }),
    }));
  slide.dirty = true;
  const withDuplicate = duplicateSlide(project.deck, 0, false);
  const bytes = await exportPptx(project, withDuplicate, neverRender);
  const zip = await JSZip.loadAsync(bytes);
  for (const copy of withDuplicate.slides) {
    const xml = parseXml(await zip.file(copy.part)!.async('string'));
    const timing = first(xml, 'timing')!;
    const cTns = all(timing, 'cTn');
    const ids = cTns.map((node) => node.getAttribute('id'));
    const targetId = all(xml, 'cNvPr').at(-1)?.getAttribute('id');
    expect(new Set(ids).size).toBe(ids.length);
    expect(cTns.filter((node) => node.hasAttribute('presetID'))).toHaveLength(idsToCheck.length);
    expect(all(timing, 'spTgt').every((node) => node.getAttribute('spid') === targetId)).toBe(true);
    expect(all(timing, 'tn').every((node) => ids.includes(node.getAttribute('val')))).toBe(true);
  }
  const imported = await importPptx(bytes, 'Animations.pptx');
  expect(imported.deck.slides.map(({ animations }) => animations?.map(({ effect }) => effect))).toEqual(
    withDuplicate.slides.map(({ animations }) => animations?.map(({ effect }) => effect)),
  );
});

it('schedules every animation in its PowerPoint click step and retains relative editing delays', async () => {
  const project = await createProject();
  const slide = project.deck.slides[0];
  slide.dirty = true;
  const cases = [
    { start: 'with', delay: 0.02, duration: 0.08 },
    { start: 'after', delay: 0.1, duration: 0.6 },
    { start: 'click', delay: 0.1, duration: 0.2, repeat: 2 },
    { start: 'after', delay: 0.05, duration: 0.4 },
    { start: 'with', delay: 0.1, duration: 0.15 },
    { start: 'after', delay: 0.07, duration: 0.2 },
    { start: 'click', delay: 0.13, duration: 0.25 },
  ] as const;
  slide.objects = cases.map(() => newObject('shape', project.deck));
  slide.animations = cases.map((timing, i) => ({
    ...timing,
    id: 'timing-' + i,
    effect: 'entr:10',
    target: slide.objects[i].id,
  }));
  const bytes = await exportPptx(project, project.deck, neverRender);
  const zip = await JSZip.loadAsync(bytes);
  const xml = parseXml(await zip.file(slide.part)!.async('string'));
  const main = all(xml, 'cTn').find((node) => node.getAttribute('nodeType') === 'mainSeq')!;
  const groups = Array.from(child(main, 'childTnLst')!.children).map((par) => child(par, 'cTn')!);
  const condition = (node: Element) => child(node, 'stCondLst')!.firstElementChild!;
  const offsets = groups.map((group) =>
    Array.from(child(group, 'childTnLst')!.children).map((par) => {
      const start = condition(child(par, 'cTn')!);
      expect(start.getAttribute('evt')).toBeNull();
      return Number(start.getAttribute('delay'));
    }),
  );
  expect(offsets).toEqual([[0, 100], [0, 500, 550, 800], [0]]);
  for (const group of groups) expect(condition(group).getAttribute('delay')).toBe('indefinite');
  expect(groups[0].querySelector('[evt="onBegin"]')?.firstElementChild?.getAttribute('val')).toBe(
    main.getAttribute('id'),
  );
  expect(groups[1].querySelector('[evt="onBegin"]')).toBeNull();
  const imported = await importPptx(bytes, 'Click steps.pptx');
  const timing = imported.deck.slides[0].animations!.map(({ start, delay, duration, repeat }) => ({
    start,
    delay,
    duration,
    ...(repeat !== undefined && { repeat }),
  }));
  expect(timing).toEqual(cases);
});

describe('PPTX package editing', () => {
  it('round-trips every gallery transition and its timing through native PowerPoint XML', async () => {
    const project = await createProject();
    const deck = transitionChoices.slice(1).reduce((deck, _, i) => insertBlankSlide(deck, i), project.deck);
    for (const [i, [transition]] of transitionChoices.entries()) {
      Object.assign(deck.slides[i], {
        transition,
        transitionOption: defaultTransitionOption(transition),
        duration: 1.75,
        advanceOnClick: false,
        advanceAfter: 4.25,
        dirty: true,
        transitionDirty: true,
      });
    }
    expect(deck.slides).toHaveLength(49);
    const bytes = await exportPptx(project, deck, neverRender);
    const zip = await JSZip.loadAsync(bytes);
    const reopened = await importPptx(bytes, 'Gallery.pptx');
    for (const [i, [transition]] of transitionChoices.entries()) {
      const slide = deck.slides[i];
      const doc = parseXml(await zip.file(slide.part)!.async('string'));
      const element = primaryTransition(slideTransitionNode(doc.documentElement));
      const expected = nativeTransition(transition, slide.transitionOption);
      expect(element?.firstElementChild?.tagName ?? '', transition).toBe(expected.tag);
      expect(reopened.deck.slides[i]).toMatchObject({
        transition,
        advanceOnClick: false,
        advanceAfter: 4.25,
      });
      if (transition !== 'none') expect(reopened.deck.slides[i].duration).toBe(1.75);
    }
  });
  it('writes the PowerPoint table graphic URI and repairs it in older Forma decks', async () => {
    const project = await createProject();
    const slide = project.deck.slides[0];
    const table = {
      cells: [
        ['Quarter', 'Sales'],
        ['Q1', '10'],
      ],
      header: true,
    };
    slide.objects = [{ ...newObject('table', project.deck), table }];
    slide.dirty = true;
    const bytes = await exportPptx(project, project.deck, neverRender);
    const zip = await JSZip.loadAsync(bytes);
    const native = 'http://schemas.openxmlformats.org/drawingml/2006/table';
    const legacy = NS.a + '/table';
    const xml = await zip.file(slide.part)!.async('string');
    expect(xml).toContain(`uri="${native}"`);
    zip.file(slide.part, xml.replace(native, legacy));
    const reopened = await importPptx(await zip.generateAsync({ type: 'uint8array' }), 'Old table.pptx');
    expect(reopened.deck.slides[0].objects[0]?.table?.cells).toEqual(table.cells);
    const corrected = await JSZip.loadAsync(await exportPptx(reopened, reopened.deck, neverRender));
    expect(await corrected.file(slide.part)!.async('string')).toContain(`uri="${native}"`);
  });
  it('converts combined model rotations and repairs legacy Forma exports without replacing the model or poster', async () => {
    const project = await createProject();
    const slide = project.deck.slides[0];
    const asset = 'axis-model';
    project.assets[asset] = makeAsset(sampleGlb(), 'model/gltf-binary');
    const pose: [number, number, number] = [-97.69, 0.28, -175.84];
    slide.objects.push({ ...newObject('model', project.deck), asset, pose });
    slide.dirty = true;
    const poster = Uint8Array.of(37);
    const modern = await exportPptx(project, project.deck, async () => poster);
    const zip = await JSZip.loadAsync(modern);
    const xml = await zip.file(slide.part)!.async('string');
    const doc = parseXml(xml);
    const rot = first(doc, 'rot')!;
    const native = new Quaternion().setFromEuler(
      new Euler(
        ...((['ax', 'ay', 'az'] as const).map((axis) =>
          MathUtils.degToRad(Number(rot.getAttribute(axis)) / 60000),
        ) as [number, number, number]),
        'ZYX',
      ),
    );
    expect(native.angleTo(poseQuaternion(pose))).toBeLessThan(1e-6);
    expect(all(doc, 'dirLight')).toHaveLength(2);
    const imported = await importPptx(modern, 'Modern.pptx');
    expect(
      poseQuaternion(imported.deck.slides[0].objects[0].pose!).angleTo(poseQuaternion(pose)),
    ).toBeLessThan(1e-6);
    expect(await exportPptx(imported, imported.deck, neverRender)).toBe(modern);

    // Simulate the original Forma encoding, including a different native pose and old lighting.
    zip.file(
      slide.part,
      xml
        .replace('rName="Forma" rVer="2"', 'rName="Forma" rVer="1"')
        .replace(
          /<am3d:rot[^>]*\/>/,
          `<am3d:rot ax="${Math.round(pose[0] * 60000)}" ay="${Math.round(pose[1] * 60000)}" az="${Math.round(pose[2] * 60000)}"/>`,
        )
        .replace(/<am3d:dirLight.*?<\/am3d:dirLight>/gs, ''),
    );
    const legacy = await importPptx(await zip.generateAsync({ type: 'uint8array' }), 'Legacy.pptx');
    expect(legacy.deck.slides[0].objects[0].pose).toEqual(pose);
    const repaired = await JSZip.loadAsync(await exportPptx(legacy, legacy.deck, neverRender));
    const repairedDoc = parseXml(await repaired.file(slide.part)!.async('string'));
    expect(first(repairedDoc, 'raster')?.getAttribute('rVer')).toBe('2');
    expect(all(repairedDoc, 'dirLight')).toHaveLength(2);
    for (const axis of ['ax', 'ay', 'az'])
      expect(first(repairedDoc, 'rot')?.getAttribute(axis)).toBe(rot.getAttribute(axis));
    expect(await repaired.file(/\.glb$/)[0].async('uint8array')).toEqual(project.assets[asset].bytes);
    expect(await repaired.file(/preview_.*\.png$/)[0].async('uint8array')).toEqual(poster);
  });

  it('crops a rotated, flipped picture without moving or rescaling the underlying image', async () => {
    const { deck } = await createProject();
    const picture = {
      ...newObject('image', deck),
      x: 100,
      y: 100,
      w: 200,
      h: 100,
      rotation: 90,
      flipH: true,
    };
    const source = pictureSourceRect(picture);
    const next = adjustPictureCrop({ frame: source, source }, 'w', { x: 50, y: 0 });
    const patch = pictureCropPatch(picture, next);
    expect(patch).toEqual({ x: 125, y: 125, w: 150, h: 100, crop: [0, 0, 0.25, 0] });
    const reloaded = { ...picture, ...patch };
    const full = pictureSourceRect(reloaded);
    expect(full).toEqual({ x: -50, y: -0, w: 200, h: 100 });
    expect(pictureCropPatch(reloaded, { frame: full, source: full })).toEqual({
      x: picture.x,
      y: picture.y,
      w: picture.w,
      h: picture.h,
      crop: [0, 0, 0, 0],
    });
  });

  it('returns the original bytes for an unedited deck and rejects invalid files', async () => {
    const project = await createProject();
    expect(await exportPptx(project, project.deck, neverRender)).toBe(project.original);
    await expect(importPptx(new Uint8Array(5), 'invalid.pptx')).rejects.toThrow();
  });

  it('exports a shared native GLB, separate PNG previews and a matching Morph pair', async () => {
    const project = await createProject();
    const model = {
      ...newObject('model', project.deck),
      asset: 'fixture.glb',
      modelCenter: [0, 0, 0] as [number, number, number],
      modelSize: 1,
    };
    const glb = sampleGlb();
    project.assets[model.asset] = makeAsset(glb, 'model/gltf-binary');
    project.deck.slides[0].objects.push(model);
    const deck = duplicateSlide(project.deck, 0);
    deck.slides[1].objects[0].pose = [0, 90, 0];
    deck.slides[1].duration = 1.3;
    // The stub gives each slide a different preview, so overwriting a shared path is detectable.
    const output = await exportPptx(project, deck, async (o) => Uint8Array.of(o.pose?.[1] || 0));
    const zip = await JSZip.loadAsync(output);
    const doc = async (path: string) => parseXml(await zip.file(path)!.async('string'));
    const previewTargets = new Set<string>();
    for (const [index, slide] of deck.slides.entries()) {
      const xml = await doc(slide.part);
      const model = first(xml, 'model3d')!;
      const rels = await doc(relPath(slide.part));
      const relation = (id: string) => all(rels, 'Relationship').find((r) => r.getAttribute('Id') === id)!;
      const modelRel = relation(model.getAttributeNS(NS.r, 'embed')!);
      const modelPath = resolvePart(slide.part, modelRel.getAttribute('Target')!);
      expect(modelRel.getAttribute('Type')).toBe(
        'http://schemas.microsoft.com/office/2017/06/relationships/model3d',
      );
      expect(await zip.file(modelPath)!.async('uint8array')).toEqual(glb);
      const preview = first(first(model, 'raster')!, 'blip')!.getAttributeNS(NS.r, 'embed')!;
      const fallback = first(first(xml, 'Fallback')!, 'blip')!.getAttributeNS(NS.r, 'embed');
      expect(fallback).toBe(preview);
      const previewTarget = resolvePart(slide.part, relation(preview).getAttribute('Target')!);
      previewTargets.add(previewTarget);
      expect(await zip.file(previewTarget)!.async('uint8array')).toEqual(Uint8Array.of(index * 90));
      expect(first(model, 'rot')?.getAttribute('ay')).toBe(String(index * 5400000));
      expect(first(xml, 'morph')?.getAttribute('option')).toBe(index ? 'byObject' : undefined);
      expect(first(xml, 'Choice')?.getAttribute('xmlns:am3d')).toBe(NS.am3d);
    }
    expect(previewTargets.size).toBe(2);
    expect(Object.keys(zip.files).filter((p) => p.endsWith('.glb'))).toHaveLength(1);
    expect(
      all(await doc('[Content_Types].xml'), 'Default')
        .find((e) => e.getAttribute('Extension') === 'glb')
        ?.getAttribute('ContentType'),
    ).toBe('model/gltf.binary');
    const reimport = await importPptx(output, 'render.pptx');
    expect(reimport.deck.slides[0].objects[0].name).toBe(reimport.deck.slides[1].objects[0].name);
    expect(reimport.deck.slides[1].objects[0].pose).toEqual([0, 90, 0]);
    expect(reimport.deck.slides[1].duration).toBe(1.3);
    expect(reimport.deck.slides[1].transition).toBe('morph');

    // Zooming an existing Forma-native frame updates both branches of its original XML.
    const slide = reimport.deck.slides[1];
    const source = slide.objects[0];
    const base = { x: source.x, y: source.y, w: source.w, h: source.h };
    source.modelZoom = 50;
    source.changed = ['modelZoom'];
    slide.dirty = true;
    const zoomed = await exportPptx(reimport, reimport.deck, async () => Uint8Array.of(42));
    const zoomedZip = await JSZip.loadAsync(zoomed);
    const part = parseXml(await zoomedZip.file(slide.part)!.async('string'));
    const transforms = [
      first(first(part, 'graphicFrame')!, 'xfrm')!,
      first(first(part, 'Fallback')!, 'xfrm')!,
      first(first(part, 'model3d')!, 'xfrm')!,
    ];
    for (const transform of transforms) {
      expect(first(transform, 'ext')?.getAttribute('cx')).toBe(String(Math.round((base.w * EMU) / 2)));
      expect(first(transform, 'ext')?.getAttribute('cy')).toBe(String(Math.round((base.h * EMU) / 2)));
    }
    const roundTrip = await importPptx(zoomed, 'zoomed.pptx');
    const result = roundTrip.deck.slides[1].objects[0];
    expect(result.x).toBeCloseTo(base.x + base.w / 4);
    expect(result.y).toBeCloseTo(base.y + base.h / 4);
    expect(result.pose).toEqual([0, 90, 0]);
    expect(roundTrip.deck.slides[1].transition).toBe('morph');
    expect(source).toMatchObject({ ...base, modelZoom: 50 });
  });

  it('keeps PowerPoint section slide IDs separate from the presentation slide list', async () => {
    const project = await createProject();
    const zip = await JSZip.loadAsync(project.original);
    const path = 'ppt/presentation.xml';
    const section =
      '<p:extLst><p:ext uri="section-test"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p14:section name="First"><p14:sldIdLst><p14:sldId id="256"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst>';
    zip.file(
      path,
      (await zip.file(path)!.async('string')).replace('</p:presentation>', section + '</p:presentation>'),
    );
    const original = await importPptx(await zip.generateAsync({ type: 'uint8array' }), 'Sections.pptx');
    expect(original.deck.slides).toHaveLength(1);
    const expanded = duplicateSlide(original.deck, 0, false);
    const output = await JSZip.loadAsync(await exportPptx(original, expanded, neverRender));
    const presentation = parseXml(await output.file(path)!.async('string'));
    expect(presentation.getElementsByTagNameNS(NS.p, 'sldId')).toHaveLength(2);
    expect(first(presentation, 'sectionLst')?.textContent).toBe('');
    expect(first(first(presentation, 'sectionLst')!, 'sldId')?.getAttribute('id')).toBe('256');
  });

  it('gives blank slides a layout and cleans deleted slide entries from sections and custom shows', async () => {
    const project = await createProject();
    const zip = await JSZip.loadAsync(project.original);
    const path = 'ppt/presentation.xml';
    const xml = (await zip.file(path)!.async('string')).replace(
      '</p:presentation>',
      [
        '<p:custShowLst><p:custShow name="Original" id="0"><p:sldLst><p:sld r:id="rId2"/></p:sldLst></p:custShow></p:custShowLst>',
        '<p:extLst><p:ext uri="section-test"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p14:section name="Original"><p14:sldIdLst><p14:sldId id="256"/></p14:sldIdLst></p14:section></p14:sectionLst></p:ext></p:extLst>',
        '</p:presentation>',
      ].join(''),
    );
    zip.file(path, xml);
    const imported = await importPptx(await zip.generateAsync({ type: 'uint8array' }), 'With section.pptx');
    const deck = insertBlankSlide(imported.deck, 0);
    const oldPath = deck.slides.shift()!.part;
    const addedPath = deck.slides[0].part;
    const output = await exportPptx(imported, deck, neverRender);
    const result = await JSZip.loadAsync(output);
    const pres = parseXml(await result.file(path)!.async('string'));
    expect(all(first(pres, 'sectionLst')!, 'sldId').map((el) => el.getAttribute('id'))).toEqual(['257']);
    expect(all(pres, 'custShow')).toHaveLength(0);
    expect(result.file(oldPath)).toBeTruthy();
    const addedRels = parseXml(await result.file(relPath(addedPath))!.async('string'));
    const relationship = first(addedRels, 'Relationship')!;
    expect(relationship.getAttribute('Type')).toMatch(/slideLayout$/);
    expect(result.file(resolvePart(addedPath, relationship.getAttribute('Target')!))).toBeTruthy();
    const reimported = await importPptx(output, 'Result.pptx');
    expect(reimported.deck.slides.map((slide) => slide.part)).toEqual([addedPath]);
  });

  it('inherits text alignment, anchor, insets and size from its matching layout placeholder', async () => {
    const project = await createProject();
    const zip = await JSZip.loadAsync(project.original);
    const layout = 'ppt/slideLayouts/slideLayout1.xml';
    const slide = project.deck.slides[0].part;
    const title =
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:spPr/>';
    const layoutBox =
      title +
      '<p:txBody><a:bodyPr anchor="b" tIns="0"/><a:lstStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="6000"/></a:lvl1pPr></a:lstStyle><a:p/></p:txBody></p:sp>';
    const slideBox =
      title + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>';
    for (const [path, box] of [
      [layout, layoutBox],
      [slide, slideBox],
    ]) {
      const xml = await zip.file(path)!.async('string');
      zip.file(path, xml.replace('</p:spTree>', box + '</p:spTree>'));
    }
    const imported = await importPptx(await zip.generateAsync({ type: 'uint8array' }), 'Centered.pptx');
    expect(imported.deck.slides[0].objects[0]).toMatchObject({
      alignment: 'center',
      textAnchor: 'bottom',
      fontSize: 80,
      textInsets: [0, 9.6, 4.8, 9.6],
    });
    expect(await exportPptx(imported, imported.deck, neverRender)).toBe(imported.original);
  });

  it('updates imported text formatting without replacing other run and paragraph properties', async () => {
    const project = await createProject();
    const zip = await JSZip.loadAsync(project.original);
    const filename = project.deck.slides[0].part;
    const original = await zip.file(filename)!.async('string');
    zip.file(
      filename,
      original.replace(
        '</p:spTree>',
        [
          '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Label"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>',
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr marL="914400"/>',
          '<a:r><a:rPr b="1" lang="fr-CA"/><a:t>Bonjour</a:t></a:r>',
          '<a:r><a:rPr sz="2000"/><a:t> le monde</a:t></a:r></a:p></p:txBody>',
          '</p:sp></p:spTree>',
        ].join(''),
      ),
    );
    const imported = await importPptx(await zip.generateAsync({ type: 'uint8array' }), 'Test.pptx');
    const slide = imported.deck.slides[0];
    slide.dirty = true;
    Object.assign(slide.objects[0], {
      italic: true,
      underline: true,
      fontFamily: 'Georgia',
      alignment: 'center',
      text: 'BONJOUR LE MONDE',
      lineSpacing: 1.5,
      textAnchor: 'middle',
      baseline: -25,
      changed: [
        'italic',
        'underline',
        'fontFamily',
        'alignment',
        'text',
        'lineSpacing',
        'textAnchor',
        'baseline',
      ],
    });
    const result = await JSZip.loadAsync(await exportPptx(imported, imported.deck, neverRender));
    const doc = parseXml(await result.file(filename)!.async('string'));
    const runs = all(doc, 'rPr');
    expect(runs.map((r) => r.getAttribute('i'))).toEqual(['1', '1']);
    expect(runs.map((r) => r.getAttribute('u'))).toEqual(['sng', 'sng']);
    expect(runs[0].getAttribute('lang')).toBe('fr-CA');
    expect(runs[1].getAttribute('sz')).toBe('2000');
    expect(first(doc, 'pPr')?.getAttribute('marL')).toBe('914400');
    expect(first(doc, 'pPr')?.getAttribute('algn')).toBe('ctr');
    expect(first(doc, 'bodyPr')?.getAttribute('anchor')).toBe('ctr');
    expect(first(doc, 'spcPct')?.getAttribute('val')).toBe('150000');
    expect(runs.map((r) => r.getAttribute('baseline'))).toEqual(['-25000', '-25000']);
    expect(all(doc, 't').map((t) => t.textContent)).toEqual(['BONJOUR', ' LE MONDE']);
  });

  it('edits words in place without discarding the other imported text runs or their highlights', async () => {
    const project = await createProject();
    const zip = await JSZip.loadAsync(project.original);
    const part = project.deck.slides[0].part;
    const body =
      '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr b="1"/><a:t>Hello</a:t></a:r><a:r><a:rPr><a:highlight><a:srgbClr val="FFFF00"/></a:highlight></a:rPr><a:t> world</a:t></a:r></a:p></p:txBody>';
    const shape = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>${body}</p:sp>`;
    zip.file(part, (await zip.file(part)!.async('string')).replace('</p:spTree>', shape + '</p:spTree>'));
    const imported = await importPptx(await zip.generateAsync({ type: 'uint8array' }), 'Text.pptx');
    const slide = imported.deck.slides[0];
    const text = slide.objects[0];
    expect(text.textFlow?.paragraphs[0].runs[1].highlight).toBe('#FFFF00');
    text.text = 'Hi world';
    text.changed.push('text');
    slide.dirty = true;
    const out = await JSZip.loadAsync(await exportPptx(imported, imported.deck, neverRender));
    const edited = parseXml(await out.file(part)!.async('string'));
    expect(all(edited, 't').map((t) => t.textContent)).toEqual(['Hi', ' world']);
    expect(all(edited, 'rPr')[0].getAttribute('b')).toBe('1');
    expect(first(edited, 'highlight')).toBeTruthy();
  });

  it('repoints an existing native model to the replacement GLB without changing its slide pose', async () => {
    const project = await createProject();
    const slide = project.deck.slides[0];
    project.assets.old = makeAsset(sampleGlb(), 'model/gltf-binary');
    slide.objects.push({ ...newObject('model', project.deck), asset: 'old', pose: [19, 28, 31] });
    slide.dirty = true;
    const preview = async () => Uint8Array.of(1, 2, 3);
    const exported = await exportPptx(project, project.deck, preview);
    const imported = await importPptx(exported, 'Existing.pptx');
    const repaired = imported.deck.slides[0];
    const model = repaired.objects[0];
    imported.assets.new = makeAsset(sampleGlb(), 'model/gltf-binary');
    model.asset = 'new';
    model.modelSize = 2;
    model.modelCenter = [1, 0, 0];
    model.changed.push('asset');
    repaired.dirty = true;
    const zip = await JSZip.loadAsync(await exportPptx(imported, imported.deck, preview));
    const xml = parseXml(await zip.file(repaired.part)!.async('string'));
    const modelRel = first(xml, 'model3d')!.getAttributeNS(NS.r, 'embed');
    const rels = parseXml(await zip.file(relPath(repaired.part))!.async('string'));
    const target =
      all(rels, 'Relationship')
        .find((e) => e.getAttribute('Id') === modelRel)
        ?.getAttribute('Target') || '';
    expect(target).toContain('forma_new.glb');
    const original = await JSZip.loadAsync(exported);
    const originalXml = parseXml(await original.file(repaired.part)!.async('string'));
    for (const axis of ['ax', 'ay', 'az'])
      expect(first(xml, 'rot')?.getAttribute(axis)).toBe(first(originalXml, 'rot')?.getAttribute(axis));
    expect(first(xml, 'preTrans')?.getAttribute('dx')).toBe('-36000000');
  });

  it('preserves unknown markup, shape IDs and timing, and duplicates notes with a new backlink', async () => {
    const project = await createProject();
    const part = project.deck.slides[0].part;
    const zip = await JSZip.loadAsync(project.original);
    const xml = await zip.file(part)!.async('string');
    zip.file(
      part,
      xml
        .replace('<p:cSld>', '<p:cSld xmlns:x="urn:test-extension">')
        .replace(
          '</p:spTree>',
          '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="2" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="3" name="Child"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp><p:extLst><p:ext uri="preservation-test"><x:thing/></p:ext></p:extLst></p:grpSp></p:spTree>',
        )
        .replace('</p:sld>', '<p:timing><p:tnLst/></p:timing></p:sld>'),
    );
    const notesPath = 'ppt/notesSlides/notesSlide1.xml';
    const notes = '<notes>Keep these notes.</notes>';
    zip.file(notesPath, notes);
    const notesRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    zip.file(
      relPath(notesPath),
      `<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${notesRel}slide" Target="../slides/slide1.xml"/></Relationships>`,
    );
    const srels = await zip.file(relPath(part))!.async('string');
    zip.file(
      relPath(part),
      srels.replace(
        '</Relationships>',
        `<Relationship Id="rId2" Type="${notesRel}notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
      ),
    );
    const original = await importPptx(await zip.generateAsync({ type: 'uint8array' }), 'Preserve.pptx');
    const deck = duplicateSlide(original.deck, 0);
    const exported = await JSZip.loadAsync(await exportPptx(original, deck, neverRender));
    expect(await exported.file(notesPath)!.async('string')).toBe(notes);
    expect(await exported.file('ppt/theme/theme1.xml')!.async('uint8array')).toEqual(
      await zip.file('ppt/theme/theme1.xml')!.async('uint8array'),
    );
    const cloned = deck.slides[1].part;
    const cloneDoc = parseXml(await exported.file(cloned)!.async('string'));
    expect(all(cloneDoc, 'cNvPr').map((e) => e.getAttribute('id'))).toEqual(['1', '2', '3']);
    expect(first(cloneDoc, 'thing')?.namespaceURI).toBe('urn:test-extension');
    expect(first(cloneDoc, 'timing')).toBeDefined();
    const rels = parseXml(await exported.file(relPath(cloned))!.async('string'));
    const dest = resolvePart(
      cloned,
      all(rels, 'Relationship')
        .find((r) => r.getAttribute('Type')?.endsWith('/notesSlide'))!
        .getAttribute('Target')!,
    );
    expect(dest).not.toBe(notesPath);
    expect(await exported.file(dest)!.async('string')).toBe(notes);
    const backlink = first(parseXml(await exported.file(relPath(dest))!.async('string')), 'Relationship')!;
    expect(resolvePart(dest, backlink.getAttribute('Target')!)).toBe(cloned);
  });
});

describe('editor helpers', () => {
  it('interpolates model rotation over the shortest arc', () => {
    const middle = interpolatedPose([0, 0, 170], [0, 0, -170], 0.5);
    expect(Math.abs(middle[2])).toBeCloseTo(180);
  });
  it.each(['X', 'Y', 'Z'] as const)('turns around the model %s axis from a tilted pose', (axis) => {
    const toQuaternion = (pose: number[]) =>
      new Quaternion().setFromEuler(new Euler(...(pose.map(MathUtils.degToRad) as [number, number, number])));
    const start: [number, number, number] = [21, 34, 58];
    const vector = new Vector3(axis === 'X' ? 1 : 0, axis === 'Y' ? 1 : 0, axis === 'Z' ? 1 : 0);
    const initial = toQuaternion(start);
    const expectedAxis = vector.clone().applyQuaternion(initial);
    const wanted = new Quaternion().setFromAxisAngle(expectedAxis, MathUtils.degToRad(42)).multiply(initial);
    const actual = toQuaternion(rotateOnModelAxis(start, axis, 42));
    expect(wanted.angleTo(actual)).toBeCloseTo(0);
  });

  it('aligns visible rotated bounds and distributes objects with unequal widths', () => {
    const deck = { name: '', width: 600, height: 450, slides: [] };
    const a = { ...newObject('shape', deck), x: 20, y: 80, w: 30, h: 90, rotation: 90 };
    const b = { ...newObject('shape', deck), x: 78, y: 10, w: 60, h: 20 };
    const c = { ...newObject('shape', deck), x: 150, y: 60, w: 10, h: 20 };
    const first = arrangeObjects([a], deck.width, deck.height, 'left');
    expect(first[a.id].x).toBeCloseTo(30);
    const spaced = arrangeObjects([a, b, c], deck.width, deck.height, 'horizontal');
    expect(spaced[a.id].x).toBeCloseTo(a.x);
    expect(spaced[b.id].x).toBeCloseTo(85);
    expect(spaced[c.id].x).toBeCloseTo(c.x);
  });

  it('rejects malformed, external and compressed GLB files', () => {
    expect(() => validateGlb(new Uint8Array(20))).toThrow('glTF 2.0');
    expect(() => validateGlb(sampleGlb({ buffers: [{ byteLength: 36, uri: 'mesh.bin' }] }))).toThrow(
      'external assets',
    );
    expect(() => validateGlb(sampleGlb({ extensionsUsed: ['KHR_draco_mesh_compression'] }))).toThrow(
      'compressed',
    );
    expect(validateGlb(sampleGlb()).asset.version).toBe('2.0');
  });
  it('truncates redo when an edit follows undo', () => {
    const history = new History(0);
    history.commit(1);
    history.commit(2);
    expect(history.undo()).toBe(1);
    expect(history.redo()).toBe(2);
    history.undo();
    history.commit(3);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe(1);
  });
});

it('links each pasted object for native Morph during copies onto different slides', async () => {
  const project = await createProject();
  const { pasteObjects } = await import('./slideEditing');
  const first = project.deck.slides[0];
  const existing = [
    { ...newObject('shape', project.deck), name: 'Rectangle', x: 25 },
    { ...newObject('text', project.deck), name: 'Title', x: 300 },
  ];
  first.objects = existing;
  first.dirty = true;
  let deck = insertBlankSlide(insertBlankSlide(project.deck, 0), 0);
  const clipboard = structuredClone(existing);
  deck = pasteObjects(deck, 1, clipboard, first.id).deck;
  deck = pasteObjects(deck, 2, clipboard, first.id).deck;
  const names = deck.slides[0].objects.map(({ name }) => name);
  expect(new Set(names).size).toBe(2);
  for (const item of deck.slides) expect(item.objects.map(({ name }) => name)).toEqual(names);
  expect(deck.slides[1].objects.map(({ x }) => x)).toEqual([25, 300]);
  const single = pasteObjects(deck, 0, clipboard, first.id);
  expect(single.copies.every(({ name }) => !names.includes(name))).toBe(true);
  expect(single.copies[0].x).toBe(49);
  deck.slides[1].transition = 'morph';
  deck.slides[1].transitionDirty = true;
  const reopened = await importPptx(await exportPptx(project, deck, neverRender), 'Morph.pptx');
  expect(reopened.deck.slides.map(({ objects }) => objects.map(({ name }) => name))).toEqual([
    names,
    names,
    names,
  ]);
  expect(reopened.deck.slides[1].transition).toBe('morph');
});

it('round trips backgrounds, groups, freeforms, picture formatting, sections, connectors, and the master', async () => {
  const project = await createProject();
  const { mergeShapes } = await import('./mergeShapes');
  const { connectorFrame } = await import('./shapeGeometry');
  const { masterFooterName } = await import('./pptx');
  const deck = insertBlankSlide(project.deck, 0);
  const [first, second] = deck.slides;
  const left = { ...newObject('shape', deck), x: 10, y: 40, w: 100, h: 100 };
  const right = { ...newObject('shape', deck), x: 160, y: 40, w: 100, h: 100 };
  const [freeform] = mergeShapes([left, { ...right, x: 60, y: 60 }], 'union');
  const connector = {
    ...newObject('shape', deck),
    geometry: 'line' as const,
    ...connectorFrame(left, right).frame,
    connector: { from: left.id, to: right.id },
    outline: { color: '#6345bd', width: 2, dash: 'solid' as const },
  };
  const picture = {
    ...newObject('image', deck),
    asset: 'picture',
    pictureShape: 'ellipse' as const,
    pictureOpacity: 0.6,
    pictureBrightness: 0.2,
    crop: [0.1, 0, 0.2, 0] as [number, number, number, number],
  };
  project.assets.picture = makeAsset(new Uint8Array([137, 80, 78, 71]), 'image/png');
  const placeholder = { ...newObject('text', deck), text: 'Shared layout title', layoutPlaceholder: 1 };
  deck.savedLayouts = [
    { id: 'testlayout', name: 'Shared template', placeholders: [placeholder], dirty: true },
  ];
  second.savedLayout = 'testlayout';
  second.objects = [
    placeholder,
    { ...freeform, groupId: 'freeforms' },
    { ...picture, groupId: 'freeforms', hidden: true },
  ];
  second.backgroundPaint = { kind: 'image', asset: picture.asset };
  second.backgroundDirty = true;
  second.comments = [
    { id: 'review1', author: 'Source Author', date: '2026-11-23T12:00:00Z', text: 'Source note' },
  ];
  first.objects = [left, right, connector];
  first.backgroundPaint = {
    kind: 'gradient',
    angle: 25,
    stops: [
      { color: '#aa2211', position: 0 },
      { color: '#2288ff', position: 1 },
    ],
  };
  first.backgroundDirty = true;
  first.dirty = true;
  const sectionId = '{940AB000-E2D4-4F81-86ED-D769F702E9AB}';
  deck.sections = [{ id: sectionId, name: 'Main section' }];
  deck.sectionsDirty = true;
  first.sectionId = second.sectionId = sectionId;
  deck.width = 960;
  deck.height = 720;
  deck.masterObjects = [{ ...newObject('text', deck), name: masterFooterName, text: 'Shared footer' }];
  deck.masterDirty = true;
  deck.theme = { heading: 'Arial', body: 'Georgia', accent: '#234567' };
  deck.themeDirty = true;

  const data = await exportPptx(project, deck, neverRender);
  const reopened = await importPptx(data, 'Slide authoring.pptx');
  expect(reopened.deck).toMatchObject({
    width: 960,
    height: 720,
    theme: deck.theme,
    sections: deck.sections,
  });
  expect(reopened.deck.masterObjects?.[0].text).toBe('Shared footer');
  expect(reopened.deck.savedLayouts?.[0]).toMatchObject({ id: 'testlayout', name: 'Shared template' });
  const [a, b] = reopened.deck.slides;
  expect(a.backgroundPaint).toEqual(first.backgroundPaint);
  expect(a.objects[2].connector).toEqual({ from: a.objects[0].id, to: a.objects[1].id });
  expect(b.savedLayout).toBe('testlayout');
  expect(b.backgroundPaint).toMatchObject({ kind: 'image' });
  expect(b.objects[0].layoutPlaceholder).toBe(1);
  expect(b.objects[1].customPaths?.[0].length).toBeGreaterThan(4);
  expect(b.objects[2]).toMatchObject({
    groupId: 'freeforms',
    hidden: true,
    pictureShape: 'ellipse',
    pictureOpacity: 0.6,
    pictureBrightness: 0.2,
    crop: picture.crop,
  });

  const { reuseSlides } = await import('./pptx');
  const target = await createProject();
  target.deck.slides[0].comments = [
    { id: 'targetreview', author: 'Target Author', date: '2026-11-23T12:00:00Z', text: 'Target note' },
  ];
  target.deck.slides[0].dirty = true;
  const destination = await importPptx(await exportPptx(target, target.deck, neverRender), 'Target.pptx');
  const reused = await reuseSlides(destination, reopened, [1], 0);
  const received = reused.deck.slides[1];
  expect(received.part).toContain('reuse_');
  expect(received.comments?.[0]).toMatchObject({ author: 'Source Author', text: 'Source note' });
  expect(received.objects[0].text).toBe('Shared layout title');
  expect(received.objects[2].asset).toBeDefined();
  expect(reused.assets[received.objects[2].asset!]).toBeDefined();
  const returned = await importPptx(await exportPptx(reused, reused.deck, neverRender), 'Reuse.pptx');
  expect(returned.deck.slides[0].comments?.[0].author).toBe('Target Author');
  expect(returned.deck.slides[1].savedLayout).toBe(received.savedLayout);
  expect(returned.deck.slides[1].objects[2].hidden).toBe(true);
});

it('replaces text and fonts across styled mixed-font runs', async () => {
  const project = await createProject();
  const { replaceSlideFont, replaceSlideText } = await import('./findReplace');
  const deck = project.deck;
  const item = {
    ...newObject('text', deck),
    fontFamily: 'Arial',
    text: 'One BRIGHT idea, two bright ideas.',
  };
  deck.slides[0].objects = [item];
  deck.slides[0].dirty = true;
  const zip = await JSZip.loadAsync(await exportPptx(project, deck, neverRender));
  const part = deck.slides[0].part;
  const doc = parseXml(await zip.file(part)!.async('string'));
  const originalRun = first(doc, 'r')!;
  const formattedRun = originalRun.cloneNode(true) as Element;
  first(originalRun, 't').textContent = 'One BRIGHT idea, two ';
  first(formattedRun, 't').textContent = 'bright ideas.';
  first(formattedRun, 'latin').setAttribute('typeface', 'Courier New');
  first(formattedRun, 'rPr').setAttribute('b', '1');
  originalRun.after(formattedRun);
  zip.file(part, serialize(doc));
  const imported = await importPptx(await zip.generateAsync({ type: 'uint8array' }), 'Text.pptx');
  const before = imported.deck.slides[0].objects[0];
  const after = replaceSlideFont(replaceSlideText(before, 'bright', 'great', false), 'Arial', 'Georgia');
  imported.deck.slides[0].objects = [after];
  imported.deck.slides[0].dirty = true;
  const reopened = await importPptx(await exportPptx(imported, imported.deck, neverRender), 'Updated.pptx');
  const result = reopened.deck.slides[0].objects[0];
  expect(result.text).toBe('One great idea, two great ideas.');
  expect(result.fontFamily).toBe('Georgia');
  expect(result.textFlow?.paragraphs[0].runs).toMatchObject([
    { text: 'One great idea, two ', fontFamily: 'Georgia', bold: false },
    { text: 'great ideas.', fontFamily: 'Courier New', bold: true },
  ]);
});

it('keeps comment replies and resolution through a PowerPoint template round trip', async () => {
  const project = await createProject();
  const first = project.deck.slides[0];
  first.dirty = true;
  first.comments = [{ id: 'root', author: 'Reviewer', text: 'Needs a title', date: '2026-01-01T12:00:00Z' }];
  const saved = await importPptx(await exportPptx(project, project.deck, neverRender), 'Comments.pptx');
  const slide = saved.deck.slides[0];
  slide.comments![0].resolved = true;
  slide.comments!.push({
    id: 'reply',
    author: 'Editor',
    text: 'Done',
    date: '2026-01-01T12:05:00Z',
    replyTo: 'root',
  });
  slide.commentThreadsDirty = slide.dirty = true;
  const bytes = await exportPptx(saved, saved.deck, neverRender, undefined, 'potx');
  const template = await JSZip.loadAsync(bytes);
  expect(await template.file('[Content_Types].xml')!.async('string')).toContain(
    'presentationml.template.main+xml',
  );
  const restored = await importPptx(bytes, 'Slides.potx');
  expect(restored.deck.name).toBe('Slides');
  expect(restored.deck.slides[0].comments).toMatchObject([
    { id: 'root', resolved: true },
    { id: 'reply', replyTo: 'root' },
  ]);
  const presentation = await exportPptx(restored, restored.deck, neverRender);
  const zip = await JSZip.loadAsync(presentation);
  expect(await zip.file('[Content_Types].xml')!.async('string')).toContain(
    'presentationml.presentation.main+xml',
  );
});
