import { nativeCommentKey, readComment, writeThreadInfo } from './commentThreads';
import { readCustomShows, writeCustomShows } from './customShows';
import { pictureExtension } from './pictureEditing';
import { readSpeakerNotes, writeSpeakerNotes } from './speakerNotes';
import { resolvedFont } from './findReplace';
import { baseFontSizeAt, fontSizedSlices, replaceTextRuns, textParagraphs } from './textRuns';
import { convertModelPose, modelDirectionalLights } from './model';
import {
  bulletCharacters,
  listMarker,
  numberingTypes,
  paragraphFormatKeys,
  paragraphMargins,
  runFormatKeys,
} from './textFormat';
import JSZip from 'jszip';
import { connectorFrame, isLine } from './shapeGeometry';
import { addAnimationTiming, readSlideAnimations } from './animationXml';
import {
  nativeTransition,
  parseTransition,
  primaryTransition,
  slideTransitionNode,
  transitionTiming,
  transitions,
} from './transitions';
import {
  chartContentType,
  chartWorkbook,
  chartXml,
  jumpTargets,
  patchTable,
  readChart,
  readTable,
  tableUri,
  tableXml,
  webLink,
  workbookContentType,
} from './insertContent';
import {
  modelCameraDistance,
  modelDisplayFrame,
  modelPreviewKey,
  geometries,
  type Geometry,
  type Alignment,
  type TextRun,
  type ListStyle,
  EMU,
  uid,
  type Asset,
  type BackgroundPaint,
  type SlideTheme,
  type Deck,
  type Project,
  type Slide,
  type SlideLink,
  type SlideObject,
} from './types';
import {
  NS,
  all,
  child,
  esc,
  first,
  fragment,
  parseXml,
  relativePart,
  relPath,
  resolvePart,
  serialize,
  wrapper,
} from './xml';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const MODEL_REL = 'http://schemas.microsoft.com/office/2017/06/relationships/model3d';
const P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
const TRACK_REL = 'http://schemas.microsoft.com/office/2017/04/relationships/track';
const TRACK_URI = '{3AFAAA56-56D3-431D-BCD4-E75A35582382}';
const MEDIA_REL = 'http://schemas.microsoft.com/office/2007/relationships/media';
const COMMENT_CT = 'application/vnd.openxmlformats-officedocument.presentationml.comments+xml';
const AUTHORS_CT = 'application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml';
const MODEL_CT = 'model/gltf.binary';
const FORMA_MODEL_VERSION = '2';
const legacyTableUri = NS.a + '/table';
const MASTER_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml';
const PRESENTATION_CT = 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
const TEMPLATE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml';
const SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const emptyRels = () => parseXml(`<Relationships xmlns="${NS.rel}"/>`);
const toPx = (value: string | null, fallback = 0) => (value === null ? fallback : Number(value) / EMU);
const toEmu = (value: number) => Math.round(value * EMU);
const attrNum = (e: Element | undefined, name: string, fallback = 0) =>
  e ? Number(e.getAttribute(name) ?? fallback) : fallback;
function captureXml(node: Element) {
  const copy = node.cloneNode(true) as Element;
  for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
    for (const attr of Array.from(ancestor.attributes)) {
      if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/' && !copy.hasAttribute(attr.name)) {
        copy.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
      }
    }
  }
  return serialize(copy);
}
const presentationSlides = (doc: Document) =>
  Array.from(child(doc.documentElement, 'sldIdLst')?.children || []).filter(
    (e) => e.namespaceURI === NS.p && e.localName === 'sldId',
  );
const drawingChildren = (tree: Element) =>
  Array.from(tree.children).filter((e) => !['nvGrpSpPr', 'grpSpPr', 'extLst'].includes(e.localName));
export const masterFooterName = 'Forma Master Footer';
export const masterLogoName = 'Forma Master Logo';
const savedLayoutPrefix = 'Forma Layout ';
const masterBrandNames = new Set([masterFooterName, masterLogoName]);
const groupPrefix = 'Forma Group ';
function drawingObjects(tree: Element) {
  return drawingChildren(tree).flatMap<{ raw: Element; groupId?: string }>((node) => {
    const name = node.localName === 'grpSp' && first(node, 'cNvPr')?.getAttribute('name');
    const transform = child(node, 'grpSpPr')?.firstElementChild;
    const identity =
      transform &&
      !['rot', 'flipH', 'flipV'].some((key) => Number(transform.getAttribute(key))) &&
      [
        ['off', 'chOff', 'x', 'y'],
        ['ext', 'chExt', 'cx', 'cy'],
      ].every(([parent, children, x, y]) =>
        [x, y].every(
          (key) =>
            child(transform, parent)?.getAttribute(key) === child(transform, children)?.getAttribute(key),
        ),
      );
    const groupId =
      identity && name && name.startsWith(groupPrefix) ? name.slice(groupPrefix.length) : undefined;
    return groupId
      ? drawingChildren(node).map((raw) => ({ raw, groupId }))
      : [{ raw: node, groupId: undefined }];
  });
}
const fillTags = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'];

function color(node: Element | undefined, palette: Record<string, string>, fallback: string) {
  if (!node) return fallback;
  const rgb = first(node, 'srgbClr');
  if (rgb) return '#' + rgb.getAttribute('val');
  const scheme = first(node, 'schemeClr');
  if (scheme) return palette[scheme.getAttribute('val')!] || fallback;
  return fallback;
}
async function xmlEntry(zip: JSZip, path: string) {
  const f = zip.file(path);
  if (!f) throw new Error(`Missing presentation part: ${path}`);
  return parseXml(await f.async('string'));
}
async function relationships(zip: JSZip, path: string) {
  const f = zip.file(relPath(path));
  return f ? parseXml(await f.async('string')) : emptyRels();
}
async function highestMasterId(zip: JSZip, presentation: Document, rels: Document) {
  let highest = Math.max(2147483647, ...all(presentation, 'sldMasterId').map((node) => attrNum(node, 'id')));
  for (const rel of all(rels, 'Relationship')) {
    if (rel.getAttribute('Type') !== REL + 'slideMaster') continue;
    const part = resolvePart('ppt/presentation.xml', rel.getAttribute('Target')!);
    if (!zip.file(part)) continue;
    const master = await xmlEntry(zip, part);
    for (const layout of all(master, 'sldLayoutId')) highest = Math.max(highest, attrNum(layout, 'id'));
  }
  return highest;
}
function getRel(rels: Document, id: string) {
  return all(rels, 'Relationship').find((e) => e.getAttribute('Id') === id);
}
function related(rels: Document, type: string) {
  return all(rels, 'Relationship').find((e) => e.getAttribute('Type')?.endsWith('/' + type));
}
function legacyCommentRel(rels: Document, type: 'commentAuthors' | 'comments') {
  return all(rels, 'Relationship').find((rel) => rel.getAttribute('Type') === REL + type);
}
function playbackNode(target: Element) {
  const element = target.parentElement?.parentElement;
  const media = element?.parentElement;
  return target.localName === 'spTgt' &&
    target.parentElement?.localName === 'tgtEl' &&
    element?.localName === 'cMediaNode' &&
    media?.namespaceURI === NS.p &&
    (media.localName === 'video' || media.localName === 'audio')
    ? media
    : undefined;
}
function readLink(node: Element | undefined, rels: Document, slidePart: string): SlideLink | undefined {
  const link = node && child(node, 'hlinkClick');
  if (!link) return;
  const action = link.getAttribute('action') || '';
  const jump = jumpTargets.find(([value]) => action === 'ppaction://hlinkshowjump?jump=' + value);
  if (jump) return { type: 'action', jump: jump[0] };
  const rel = getRel(rels, link.getAttributeNS(NS.r, 'id') || '');
  const target = rel?.getAttribute('Target');
  if (!target) return;
  if (rel?.getAttribute('TargetMode') === 'External') {
    const url = webLink(target);
    if (url && rel.getAttribute('Type') === REL + 'hyperlink') return { type: 'web', url };
  } else if (action === 'ppaction://hlinksldjump' && rel?.getAttribute('Type') === REL + 'slide') {
    return { type: 'slide', part: resolvePart(slidePart, target) };
  }
}
function makeAsset(bytes: Uint8Array, mime: string): Asset {
  return { bytes, mime, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })) };
}
export function releaseProject(project: Project, preserve?: Project) {
  const live = new Set(Object.values(preserve?.assets ?? {}).map((asset) => asset.url));
  for (const { url } of Object.values(project.assets)) {
    if (!live.has(url)) URL.revokeObjectURL(url);
  }
}

export async function importPptx(bytes: Uint8Array, name: string): Promise<Project> {
  if (bytes.byteLength > 150 * 1024 * 1024) throw new Error('Please use a presentation smaller than 150 MB.');
  const zip = await JSZip.loadAsync(bytes);
  // Reject extreme packages before decompressing their individual parts.
  const total = Object.values(zip.files).reduce(
    (n, f) => n + ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0),
    0,
  );
  if (total > 600 * 1024 * 1024 || Object.keys(zip.files).length > 20000)
    throw new Error('This presentation is too large to edit safely in the browser.');
  const pres = await xmlEntry(zip, 'ppt/presentation.xml');
  if (pres.documentElement.namespaceURI !== NS.p)
    throw new Error(
      'Only standard Transitional PPTX presentations are supported. Save a standard .pptx copy in PowerPoint first.',
    );
  const presRels = await relationships(zip, 'ppt/presentation.xml');
  const authorTarget = legacyCommentRel(presRels, 'commentAuthors')?.getAttribute('Target');
  const authorPart = authorTarget && zip.file(resolvePart('ppt/presentation.xml', authorTarget));
  const commentAuthors = new Map(
    authorPart
      ? all(parseXml(await authorPart.async('string')), 'cmAuthor').map((author) => [
          author.getAttribute('id'),
          author.getAttribute('name') || 'Author',
        ])
      : [],
  );
  const size = first(pres, 'sldSz');
  const assets: Record<string, Asset> = {};
  const types = await xmlEntry(zip, '[Content_Types].xml');
  async function asset(part: string) {
    if (assets[part]) return part;
    const file = zip.file(part);
    if (!file) return undefined;
    const override = all(types, 'Override').find((e) => e.getAttribute('PartName') === '/' + part);
    const def = all(types, 'Default').find((e) => e.getAttribute('Extension') === part.split('.').pop());
    const mime =
      override?.getAttribute('ContentType') || def?.getAttribute('ContentType') || 'application/octet-stream';
    assets[part] = makeAsset(await file.async('uint8array'), mime);
    return part;
  }
  const savedLayouts: NonNullable<Deck['savedLayouts']> = [];
  for (const relation of all(presRels, 'Relationship')) {
    if (!relation.getAttribute('Type')?.endsWith('/slideMaster')) continue;
    const masterPath = resolvePart('ppt/presentation.xml', relation.getAttribute('Target')!);
    const masterRelationships = await relationships(zip, masterPath);
    for (const layout of all(masterRelationships, 'Relationship')) {
      if (!layout.getAttribute('Type')?.endsWith('/slideLayout')) continue;
      const part = resolvePart(masterPath, layout.getAttribute('Target')!);
      if (!zip.file(part)) continue;
      const doc = await xmlEntry(zip, part);
      const marker = doc.documentElement.getAttribute('matchingName') || '';
      if (!marker.startsWith(savedLayoutPrefix)) continue;
      const id = marker.slice(savedLayoutPrefix.length);
      const root = first(doc, 'spTree');
      const placeholders = drawingChildren(root).flatMap((shape): SlideObject[] => {
        const placeholder = first(shape, 'ph');
        const idx = attrNum(placeholder, 'idx', -1);
        if (idx < 0) return [];
        const properties = first(shape, 'rPr');
        const xf = first(shape, 'xfrm');
        return [
          {
            id: uid(),
            kind: 'text',
            changed: [],
            rotation: attrNum(xf, 'rot') / 60000,
            name: first(shape, 'cNvPr')?.getAttribute('name') || 'Placeholder',
            layoutPlaceholder: idx,
            x: attrNum(first(shape, 'off'), 'x') / EMU,
            y: attrNum(first(shape, 'off'), 'y') / EMU,
            w: attrNum(first(shape, 'ext'), 'cx') / EMU,
            h: attrNum(first(shape, 'ext'), 'cy') / EMU,
            fontSize: attrNum(properties, 'sz', 2100) / 75,
            fontFamily: (properties && child(properties, 'latin')?.getAttribute('typeface')) || undefined,
            text: all(shape, 't')
              .map((node) => node.textContent || '')
              .join('\n'),
            bold: properties?.getAttribute('b') === '1',
            color: color(properties, {}, '#17233b'),
            alignment:
              ({ ctr: 'center', r: 'right', just: 'justify' } as Record<string, Alignment>)[
                first(shape, 'pPr')?.getAttribute('algn') || ''
              ] || 'left',
          },
        ];
      });
      savedLayouts.push({
        id,
        name: first(doc, 'cSld')?.getAttribute('name') || 'Custom Layout',
        placeholders,
        part,
      });
    }
  }
  const sections = all(pres, 'section')
    .filter((e) => e.namespaceURI === P14)
    .map((node) => ({
      id: node.getAttribute('id')!,
      name: node.getAttribute('name') || 'Untitled Section',
      members: new Set(all(node, 'sldId').map((entry) => entry.getAttribute('id'))),
    }));
  let deckTheme: SlideTheme | undefined;
  let deckBranding: SlideObject[] | undefined;
  const masterCache = new Map<string, SlideObject[]>();
  const slides: Slide[] = [];
  try {
    for (const sld of presentationSlides(pres)) {
      const rel = getRel(presRels, sld.getAttributeNS(NS.r, 'id')!);
      if (!rel) throw new Error('A slide relationship is missing.');
      const part = resolvePart('ppt/presentation.xml', rel.getAttribute('Target')!);
      const f = zip.file(part);
      if (!f) throw new Error(`Slide is missing: ${part}`);
      const sourceXml = await f.async('string');
      const doc = parseXml(sourceXml);
      const rels = await relationships(zip, part);
      const layoutRel = related(rels, 'slideLayout');
      const layoutPart = layoutRel ? resolvePart(part, layoutRel.getAttribute('Target')!) : undefined;
      const layout = layoutPart && zip.file(layoutPart) ? await xmlEntry(zip, layoutPart) : undefined;
      const layoutRels = layoutPart ? await relationships(zip, layoutPart) : undefined;
      const masterRel = layoutRels && related(layoutRels, 'slideMaster');
      const masterPart =
        masterRel && layoutPart ? resolvePart(layoutPart, masterRel.getAttribute('Target')!) : undefined;
      const master = masterPart && zip.file(masterPart) ? await xmlEntry(zip, masterPart) : undefined;
      const masterRels = masterPart ? await relationships(zip, masterPart) : undefined;
      const themeRel = masterRels && related(masterRels, 'theme');
      const themePart =
        themeRel && masterPart ? resolvePart(masterPart, themeRel.getAttribute('Target')!) : undefined;
      const theme = themePart && zip.file(themePart) ? await xmlEntry(zip, themePart) : undefined;
      const palette: Record<string, string> = {
        bg1: '#ffffff',
        tx1: '#17233b',
        bg2: '#eeeeee',
        tx2: '#222222',
      };
      const scheme = theme && first(theme, 'clrScheme');
      if (scheme)
        for (const c of Array.from(scheme.children))
          palette[c.localName] =
            '#' +
            (first(c, 'srgbClr')?.getAttribute('val') ||
              first(c, 'sysClr')?.getAttribute('lastClr') ||
              '17233b');
      palette.bg1 = palette.lt1 || palette.bg1;
      palette.tx1 = palette.dk1 || palette.tx1;
      const mapping =
        first(doc, 'overrideClrMapping') ||
        (layout && first(layout, 'overrideClrMapping')) ||
        (master && first(master, 'clrMap'));
      if (mapping)
        for (const a of Array.from(mapping.attributes))
          if (palette[a.value]) palette[a.localName] = palette[a.value];
      if (!deckTheme && theme)
        deckTheme = {
          heading: first(theme, 'majorFont')?.firstElementChild?.getAttribute('typeface') || 'Aptos Display',
          body: first(theme, 'minorFont')?.firstElementChild?.getAttribute('typeface') || 'Aptos',
          accent: palette.accent1 || '#6554c0',
        };
      const backgroundLayers = [
        { bg: first(doc, 'bg'), rels, part },
        { bg: layout && first(layout, 'bg'), rels: layoutRels, part: layoutPart },
        { bg: master && first(master, 'bg'), rels: masterRels, part: masterPart },
      ];
      const backgroundSource = backgroundLayers.find(({ bg }) => bg);
      const bg = backgroundSource?.bg;
      const gradient = bg && first(bg, 'gradFill');
      const pattern = bg && first(bg, 'pattFill');
      const patternName = pattern?.getAttribute('prst');
      const blip = bg && first(bg, 'blip');
      let backgroundPaint: BackgroundPaint | undefined;
      if (gradient) {
        const stops = all(gradient, 'gs').map((stop) => ({
          position: attrNum(stop, 'pos') / 100000,
          color: color(stop, palette, '#ffffff'),
        }));
        if (stops.length > 1)
          backgroundPaint = {
            kind: 'gradient',
            angle: attrNum(first(gradient, 'lin'), 'ang') / 60000,
            stops,
          };
      } else if (
        pattern &&
        (patternName === 'ltHorz' || patternName === 'ltVert' || patternName === 'ltDnDiag')
      ) {
        backgroundPaint = {
          kind: 'pattern',
          pattern: patternName,
          fore: color(child(pattern, 'fgClr'), palette, '#000000'),
          back: color(child(pattern, 'bgClr'), palette, '#ffffff'),
        };
      } else if (blip && backgroundSource?.part && backgroundSource.rels) {
        const rid = blip.getAttributeNS(NS.r, 'embed');
        const target = rid && getRel(backgroundSource.rels, rid)?.getAttribute('Target');
        const key = target && (await asset(resolvePart(backgroundSource.part, target)));
        if (key) backgroundPaint = { kind: 'image', asset: key };
      }
      let branding = (masterPart && masterCache.get(masterPart)) || [];
      if (master && masterPart && masterRels && !masterCache.has(masterPart)) {
        const shapes = first(master, 'spTree');
        branding = [];
        for (const shape of shapes ? drawingChildren(shapes) : []) {
          const name = first(shape, 'cNvPr')?.getAttribute('name');
          if (!name || !masterBrandNames.has(name)) continue;
          const xf = first(shape, 'xfrm');
          if (!xf) continue;
          const off = child(xf, 'off'),
            extent = child(xf, 'ext');
          const object: SlideObject = {
            id: uid(),
            name,
            kind: name === masterLogoName ? 'image' : 'text',
            locked: true,
            changed: [],
            x: toPx(off?.getAttribute('x') ?? null),
            y: toPx(off?.getAttribute('y') ?? null),
            w: toPx(extent?.getAttribute('cx') ?? null),
            h: toPx(extent?.getAttribute('cy') ?? null),
            rotation: attrNum(xf, 'rot') / 60000,
          };
          if (object.kind === 'image') {
            const rid = first(shape, 'blip')?.getAttributeNS(NS.r, 'embed');
            const relation = rid && getRel(masterRels, rid);
            if (relation && relation.getAttribute('TargetMode') !== 'External')
              object.asset = await asset(resolvePart(masterPart, relation.getAttribute('Target')!));
          } else {
            object.text = all(shape, 't')
              .map((node) => node.textContent || '')
              .join('');
            object.fontSize = attrNum(first(shape, 'rPr'), 'sz', 1200) / 75;
            object.color = color(first(shape, 'rPr'), palette, '#17233b');
            object.fontFamily = first(shape, 'latin')?.getAttribute('typeface') || undefined;
          }
          branding.push(object);
        }
        masterCache.set(masterPart, branding);
        if (!deckBranding && branding.length) deckBranding = branding;
      }
      const masterGraphicsHidden = [doc, layout].some((layer) =>
        ['0', 'false'].includes(layer?.documentElement.getAttribute('showMasterSp') || ''),
      );
      const warnings: string[] = [];
      if (
        (layout && first(layout, 'spTree') && drawingChildren(first(layout, 'spTree')!).length) ||
        (master && first(master, 'spTree') && drawingChildren(first(master, 'spTree')!).length)
      )
        warnings.push(
          'Layout and master graphics are preserved; browser rendering shows slide objects only.',
        );
      const animationTiming = first(doc, 'timing');
      const tree = first(doc, 'spTree');
      if (!tree) throw new Error('Slide has no drawing tree.');
      const objects: SlideObject[] = [];
      const referencedShapes = new Set<string>();
      const animationTargets = new Map<string, string>();
      const connectors: { object: SlideObject; from: string; to: string }[] = [];
      for (const element of Array.from(doc.getElementsByTagName('*'))) {
        const target = element.getAttribute('spid');
        if (target && !playbackNode(element)) referencedShapes.add(target);
        if (['stCxn', 'endCxn'].includes(element.localName)) {
          const id = element.getAttribute('id');
          if (id) referencedShapes.add(id);
        }
      }
      for (const [index, { raw, groupId }] of drawingObjects(tree).entries()) {
        const model = first(raw, 'model3d');
        const node =
          raw.localName === 'AlternateContent'
            ? Array.from(first(raw, 'Choice')?.children || [])[0] || raw
            : raw;
        const nv = first(node, 'cNvPr');
        const ph = node.localName === 'sp' ? first(node, 'ph') : undefined;
        const placeholderType = (tag: Element) => {
          const type = tag.getAttribute('type') || 'obj';
          return type === 'ctrTitle' ? 'title' : type;
        };
        const placeholder = (parent: Document | undefined, match: (tag: Element) => boolean) =>
          parent &&
          all(parent, 'sp').find((shape) => {
            const tag = first(shape, 'ph');
            return tag && match(tag);
          });
        const layoutShape =
          ph &&
          placeholder(layout, (tag) => (tag.getAttribute('idx') || '0') === (ph.getAttribute('idx') || '0'));
        const layoutPh = layoutShape && first(layoutShape, 'ph');
        const type = ph && placeholderType(layoutPh || ph);
        const masterShape =
          (type && placeholder(master, (tag) => placeholderType(tag) === (type === 'obj' ? 'body' : type))) ||
          undefined;
        const xf =
          child(node, 'xfrm') ||
          [node, layoutShape, masterShape]
            .map((shape) => {
              const props = shape && child(shape, 'spPr');
              return props && child(props, 'xfrm');
            })
            .find(Boolean);
        const off = xf && child(xf, 'off');
        const ext = xf && child(xf, 'ext');
        const preset = first(node, 'prstGeom');
        const presetName = preset?.getAttribute('prst');
        const straightConnector =
          node.localName === 'cxnSp' && ['line', 'straightConnector1'].includes(presetName || '');
        const shape = straightConnector ? 'line' : presetName;
        const adjustments = (
          preset && child(preset, 'avLst') ? all(child(preset, 'avLst')!, 'gd') : []
        ).flatMap((guide) => {
          const name = guide.getAttribute('name');
          const formula = /^val\s+(-?\d+)$/.exec(guide.getAttribute('fmla') || '');
          return name && formula && Number.isSafeInteger(Number(formula[1]))
            ? [[name, Number(formula[1])] as const]
            : [];
        });
        const tx = child(node, 'txBody');
        const graphic = child(node, 'graphic');
        const data = graphic && child(graphic, 'graphicData');
        const graphicUri = data?.getAttribute('uri');
        const tableElement =
          data && (graphicUri === tableUri || graphicUri === legacyTableUri) ? child(data, 'tbl') : undefined;
        const table = tableElement ? readTable(tableElement) : undefined;
        const chartElement = data?.getAttribute('uri') === NS.c && child(data, 'chart');
        const chartRel = chartElement && getRel(rels, chartElement.getAttributeNS(NS.r, 'id') || '');
        const chartTarget =
          chartRel && chartRel.getAttribute('TargetMode') !== 'External' && chartRel.getAttribute('Target');
        const chartPart = chartTarget && resolvePart(part, chartTarget);
        const chartSource =
          chartPart &&
          /^ppt\/charts\/(?:reuse_[0-9a-f]+_)*forma_chart_/.test(chartPart) &&
          zip.file(chartPart);
        const chart = chartSource ? readChart(parseXml(await chartSource.async('string'))) : undefined;
        const mediaElement =
          node.localName === 'pic' && (first(node, 'videoFile') || first(node, 'audioFile'));
        const mediaLink = mediaElement && getRel(rels, mediaElement.getAttributeNS(NS.r, 'link') || '');
        const mediaTarget =
          mediaLink &&
          mediaLink.getAttribute('TargetMode') !== 'External' &&
          mediaLink.getAttribute('Target');
        const mediaAsset = mediaTarget ? await asset(resolvePart(part, mediaTarget)) : undefined;
        const customGeometry = first(node, 'custGeom');
        const paths = customGeometry ? all(customGeometry, 'path') : [];
        const path = paths.length === 1 ? paths[0] : undefined;
        const commands = path ? Array.from(path.children) : [];
        const isPolyline =
          path?.getAttribute('fill') === 'none' &&
          attrNum(path, 'w') > 0 &&
          attrNum(path, 'h') > 0 &&
          commands.length > 1 &&
          commands.every((command, i) => {
            const point = child(command, 'pt');
            return (
              command.localName === (i === 0 ? 'moveTo' : 'lnTo') &&
              !!point &&
              ['x', 'y'].every((key) => /^-?\d+$/.test(point.getAttribute(key) || ''))
            );
          });
        const customPaths =
          path &&
          attrNum(path, 'w') > 0 &&
          attrNum(path, 'h') > 0 &&
          path.getAttribute('fill') !== 'none' &&
          commands.length <= 2048 &&
          commands.every((command) => ['moveTo', 'lnTo', 'close'].includes(command.localName))
            ? readShapeRings(path, commands)
            : undefined;
        const inkPath = isPolyline ? path : undefined;
        const points =
          inkPath &&
          commands.map((command) => {
            const point = child(command, 'pt');
            return { x: attrNum(point, 'x'), y: attrNum(point, 'y') };
          });
        const kind = model
          ? 'model'
          : table
            ? 'table'
            : chart
              ? 'chart'
              : mediaAsset
                ? 'media'
                : node.localName === 'pic'
                  ? 'image'
                  : straightConnector ||
                      (node.localName === 'sp' &&
                        (points ||
                          customPaths ||
                          ((!shape || geometries.includes(shape as Geometry)) && !customGeometry)))
                    ? tx
                      ? 'text'
                      : 'shape'
                    : 'unsupported';
        const shapeProperties = child(node, 'spPr');
        const shapeFill = Array.from(shapeProperties?.children || []).find((tag) =>
          fillTags.includes(tag.localName),
        );
        const accent = shapeFill && child(shapeFill, 'schemeClr');
        const outline = shapeProperties && child(shapeProperties, 'ln');
        const dash = outline && child(outline, 'prstDash')?.getAttribute('val');
        const o: SlideObject = {
          id: uid(),
          groupId,
          layoutPlaceholder:
            layoutPart && savedLayouts.some(({ part }) => part === layoutPart) && ph
              ? attrNum(ph, 'idx')
              : undefined,
          customPaths,
          hidden: ['1', 'true'].includes(nv?.getAttribute('hidden') || '') || undefined,
          name: nv?.getAttribute('name') || `Object ${index + 1}`,
          kind,
          x: toPx(off?.getAttribute('x') ?? null, 60),
          y: toPx(off?.getAttribute('y') ?? null, 60),
          w: toPx(ext?.getAttribute('cx') ?? null, 200),
          h: toPx(ext?.getAttribute('cy') ?? null, 100),
          rotation: attrNum(xf, 'rot') / 60000,
          flipH: ['1', 'true'].includes(xf?.getAttribute('flipH') || ''),
          flipV: ['1', 'true'].includes(xf?.getAttribute('flipV') || ''),
          sourceXml: captureXml(raw),
          sourcePart: part,
          changed: [],
          fillThemeAccent:
            (accent?.getAttribute('val') === 'accent1' && !accent.children.length) || undefined,
          fill:
            shapeFill?.localName === 'noFill'
              ? 'transparent'
              : color(shapeFill, palette, kind === 'text' ? 'transparent' : '#e4e9f3'),
          outline: outline && {
            color: child(outline, 'noFill') ? 'transparent' : color(outline, palette, palette.tx1),
            width: attrNum(outline, 'w', EMU) / EMU,
            dash: dash === 'dash' || dash === 'dot' ? dash : 'solid',
          },
          geometry: geometries.includes(shape as Geometry) ? (shape as Geometry) : 'rect',
          adjustments: adjustments.length ? Object.fromEntries(adjustments) : undefined,
          altText: nv?.getAttribute('descr') || undefined,
          link: readLink(nv, rels, part),
          table,
          chart,
          slideNumber:
            (node.localName === 'sp' &&
              nv?.getAttribute('descr') === 'Forma slide number' &&
              !!(tx && all(tx, 'fld').some((field) => field.getAttribute('type') === 'slidenum'))) ||
            undefined,
          color: palette.tx1,
        };
        if (kind === 'media' && mediaElement && mediaAsset) {
          o.asset = mediaAsset;
          o.media = mediaElement.localName === 'videoFile' ? 'video' : 'audio';
          const poster = first(node, 'blip');
          const relationship = poster && getRel(rels, poster.getAttributeNS(NS.r, 'embed') || '');
          const posterTarget =
            relationship &&
            relationship.getAttribute('TargetMode') !== 'External' &&
            relationship.getAttribute('Target');
          if (posterTarget) o.preview = await asset(resolvePart(part, posterTarget));
          const resource = first(node, 'media');
          const range = resource && child(resource, 'trim');
          const track = resource && first(resource, 'track');
          const trackRel = track && getRel(rels, track.getAttributeNS(NS.r, 'embed') || '');
          const captions =
            trackRel && trackRel.getAttribute('TargetMode') !== 'External'
              ? await asset(resolvePart(part, trackRel.getAttribute('Target')!))
              : undefined;
          const playback =
            animationTiming &&
            all(animationTiming, 'spTgt').find(
              (target) => target.getAttribute('spid') === nv?.getAttribute('id') && playbackNode(target),
            );
          const mediaNode = playback?.parentElement?.parentElement;
          const clock = mediaNode && child(mediaNode, 'cTn');
          if (resource)
            o.mediaPlayback = {
              start: attrNum(range, 'st') / 1000 || undefined,
              end: attrNum(range, 'end') / 1000 || undefined,
              captions,
              captionLabel: track?.getAttribute('label') || undefined,
              volume: attrNum(mediaNode ?? undefined, 'vol', 100000) / 100000,
              autoplay:
                (clock && child(clock, 'stCondLst')?.firstElementChild?.getAttribute('delay') === '0') ||
                undefined,
              loop: clock?.getAttribute('repeatCount') === 'indefinite' || undefined,
              rewind: clock?.getAttribute('fill') === 'remove' || undefined,
              bookmarks: all(resource, 'bmk').map((item) => ({
                name: item.getAttribute('name') || '',
                time: attrNum(item, 'time') / 1000,
              })),
            };
        }
        if (inkPath && points && points.length > 1) {
          const line = first(node, 'ln');
          const pw = attrNum(inkPath, 'w', 1),
            ph = attrNum(inkPath, 'h', 1);
          o.stroke = {
            points: points.map((p) => ({ x: p.x / pw, y: p.y / ph })),
            color: color(line, palette, '#31264a'),
            width: attrNum(line, 'w', EMU * 3) / EMU,
            opacity: attrNum(line && first(line, 'alpha'), 'val', 100000) / 100000,
          };
          o.fill = 'transparent';
          o.outline = undefined;
        }
        if (kind === 'image') {
          if (presetName === 'roundRect' || presetName === 'ellipse' || presetName === 'triangle')
            o.pictureShape = presetName;
          const blip = first(node, 'blip');
          const alpha = blip && child(blip, 'alphaModFix');
          const luminance = blip && child(blip, 'lum');
          if (alpha) o.pictureOpacity = attrNum(alpha, 'amt', 100000) / 100000;
          if (luminance) o.pictureBrightness = attrNum(luminance, 'bright') / 100000;
          const crop = first(node, 'srcRect');
          if (crop)
            o.crop = ['l', 't', 'r', 'b'].map((k) => attrNum(crop, k) / 100000) as NonNullable<
              SlideObject['crop']
            >;
        }
        if (kind === 'text' && tx) {
          o.text = all(tx, 'p')
            .map((p) =>
              Array.from(p.childNodes)
                .map((n) =>
                  n.nodeType === 1 && (n as Element).localName === 'br'
                    ? '\n'
                    : n.nodeType === 1
                      ? all(n as Element, 't')
                          .map((t) => t.textContent || '')
                          .join('')
                      : '',
                )
                .join(''),
            )
            .join('\n');
          const layoutText = layoutShape && child(layoutShape, 'txBody');
          const masterText = masterShape && child(masterShape, 'txBody');
          const styles = master && first(master, 'txStyles');
          const masterStyle =
            styles && child(styles, type === 'title' ? 'titleStyle' : ph ? 'bodyStyle' : 'otherStyle');
          const sources = [tx, layoutText, masterText];
          const specified = (nodes: (Element | undefined)[], name: string) =>
            nodes.map((node) => node?.getAttribute(name)).find((value) => value != null);
          const spacing = (props: (Element | undefined)[], name: string) => {
            const sp = props.map((p) => p && child(p, name)).find(Boolean);
            const percent = sp && child(sp, 'spcPct');
            const points = sp && child(sp, 'spcPts');
            if (percent) return { value: attrNum(percent, 'val') / 100000, unit: 'ratio' as const };
            if (points) return { value: attrNum(points, 'val') / 75, unit: 'px' as const };
          };
          const themeFont = (kind: string) => {
            const fontSet = theme && first(theme, kind);
            return (fontSet && child(fontSet, 'latin')?.getAttribute('typeface')) || undefined;
          };
          const bodyProps = sources.map((body) => body && child(body, 'bodyPr'));
          const autofit = bodyProps
            .flatMap((body) => Array.from(body?.children || []))
            .find((e) => ['noAutofit', 'normAutofit', 'spAutoFit'].includes(e.localName));
          const anchor = specified(bodyProps, 'anchor');
          o.textAnchor = anchor === 'b' ? 'bottom' : anchor === 'ctr' ? 'middle' : 'top';
          o.columns = Number(specified(bodyProps, 'numCol') || 1);
          o.textInsets = (['tIns', 'rIns', 'bIns', 'lIns'] as const).map(
            (name) =>
              Number(specified(bodyProps, name) ?? (name === 'lIns' || name === 'rIns' ? 91440 : 45720)) /
              EMU,
          ) as NonNullable<SlideObject['textInsets']>;
          const defaultStyle = child(pres.documentElement, 'defaultTextStyle');
          let autoNumber = 0;
          const paragraphs = all(tx, 'p').map((paragraph) => {
            const direct = child(paragraph, 'pPr');
            const level = Math.min(9, Math.max(1, attrNum(direct, 'lvl') + 1));
            const levelName = `lvl${level}pPr`;
            const paragraphStyles = [
              direct,
              ...sources.map((body) => {
                const list = body && child(body, 'lstStyle');
                return list && (child(list, levelName) || child(list, 'defPPr'));
              }),
              masterStyle && child(masterStyle, levelName),
              defaultStyle && child(defaultStyle, levelName),
            ];
            const defaultRuns = paragraphStyles.map((props) => props && child(props, 'defRPr'));
            const alignment = (
              { l: 'left', ctr: 'center', r: 'right', just: 'justify' } as Record<string, Alignment>
            )[specified(paragraphStyles, 'algn') || ''];
            const bulletTag = paragraphStyles
              .flatMap((p) => Array.from(p?.children || []))
              .find((e) => ['buNone', 'buChar', 'buAutoNum'].includes(e.localName));
            if (bulletTag?.localName === 'buAutoNum') {
              const startAt = attrNum(bulletTag, 'startAt', 1);
              autoNumber =
                (direct && child(direct, 'buAutoNum')?.hasAttribute('startAt')
                  ? startAt - 1
                  : autoNumber || startAt - 1) + 1;
            } else autoNumber = 0;
            const autoStyle = Object.entries(numberingTypes).find(
              ([, value]) => value === bulletTag?.getAttribute('type'),
            )?.[0] as ListStyle | undefined;
            const charStyle = Object.entries(bulletCharacters).find(
              ([, value]) => value === bulletTag?.getAttribute('char'),
            )?.[0] as ListStyle | undefined;
            const bullet =
              bulletTag?.localName === 'buChar'
                ? bulletTag.getAttribute('char') || undefined
                : bulletTag?.localName === 'buAutoNum'
                  ? listMarker(autoStyle || 'decimal', autoNumber)
                  : undefined;
            const readRun = (text: string, direct?: Element): TextRun => {
              const backgrounds = direct && child(direct, 'highlight');
              const styles = [direct, ...defaultRuns];
              const underline = specified(styles, 'u');
              return {
                text,
                fontFamily:
                  styles
                    .map((props) => props && child(props, 'latin')?.getAttribute('typeface'))
                    .find(Boolean) || undefined,
                fontSize: Number(specified(styles, 'sz') ?? 2400) / 75,
                color: styles.reduceRight(
                  (fallback, props) => color(props && child(props, 'solidFill'), palette, fallback),
                  palette.tx1,
                ),
                bold: specified(styles, 'b') === '1',
                italic: specified(styles, 'i') === '1',
                underline: !!underline && underline !== 'none',
                strike: ['sngStrike', 'dblStrike'].includes(specified(styles, 'strike') || ''),
                baseline: Number(specified(styles, 'baseline') || 0) / 1000,
                highlight: backgrounds && color(backgrounds, palette, 'transparent'),
                letterSpacing: Number(specified(styles, 'spc') || 0) / 75,
              };
            };
            const runs = Array.from(paragraph.children).flatMap((run) => {
              if (run.localName === 'br') return [readRun('\n', child(run, 'rPr'))];
              const text = child(run, 't');
              return text ? [readRun(text.textContent || '', child(run, 'rPr'))] : [];
            });
            if (!runs.length) runs.push(readRun('', child(paragraph, 'endParaRPr')));
            return {
              runs,
              alignment,
              bullet,
              listStyle: bulletTag?.localName === 'buAutoNum' ? autoStyle : charStyle,
              indentLevel: level - 1,
              left: Number(specified(paragraphStyles, 'marL') || 0) / EMU,
              right: Number(specified(paragraphStyles, 'marR') || 0) / EMU,
              indent: Number(specified(paragraphStyles, 'indent') || 0) / EMU,
              lineHeight: spacing(paragraphStyles, 'lnSpc'),
              before: spacing(paragraphStyles, 'spcBef'),
              after: spacing(paragraphStyles, 'spcAft'),
            };
          });
          const sample = paragraphs[0]?.runs.find((run) => run.text.trim()) || paragraphs[0]?.runs[0];
          o.text = paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).join('\n');
          if (sample) {
            const { text: _, highlight, ...format } = sample;
            Object.assign(o, format);
          }
          o.alignment = paragraphs[0]?.alignment;
          o.listStyle = paragraphs[0]?.listStyle;
          o.indentLevel = paragraphs[0]?.indentLevel;
          o.lineSpacing =
            paragraphs[0]?.lineHeight?.unit === 'ratio' ? paragraphs[0].lineHeight.value : undefined;
          o.textFlow = {
            paragraphs,
            themeFonts: { major: themeFont('majorFont'), minor: themeFont('minorFont') },
            noWrap: specified(bodyProps, 'wrap') === 'none',
            fitTitle:
              type === 'title' && autofit?.localName !== 'noAutofit' && !autofit?.hasAttribute('fontScale'),
            fitWidth: o.w,
            fontScale:
              autofit?.localName === 'normAutofit' ? attrNum(autofit, 'fontScale', 100000) / 100000 : 1,
            lineReduction:
              autofit?.localName === 'normAutofit' ? attrNum(autofit, 'lnSpcReduction') / 100000 : 0,
          };
        }
        if (kind === 'image' || kind === 'model') {
          const blip = model || first(node, 'blip');
          const id = blip?.getAttributeNS(NS.r, 'embed');
          const r = id && getRel(rels, id);
          if (r && r.getAttribute('TargetMode') !== 'External')
            o.asset = await asset(resolvePart(part, r.getAttribute('Target')!));
          if (!o.asset)
            o.warning = 'The embedded asset is missing or linked externally; original XML is preserved.';
          if (model) {
            const raster = first(model, 'raster');
            const b = raster && first(raster, 'blip');
            const pr = b && getRel(rels, b.getAttributeNS(NS.r, 'embed')!);
            if (pr && pr.getAttribute('TargetMode') !== 'External')
              o.preview = await asset(resolvePart(part, pr.getAttribute('Target')!));
            const trans = first(model, 'trans');
            const rot = trans && child(trans, 'rot');
            const angles: [number, number, number] = [
              attrNum(rot, 'ax') / 60000,
              attrNum(rot, 'ay') / 60000,
              attrNum(rot, 'az') / 60000,
            ];
            o.pose =
              raster?.getAttribute('rName') === 'Forma' && raster.getAttribute('rVer') === FORMA_MODEL_VERSION
                ? convertModelPose(angles, 'forma')
                : angles;
            // Only our own normalized model scene is editable. Preserve arbitrary Office camera setups.
            if (first(model, 'raster')?.getAttribute('rName') !== 'Forma') {
              o.locked = true;
              o.warning =
                'Imported 3D camera and lighting are preserved. This model is read-only; insert a GLB to edit a new model.';
            } else if (o.preview) o.modelPreviewKey = modelPreviewKey(o);
          }
        }
        if (kind === 'unsupported') {
          o.locked = true;
          o.warning = `${node.localName} is preserved without editing or full rendering.`;
          const fallback = first(raw, 'Fallback') || (first(node, 'oleObj') && node);
          const image = fallback && first(fallback, 'blip');
          const relationship = image && getRel(rels, image.getAttributeNS(NS.r, 'embed') || '');
          if (relationship && relationship.getAttribute('TargetMode') !== 'External') {
            o.preview = await asset(resolvePart(part, relationship.getAttribute('Target')!));
          }
        }
        if (o.kind !== 'unsupported' && referencedShapes.has(nv?.getAttribute('id') || '')) {
          o.deleteBlocked = true;
          o.warning = [
            o.warning,
            'This object is referenced by a preserved animation or connector and cannot be deleted here.',
          ]
            .filter(Boolean)
            .join(' ');
        }
        const shapeId = nv?.getAttribute('id');
        if (shapeId) animationTargets.set(shapeId, o.id);
        if (straightConnector) {
          const from = first(node, 'stCxn')?.getAttribute('id'),
            to = first(node, 'endCxn')?.getAttribute('id');
          if (from && to) connectors.push({ object: o, from, to });
        }
        objects.push(o);
      }
      for (const { object, from, to } of connectors) {
        const a = animationTargets.get(from),
          b = animationTargets.get(to);
        if (a && b) object.connector = { from: a, to: b };
      }
      const animationData = animationTiming && readSlideAnimations(animationTiming, animationTargets);
      if (animationData?.unpreviewed)
        warnings.push(
          'Some PowerPoint animations are preserved in the file and unavailable in Forma playback.',
        );
      const tr = primaryTransition(slideTransitionNode(doc.documentElement));
      const effect = parseTransition(tr);
      if (effect.transition === 'preserve')
        warnings.push('This transition is preserved but is not previewed.');
      const commentsTarget = legacyCommentRel(rels, 'comments')?.getAttribute('Target');
      const commentsPart = commentsTarget && zip.file(resolvePart(part, commentsTarget));
      const comments = commentsPart
        ? all(parseXml(await commentsPart.async('string')), 'cm').map((entry) =>
            readComment(entry, commentAuthors),
          )
        : undefined;
      slides.push({
        id: uid(),
        part,
        sourceXml,
        objects,
        background: color(bg, palette, '#ffffff'),
        backgroundPaint,
        masterObjects: masterGraphicsHidden ? undefined : branding,
        masterGraphicsHidden,
        savedLayout: savedLayouts.find((layout) => layout.part === layoutPart)?.id,
        sectionId: sections.find(({ members }) => members.has(sld.getAttribute('id')))?.id,
        ...effect,
        ...transitionTiming(tr),
        hidden: ['0', 'false'].includes(doc.documentElement.getAttribute('show') || '') || undefined,
        dirty: false,
        warnings,
        comments,
        speakerNotes: await readSpeakerNotes(zip, part, rels),
        animations: animationData?.animations,
        animationsUnpreviewed: animationData?.unpreviewed,
      });
    }
    if (!slides.length) throw new Error('The presentation contains no slides.');
    return {
      deck: {
        name: name.replace(/\.(?:pptx|potx)$/i, ''),
        width: toPx(size?.getAttribute('cx') ?? null, 1280),
        height: toPx(size?.getAttribute('cy') ?? null, 720),
        slides,
        customShows: readCustomShows(pres, presRels, slides),
        sections: sections.map(({ id, name }) => ({ id, name })),
        theme: deckTheme,
        masterObjects: deckBranding,
        savedLayouts,
      },
      original: bytes,
      assets,
    };
  } catch (e) {
    Object.values(assets).forEach((a) => URL.revokeObjectURL(a.url));
    throw e;
  }
}

function addRelationship(doc: Document, type: string, target: string) {
  let n = 1;
  while (getRel(doc, 'rId' + n)) n++;
  const rel = doc.createElementNS(NS.rel, 'Relationship');
  rel.setAttribute('Id', 'rId' + n);
  rel.setAttribute('Type', type);
  rel.setAttribute('Target', target);
  doc.documentElement.appendChild(rel);
  return 'rId' + n;
}
function ensureType(types: Document, part: string, contentType: string) {
  if (all(types, 'Override').some((e) => e.getAttribute('PartName') === '/' + part)) return;
  const e = types.createElementNS(NS.ct, 'Override');
  e.setAttribute('PartName', '/' + part);
  e.setAttribute('ContentType', contentType);
  types.documentElement.appendChild(e);
}
function ensureDefault(types: Document, ext: string, contentType: string) {
  const existing = all(types, 'Default').find((e) => e.getAttribute('Extension') === ext);
  if (existing) return existing.getAttribute('ContentType') === contentType;
  const element = types.createElementNS(NS.ct, 'Default');
  element.setAttribute('Extension', ext);
  element.setAttribute('ContentType', contentType);
  types.documentElement.insertBefore(element, first(types, 'Override') || null);
  return true;
}
function transform(o: SlideObject) {
  return `<a:xfrm rot="${Math.round(o.rotation * 60000)}"${o.flipH ? ' flipH="1"' : ''}${o.flipV ? ' flipV="1"' : ''}><a:off x="${toEmu(o.x)}" y="${toEmu(o.y)}"/><a:ext cx="${toEmu(o.w)}" cy="${toEmu(o.h)}"/></a:xfrm>`;
}
function nv(o: SlideObject, id: number, content = '') {
  return `<p:cNvPr id="${id}" name="${esc(o.name)}"${o.hidden ? ' hidden="1"' : ''}${o.altText ? ` descr="${esc(o.altText)}"` : ''}>${content}</p:cNvPr>`;
}
function graphicFrameXml(o: SlideObject, id: number, uri: string, data: string) {
  return `<p:graphicFrame><p:nvGraphicFramePr>${nv(o, id)}<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${transform(o).replaceAll('a:xfrm', 'p:xfrm')}<a:graphic><a:graphicData uri="${uri}">${data}</a:graphicData></a:graphic></p:graphicFrame>`;
}
function patchMediaOptions(doc: Document, node: Element, object: SlideObject, caption?: string) {
  const media = first(node, 'media');
  const settings = object.mediaPlayback;
  if (!media || !settings) return;
  for (const name of ['trim', 'bmkLst']) child(media, name)?.remove();
  if (settings.start || settings.end)
    media.prepend(
      fragment(
        doc,
        `<p14:trim st="${Math.round((settings.start || 0) * 1000)}"${settings.end ? ` end="${Math.round(settings.end * 1000)}"` : ''}/>`,
      ),
    );
  if (settings.bookmarks?.length)
    media.insertBefore(
      fragment(
        doc,
        `<p14:bmkLst>${settings.bookmarks
          .map(({ name, time }) => `<p14:bmk name="${esc(name)}" time="${Math.round(time * 1000)}"/>`)
          .join('')}</p14:bmkLst>`,
      ),
      child(media, 'extLst') || null,
    );
  let extensions = child(media, 'extLst');
  if (extensions)
    Array.from(extensions.children)
      .find((item) => item.getAttribute('uri') === TRACK_URI)
      ?.remove();
  if (caption) {
    if (!extensions) {
      extensions = fragment(doc, '<p14:extLst/>');
      media.append(extensions);
    }
    extensions.append(
      fragment(
        doc,
        `<p:ext uri="${TRACK_URI}"><p173:tracksInfo xmlns:p173="http://schemas.microsoft.com/office/powerpoint/2017/3/main" displayLoc="media"><p173:trackLst><p173:track id="{${uid().toUpperCase()}}" label="${esc(settings.captionLabel || 'Captions')}" r:embed="${caption}"/></p173:trackLst></p173:tracksInfo></p:ext>`,
      ),
    );
  }
  if (extensions && !extensions.children.length) extensions.remove();
}
function mediaPictureXml(o: SlideObject, id: number, poster: string, file: string, embed: string) {
  return `<p:pic><p:nvPicPr>${nv(o, id, '<a:hlinkClick r:id="" action="ppaction://media"/>')}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr><a:${o.media}File r:link="${file}"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="${P14}" r:embed="${embed}"/></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${poster}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform(o)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}
function addMediaTiming(
  doc: Document,
  objects: { id: number; type: 'video' | 'audio'; settings?: SlideObject['mediaPlayback'] }[],
) {
  if (!objects.length) return;
  const root = doc.documentElement;
  let timing = child(root, 'timing');
  if (!timing) {
    timing = fragment(doc, '<p:timing/>');
    root.insertBefore(timing, child(root, 'extLst') || null);
  }
  let list = child(timing, 'tnLst');
  if (!list) {
    list = fragment(doc, '<p:tnLst/>');
    timing.prepend(list);
  }
  let next = Math.max(0, ...all(timing, 'cTn').map((node) => attrNum(node, 'id'))) + 1;
  if (!list.children.length) {
    list.append(
      fragment(
        doc,
        `<p:par><p:cTn id="${next++}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst/></p:cTn></p:par>`,
      ),
    );
  }
  const base = all(list, 'cTn').find((node) => node.getAttribute('nodeType') === 'tmRoot');
  if (base && !child(base, 'childTnLst'))
    base.insertBefore(fragment(doc, '<p:childTnLst/>'), child(base, 'subTnLst') || null);
  const container = (base && child(base, 'childTnLst')) || list;
  for (const { id, type, settings } of objects) {
    const original = all(timing, 'spTgt').find(
      (target) => target.getAttribute('spid') === String(id) && playbackNode(target),
    );
    if (original) playbackNode(original)?.remove();
    container.append(
      fragment(
        doc,
        `<p:${type}><p:cMediaNode vol="${Math.round((settings?.volume ?? 0.8) * 100000)}"><p:cTn id="${next++}" fill="${settings?.rewind ? 'remove' : 'hold'}" display="0"${settings?.loop ? ' repeatCount="indefinite"' : ''}><p:stCondLst><p:cond delay="${settings?.autoplay ? '0' : 'indefinite'}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl></p:cMediaNode></p:${type}>`,
      ),
    );
  }
}
function fillXml(fill: string) {
  return fill === 'transparent'
    ? '<a:noFill/>'
    : `<a:solidFill><a:srgbClr val="${esc(fill.replace('#', ''))}"/></a:solidFill>`;
}
const textAlignment = { left: 'l', center: 'ctr', right: 'r', justify: 'just' };
const textAnchors = { top: 't', middle: 'ctr', bottom: 'b' };
const textBodyKeys = ['textAnchor', 'columns'] as const;

function bulletXml(style: ListStyle = 'none') {
  if (style in bulletCharacters)
    return `<a:buChar char="${bulletCharacters[style as keyof typeof bulletCharacters]}"/>`;
  if (style in numberingTypes)
    return `<a:buAutoNum type="${numberingTypes[style as keyof typeof numberingTypes]}"/>`;
  return '<a:buNone/>';
}

function lineSpacingXml(value: number) {
  return `<a:lnSpc><a:spcPct val="${Math.round(value * 100000)}"/></a:lnSpc>`;
}

function textRunAttributes(o: SlideObject) {
  return {
    fontSize: ['sz', Math.round((o.fontSize || 28) * 75)],
    bold: ['b', o.bold ? 1 : 0],
    italic: ['i', o.italic ? 1 : 0],
    underline: ['u', o.underline ? 'sng' : 'none'],
    strike: ['strike', o.strike ? 'sngStrike' : 'noStrike'],
    baseline: ['baseline', Math.round((o.baseline || 0) * 1000)],
    letterSpacing: ['spc', Math.round((o.letterSpacing || 0) * 75)],
  } as const;
}

function textParagraphXml(o: SlideObject) {
  if (!paragraphFormatKeys.some((key) => o[key] !== undefined)) return '';
  const listed = o.listStyle != null && o.listStyle !== 'none';
  const { left, indent } = paragraphMargins(o, listed);
  const margins =
    listed || o.indentLevel !== undefined ? ` marL="${toEmu(left)}" indent="${toEmu(indent)}"` : '';
  return `<a:pPr${margins}${o.indentLevel ? ` lvl="${o.indentLevel}"` : ''}${o.alignment ? ` algn="${textAlignment[o.alignment]}"` : ''}>${o.lineSpacing ? lineSpacingXml(o.lineSpacing) : ''}${o.listStyle ? bulletXml(o.listStyle) : ''}</a:pPr>`;
}

function textXml(o: SlideObject) {
  const pr = `lang="en-US" ${Object.values(textRunAttributes(o))
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ')}`;
  const paragraph = textParagraphXml(o);
  return `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"${o.textAnchor ? ` anchor="${textAnchors[o.textAnchor]}"` : ''}${o.columns ? ` numCol="${o.columns}" spcCol="${toEmu(16)}"` : ''}><a:noAutofit/></a:bodyPr><a:lstStyle/>${(
    o.text || ''
  )
    .split('\n')
    .map((t) => {
      const start = o.slideNumber ? `<a:fld id="{${uid().toUpperCase()}}" type="slidenum">` : '<a:r>';
      const end = o.slideNumber ? '</a:fld>' : '</a:r>';
      return `<a:p>${paragraph}${start}<a:rPr ${pr}>${fillXml(o.color || '#17233b')}${o.fontFamily ? `<a:latin typeface="${esc(o.fontFamily)}"/>` : ''}</a:rPr><a:t>${esc(t)}</a:t>${end}<a:endParaRPr ${pr}/></a:p>`;
    })
    .join('')}</p:txBody>`;
}
function modelRotationXml(o: SlideObject) {
  const [ax, ay, az] = convertModelPose(o.pose ?? [0, 0, 0], 'powerpoint');
  return `<am3d:rot ax="${Math.round(ax * 60000)}" ay="${Math.round(ay * 60000)}" az="${Math.round(az * 60000)}"/>`;
}

function modelLightingXml() {
  // Approximate Forma's hemisphere fill with Office's ambient light. The directional intensities
  // are calibrated to Office's renderer to avoid clipping highlights on light materials.
  return [
    '<am3d:ambientLight><am3d:clr><a:srgbClr val="E1DDEB"/></am3d:clr><am3d:illuminance n="160" d="1000"/></am3d:ambientLight>',
    ...modelDirectionalLights.map(
      ({ color, position: [x, y, z], officeIlluminance }) =>
        `<am3d:dirLight angularRad="0"><am3d:clr><a:srgbClr val="${color.toString(16).padStart(6, '0').toUpperCase()}"/></am3d:clr><am3d:illuminance n="${Math.round(officeIlluminance * 1000)}" d="1000"/><am3d:pos x="${x * 36000000}" y="${y * 36000000}" z="${z * 36000000}"/><am3d:lookAt x="0" y="0" z="0"/></am3d:dirLight>`,
    ),
  ];
}

function modelXml(o: SlideObject, id: number, rid: string, previewId: string) {
  const center = o.modelCenter || [0, 0, 0];
  const size = o.modelSize || 1;
  const ratio = Math.max(1, Math.round(size * 1000000));
  const radius = modelCameraDistance(o.w / o.h);
  const extent = transform({ ...o, x: 0, y: 0, rotation: 0 });
  const localShape = `<am3d:spPr>${extent}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></am3d:spPr>`;
  const camera = `<am3d:camera><am3d:pos x="0" y="0" z="${Math.round(radius * 36000000)}"/><am3d:up dx="0" dy="36000000" dz="0"/><am3d:lookAt x="0" y="0" z="0"/><am3d:perspective fov="2700000"/></am3d:camera>`;
  // Office normalizes the GLB to its scene units before applying the pose.
  const modelTransform = `<am3d:trans><am3d:meterPerModelUnit n="2000000" d="${ratio}"/><am3d:preTrans dx="${Math.round((-center[0] * 72000000) / size)}" dy="${Math.round((-center[1] * 72000000) / size)}" dz="${Math.round((-center[2] * 72000000) / size)}"/><am3d:scale>${['sx', 'sy', 'sz'].map((k) => `<am3d:${k} n="1" d="1"/>`).join('')}</am3d:scale>${modelRotationXml(o)}<am3d:postTrans dx="0" dy="0" dz="0"/></am3d:trans>`;
  return `<mc:AlternateContent xmlns:mc="${NS.mc}"><mc:Choice xmlns:am3d="${NS.am3d}" Requires="am3d">
    <p:graphicFrame><p:nvGraphicFramePr>${nv(o, id)}<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
    ${transform(o).replaceAll('a:xfrm', 'p:xfrm')}<a:graphic><a:graphicData uri="${NS.am3d}"><am3d:model3d r:embed="${rid}">
    ${localShape}${camera}${modelTransform}<am3d:raster rName="Forma" rVer="${FORMA_MODEL_VERSION}"><am3d:blip r:embed="${previewId}"/></am3d:raster><am3d:winViewport/>${modelLightingXml().join('')}
    </am3d:model3d></a:graphicData></a:graphic></p:graphicFrame>
    </mc:Choice><mc:Fallback>${pictureXml(o, id, previewId)}</mc:Fallback></mc:AlternateContent>`;
}
function pictureEffects(o: SlideObject) {
  return (
    (o.pictureOpacity !== undefined && o.pictureOpacity !== 1
      ? `<a:alphaModFix amt="${Math.round(o.pictureOpacity * 100000)}"/>`
      : '') + (o.pictureBrightness ? `<a:lum bright="${Math.round(o.pictureBrightness * 100000)}"/>` : '')
  );
}
function pictureXml(o: SlideObject, id: number, rid: string) {
  return `<p:pic><p:nvPicPr>${nv(o, id)}<p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}">${pictureEffects(o)}</a:blip>${cropXml(o.crop)}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform(o)}<a:prstGeom prst="${o.pictureShape || 'rect'}"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}
function cropXml(crop: SlideObject['crop']) {
  if (!crop?.some(Boolean)) return '';
  const [l, t, r, b] = crop.map((value) => Math.round(value * 100000));
  return `<a:srcRect l="${l}" t="${t}" r="${r}" b="${b}"/>`;
}
function outlineXml(o: SlideObject) {
  const outline = o.outline;
  if (!outline || outline.color === 'transparent') return '<a:ln><a:noFill/></a:ln>';
  return `<a:ln w="${toEmu(outline.width)}">${fillXml(outline.color)}<a:prstDash val="${outline.dash}"/></a:ln>`;
}
function readShapeRings(path: Element, commands: Element[]) {
  const rings: NonNullable<SlideObject['customPaths']> = [];
  const w = attrNum(path, 'w'),
    h = attrNum(path, 'h');
  let current: (typeof rings)[number] = [];
  for (const command of commands) {
    if (command.localName === 'close') {
      if (current.length < 3) return;
      rings.push(current);
      current = [];
    } else {
      if (command.localName === 'moveTo' ? current.length : !current.length) return;
      const point = child(command, 'pt');
      if (!point || !['x', 'y'].every((key) => /^-?\d+$/.test(point.getAttribute(key) || ''))) return;
      current.push({ x: attrNum(point, 'x') / w, y: attrNum(point, 'y') / h });
    }
  }
  return !current.length && rings.length ? rings : undefined;
}
function shapeGeometryXml(o: SlideObject) {
  const unit = 100000;
  if (o.customPaths) {
    const paths = o.customPaths
      .map(
        (ring) =>
          ring
            .map(({ x, y }, index) => {
              const command = index ? 'lnTo' : 'moveTo';
              return `<a:${command}><a:pt x="${Math.round(x * unit)}" y="${Math.round(y * unit)}"/></a:${command}>`;
            })
            .join('') + '<a:close/>',
      )
      .join('');
    return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${unit}" h="${unit}">${paths}</a:path></a:pathLst></a:custGeom>`;
  }
  const points = o.stroke?.points.map(({ x, y }, index) => {
    const tag = index ? 'lnTo' : 'moveTo';
    return `<a:${tag}><a:pt x="${Math.round(x * unit)}" y="${Math.round(y * unit)}"/></a:${tag}>`;
  });
  return o.stroke
    ? `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${unit}" h="${unit}" fill="none">${points!.join('')}</a:path></a:pathLst></a:custGeom>`
    : `<a:prstGeom prst="${o.geometry || 'rect'}"><a:avLst>${Object.entries(o.adjustments ?? {})
        .map(([name, value]) => `<a:gd name="${esc(name)}" fmla="val ${value}"/>`)
        .join('')}</a:avLst></a:prstGeom>`;
}

function inkLineXml(stroke: NonNullable<SlideObject['stroke']>) {
  const alpha = Math.round((stroke.opacity ?? 1) * 100000);
  const paint = `<a:solidFill><a:srgbClr val="${esc(stroke.color.replace('#', ''))}">${alpha < 100000 ? `<a:alpha val="${alpha}"/>` : ''}</a:srgbClr></a:solidFill>`;
  return `<a:ln w="${toEmu(stroke.width)}" cap="rnd">${paint}<a:round/></a:ln>`;
}

function shapeXml(o: SlideObject, id: number) {
  if (isLine(o)) {
    return `<p:cxnSp><p:nvCxnSpPr>${nv(o, id)}<p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${transform(o)}<a:prstGeom prst="${o.connector ? 'straightConnector1' : 'line'}"><a:avLst/></a:prstGeom>${outlineXml(o)}</p:spPr></p:cxnSp>`;
  }
  const geometry = shapeGeometryXml(o);
  const line = o.stroke ? inkLineXml(o.stroke) : outlineXml(o);
  const fill =
    o.fillThemeAccent && !o.changed.includes('fill')
      ? '<a:solidFill><a:schemeClr val="accent1"/></a:solidFill>'
      : fillXml(o.fill || 'transparent');
  return `<p:sp><p:nvSpPr>${nv(o, id)}<p:cNvSpPr${o.kind === 'text' && o.layoutPlaceholder === undefined ? ' txBox="1"' : ''}/>${
    o.layoutPlaceholder === undefined
      ? '<p:nvPr/>'
      : `<p:nvPr><p:ph type="body" idx="${o.layoutPlaceholder}"/></p:nvPr>`
  }</p:nvSpPr><p:spPr>${transform(o)}${geometry}${fill}${line}</p:spPr>${o.kind === 'text' ? textXml(o) : ''}</p:sp>`;
}
function patchText(doc: Document, body: Element, o: SlideObject) {
  if (o.slideNumber && o.changed.includes('text')) {
    const field = all(body, 'fld').find((node) => node.getAttribute('type') === 'slidenum');
    const text = field && child(field, 't');
    if (text) text.textContent = o.text || '';
    o = { ...o, changed: o.changed.filter((key) => key !== 'text') };
  }
  const paragraphs = Array.from(body.children).filter((e) => e.localName === 'p');
  const nextText = (o.text || '').split('\n');
  const canPatchRuns =
    paragraphs.length === nextText.length &&
    paragraphs.every((p) => {
      const nodes = Array.from(p.children);
      return !nodes.some((e) => ['br', 'fld'].includes(e.localName)) && nodes.some((e) => child(e, 't'));
    });
  if (o.changed.includes('text') && canPatchRuns) {
    paragraphs.forEach((paragraph, index) => {
      const runs = Array.from(paragraph.children).flatMap((run) => child(run, 't') || []);
      const replacements =
        o.changed.includes('replaceText') && o.textFlow?.paragraphs[index]?.runs.map(({ text }) => text);
      const edited =
        replacements && replacements.length === runs.length && replacements.join('') === nextText[index]
          ? replacements
          : replaceTextRuns(
              runs.map((run) => run.textContent || ''),
              nextText[index],
            );
      runs.forEach((run, runIndex) => {
        const text = edited[runIndex];
        if (run.textContent === text) return;
        run.textContent = text;
        run.removeAttributeNS('http://www.w3.org/XML/1998/namespace', 'space');
      });
    });
  } else if (o.changed.includes('text')) {
    const replacement = fragment(doc, textXml(o));
    all(replacement, 'p').forEach((p, index) => {
      const props = child(paragraphs[index] || paragraphs[0] || p, 'pPr');
      if (props) {
        child(p, 'pPr')?.remove();
        p.prepend(props.cloneNode(true));
      }
      body.appendChild(p);
    });
    paragraphs.forEach((p) => p.remove());
  }
  const bodyProperties = child(body, 'bodyPr');
  if (o.changed.includes('text')) bodyProperties?.setAttribute('wrap', 'square');
  if (bodyProperties && ['text', 'fontSize', 'fontSizeRanges'].some((key) => o.changed.includes(key))) {
    for (const tag of ['normAutofit', 'noAutofit', 'spAutoFit']) child(bodyProperties, tag)?.remove();
    const after = Array.from(bodyProperties.children).find((node) =>
      ['scene3d', 'sp3d', 'flatTx', 'extLst'].includes(node.localName),
    );
    bodyProperties.insertBefore(fragment(doc, '<a:noAutofit/>'), after ?? null);
  }
  if (o.changed.includes('textAnchor'))
    bodyProperties?.setAttribute('anchor', textAnchors[o.textAnchor ?? 'top']);
  if (o.changed.includes('columns')) {
    bodyProperties?.setAttribute('numCol', String(o.columns ?? 1));
    bodyProperties?.setAttribute('spcCol', String(toEmu(16)));
  }
  if (paragraphFormatKeys.some((key) => o.changed.includes(key))) {
    for (const [index, paragraph] of all(body, 'p').entries()) {
      let props = child(paragraph, 'pPr');
      if (!props) {
        props = doc.createElementNS(NS.a, 'a:pPr');
        paragraph.prepend(props);
      }
      if (o.changed.includes('alignment')) props.setAttribute('algn', textAlignment[o.alignment || 'left']);
      if (o.changed.includes('lineSpacing')) {
        child(props, 'lnSpc')?.remove();
        props.prepend(fragment(doc, lineSpacingXml(o.lineSpacing ?? 1)));
      }
      if (o.changed.includes('indentLevel')) props.setAttribute('lvl', String(o.indentLevel ?? 0));
      if (o.changed.includes('listStyle') || o.changed.includes('indentLevel')) {
        const style = o.listStyle ?? 'none';
        const listed = o.changed.includes('listStyle')
          ? style !== 'none'
          : !!o.textFlow?.paragraphs[index]?.bullet;
        const { left, indent } = paragraphMargins(o, listed);
        props.setAttribute('marL', String(toEmu(left)));
        props.setAttribute('indent', String(toEmu(indent)));
        if (o.changed.includes('listStyle')) {
          for (const tag of ['buNone', 'buChar', 'buAutoNum', 'buBlip']) child(props, tag)?.remove();
          props.insertBefore(
            fragment(doc, bulletXml(style)),
            child(props, 'tabLst') || child(props, 'defRPr') || child(props, 'extLst') || null,
          );
        }
      }
    }
  }
  if (o.fontReplacements?.length && !o.changed.includes('fontFamily')) {
    const modeled = textParagraphs(o);
    all(body, 'p').forEach((paragraph, index) => {
      const runs = Array.from(paragraph.children).filter((node) =>
        ['r', 'fld', 'br'].includes(node.localName),
      );
      runs.forEach((run, position) => {
        let properties = child(run, 'rPr');
        const typeface =
          (properties && child(properties, 'latin')?.getAttribute('typeface')) ||
          modeled[index]?.runs[position]?.fontFamily ||
          o.fontFamily;
        const before = resolvedFont({ ...o, fontReplacements: undefined }, typeface);
        const after = resolvedFont(o, typeface);
        if (!after || before === after) return;
        if (!properties) {
          properties = fragment(doc, '<a:rPr/>');
          run.prepend(properties);
        }
        let latin = child(properties, 'latin');
        if (!latin) {
          latin = fragment(doc, '<a:latin/>');
          const next = Array.from(properties.children).find((node) =>
            ['ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'].includes(node.localName),
          );
          properties.insertBefore(latin, next ?? null);
        }
        latin.setAttribute('typeface', after);
      });
    });
  }
  if (!runFormatKeys.some((key) => o.changed.includes(key))) return;
  const attrs = textRunAttributes(o);
  for (const run of ['r', 'fld', 'br', 'endParaRPr'].flatMap((tag) => all(body, tag))) {
    let props = run.localName === 'endParaRPr' ? run : child(run, 'rPr');
    if (!props) {
      props = doc.createElementNS(NS.a, 'a:rPr');
      run.prepend(props);
    }
    for (const [key, [name, value]] of Object.entries(attrs)) {
      if (o.changed.includes(key)) props.setAttribute(name, String(value));
    }
    if (o.changed.includes('fontFamily')) {
      const latin = child(props, 'latin') || doc.createElementNS(NS.a, 'a:latin');
      latin.setAttribute('typeface', o.fontFamily || 'Arial');
      if (!latin.parentNode) {
        const after = ['ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'];
        props.insertBefore(
          latin,
          Array.from(props.children).find((el) => after.includes(el.localName)) || null,
        );
      }
    }
    if (o.changed.includes('color')) {
      Array.from(props.children)
        .filter((e) => fillTags.includes(e.localName))
        .forEach((e) => e.remove());
      const fill = fragment(doc, fillXml(o.color || '#17233b'));
      const line = child(props, 'ln');
      props.insertBefore(fill, line ? line.nextSibling : props.firstChild);
    }
  }
}
function applyEditedFontSizes(doc: Document, body: Element, o: SlideObject) {
  const edited = ['text', 'fontSize', 'fontSizeRanges'].some((key) => o.changed.includes(key));
  const scale = edited ? (o.textFlow?.fontScale ?? 1) : 1;
  if (!o.fontSizeRanges?.length && scale === 1) return;
  const paragraphs = scale === 1 ? [] : textParagraphs(o);
  let offset = 0;
  for (const paragraph of all(body, 'p')) {
    for (const original of Array.from(paragraph.children)) {
      if (original.localName === 'br') offset++;
      const originalText = child(original, 't');
      if (!originalText) continue;
      const text = originalText.textContent ?? '';
      const start = offset;
      offset += text.length;
      const slices = fontSizedSlices(text, start, o.fontSizeRanges);
      const parts =
        original.localName === 'fld'
          ? [{ text, size: slices.find((slice) => slice.size !== undefined)?.size }]
          : slices;
      for (const part of parts) {
        const run = parts.length > 1 ? (original.cloneNode(true) as Element) : original;
        if (part.text !== text) {
          const node = child(run, 't')!;
          node.textContent = part.text;
          node.removeAttributeNS('http://www.w3.org/XML/1998/namespace', 'space');
        }
        if (part.size !== undefined || scale !== 1) {
          let props = child(run, 'rPr');
          if (!props) {
            props = doc.createElementNS(NS.a, 'a:rPr');
            run.prepend(props);
          }
          const nativeSize = Number(props.getAttribute('sz')) / 75 || baseFontSizeAt(o, paragraphs, start);
          props.setAttribute('sz', String(Math.round((part.size ?? nativeSize) * scale * 75)));
        }
        if (run !== original) original.before(run);
      }
      if (parts.length > 1) original.remove();
    }
    offset++;
  }
}

function patchObject(doc: Document, o: SlideObject, id: number, upgradeModel: boolean) {
  const el = fragment(doc, o.sourceXml!);
  const frames = el.localName === 'AlternateContent' ? [...all(el, 'graphicFrame'), ...all(el, 'pic')] : [el];
  for (const frame of frames) {
    const props = frame.firstElementChild && child(frame.firstElementChild, 'cNvPr');
    if (props && o.changed.includes('duplicate')) props.setAttribute('id', String(id));
    if (props && o.changed.includes('name')) props.setAttribute('name', o.name);
    if (props && o.changed.includes('hidden')) {
      if (o.hidden) props.setAttribute('hidden', '1');
      else props.removeAttribute('hidden');
    }
    if (props && o.changed.includes('altText')) {
      if (o.altText) props.setAttribute('descr', o.altText);
      else props.removeAttribute('descr');
    }
  }
  if (o.changed.includes('layoutPlaceholder') && o.layoutPlaceholder === undefined) {
    const placeholder = first(el, 'ph');
    if (placeholder && o.kind === 'text') {
      placeholder.remove();
      first(el, 'cNvSpPr')?.setAttribute('txBox', '1');
    }
  }
  if (o.changed.some((k) => ['x', 'y', 'w', 'h', 'rotation', 'flipH', 'flipV'].includes(k))) {
    // Update native and fallback frames, but keep the native model's local scene transform.
    for (const f of frames) {
      const sp = child(f, 'spPr');
      const old = child(f, 'xfrm') || (sp && child(sp, 'xfrm'));
      const xf = fragment(
        doc,
        transform(o).replaceAll('a:xfrm', f.localName === 'graphicFrame' ? 'p:xfrm' : 'a:xfrm'),
      );
      if (old) {
        const off = child(old, 'off'),
          ext = child(old, 'ext');
        if (off) {
          if (o.changed.includes('x')) off.setAttribute('x', String(toEmu(o.x)));
          if (o.changed.includes('y')) off.setAttribute('y', String(toEmu(o.y)));
        } else old.prepend(child(xf, 'off')!);
        if (ext) {
          if (o.changed.includes('w')) ext.setAttribute('cx', String(toEmu(o.w)));
          if (o.changed.includes('h')) ext.setAttribute('cy', String(toEmu(o.h)));
        } else old.append(child(xf, 'ext')!);
        if (o.changed.includes('rotation')) old.setAttribute('rot', String(Math.round(o.rotation * 60000)));
        for (const flip of ['flipH', 'flipV'] as const) {
          if (o.changed.includes(flip)) old.setAttribute(flip, o[flip] ? '1' : '0');
        }
      } else if (sp) sp.insertBefore(xf, sp.firstChild);
    }
  }
  if (o.changed.includes('customPaths') && o.customPaths) {
    const sp = child(el, 'spPr');
    const geometry = sp && (child(sp, 'prstGeom') || child(sp, 'custGeom'));
    if (geometry) geometry.replaceWith(fragment(doc, shapeGeometryXml(o)));
  }
  if (o.changed.includes('adjustments')) {
    const shape = child(el, 'spPr');
    const preset = shape && child(shape, 'prstGeom');
    if (preset) {
      let guides = child(preset, 'avLst');
      if (!guides) {
        guides = fragment(doc, '<a:avLst/>');
        preset.prepend(guides);
      }
      for (const [name, value] of Object.entries(o.adjustments ?? {})) {
        const existing = all(guides, 'gd').find((guide) => guide.getAttribute('name') === name);
        if (existing) {
          if (Number(/^val\s+(-?\d+)$/.exec(existing.getAttribute('fmla') || '')?.[1]) !== value)
            existing.setAttribute('fmla', `val ${value}`);
        } else guides.append(fragment(doc, `<a:gd name="${esc(name)}" fmla="val ${value}"/>`));
      }
    }
  }
  if (o.kind === 'model' && o.changed.some((k) => k === 'w' || k === 'h')) {
    const model = first(el, 'model3d');
    const props = model && child(model, 'spPr');
    const size = props && first(props, 'ext');
    size?.setAttribute('cx', String(toEmu(o.w)));
    size?.setAttribute('cy', String(toEmu(o.h)));
    const camera = model && child(model, 'camera');
    if (camera)
      child(camera, 'pos')?.setAttribute('z', String(Math.round(modelCameraDistance(o.w / o.h) * 36000000)));
  }
  if (o.kind === 'image') {
    if (o.changed.includes('pictureShape')) {
      const sp = child(el, 'spPr');
      const shape = sp && (child(sp, 'prstGeom') || child(sp, 'custGeom'));
      const preset = fragment(doc, `<a:prstGeom prst="${o.pictureShape || 'rect'}"><a:avLst/></a:prstGeom>`);
      if (shape) shape.replaceWith(preset);
      else sp?.insertBefore(preset, child(sp, 'xfrm')?.nextSibling || null);
    }
    const blip = first(el, 'blip');
    if (blip && o.changed.includes('pictureOpacity')) {
      child(blip, 'alphaModFix')?.remove();
      if (o.pictureOpacity !== undefined && o.pictureOpacity !== 1)
        blip.prepend(fragment(doc, `<a:alphaModFix amt="${Math.round(o.pictureOpacity * 100000)}"/>`));
    }
    if (blip && o.changed.includes('pictureBrightness')) {
      let lum = child(blip, 'lum');
      if (!lum) {
        lum = fragment(doc, '<a:lum/>');
        blip.insertBefore(lum, child(blip, 'extLst') || null);
      }
      lum.setAttribute('bright', String(Math.round((o.pictureBrightness || 0) * 100000)));
    }
  }
  if (o.kind === 'image' && o.changed.includes('crop')) {
    const fill = frames.map((frame) => child(frame, 'blipFill')).find(Boolean);
    if (fill) {
      const previous = child(fill, 'srcRect');
      const xml = cropXml(o.crop);
      if (!xml) previous?.remove();
      else if (previous) previous.replaceWith(fragment(doc, xml));
      else fill.insertBefore(fragment(doc, xml), child(fill, 'blip')?.nextSibling ?? fill.firstChild);
    }
  }
  if (o.changed.includes('pose') || upgradeModel) {
    const model = first(el, 'model3d');
    const trans = model && first(model, 'trans');
    if (trans) {
      const rot = fragment(doc, modelRotationXml(o));
      const old = child(trans, 'rot');
      if (old) old.replaceWith(rot);
      else trans.insertBefore(rot, child(trans, 'postTrans') || child(trans, 'extLst') || null);
    }
    if (upgradeModel && model) {
      child(model, 'raster')?.setAttribute('rVer', FORMA_MODEL_VERSION);
      for (const tag of ['ambientLight', 'ptLight']) child(model, tag)?.remove();
      model.append(...modelLightingXml().map((xml) => fragment(doc, xml)));
    }
  }
  if (
    o.kind === 'text' &&
    o.changed.some((k) =>
      [
        'text',
        'fontReplacements',
        'fontSizeRanges',
        ...runFormatKeys,
        ...paragraphFormatKeys,
        ...textBodyKeys,
      ].includes(k),
    )
  ) {
    const old = first(el, 'txBody');
    if (old) patchText(doc, old, o);
  }
  if (o.changed.includes('fill')) {
    const sp = child(el, 'spPr');
    if (sp) {
      Array.from(sp.children)
        .filter((e) => fillTags.includes(e.localName))
        .forEach((e) => e.remove());
      sp.insertBefore(
        fragment(doc, fillXml(o.fill || 'transparent')),
        child(sp, 'ln') || child(sp, 'effectLst') || child(sp, 'extLst') || null,
      );
    }
  }
  if (o.changed.includes('stroke')) {
    const sp = child(el, 'spPr');
    const geometry = sp && (child(sp, 'custGeom') || child(sp, 'prstGeom'));
    if (sp && geometry) {
      geometry.replaceWith(fragment(doc, shapeGeometryXml(o)));
      const line = fragment(doc, o.stroke ? inkLineXml(o.stroke) : outlineXml(o));
      const previous = child(sp, 'ln');
      if (previous) previous.replaceWith(line);
      else
        sp.insertBefore(
          line,
          child(sp, 'effectLst') ||
            child(sp, 'effectDag') ||
            child(sp, 'scene3d') ||
            child(sp, 'sp3d') ||
            child(sp, 'extLst') ||
            null,
        );
    }
  }
  if (o.changed.includes('outline') && !o.changed.includes('stroke')) {
    const sp = child(el, 'spPr');
    if (sp) {
      const line = fragment(doc, outlineXml(o));
      const previous = child(sp, 'ln');
      if (previous) {
        Array.from(previous.children)
          .filter((e) => fillTags.includes(e.localName) || ['prstDash', 'custDash'].includes(e.localName))
          .forEach((e) => e.remove());
        const width = line.getAttribute('w');
        if (width) previous.setAttribute('w', width);
        previous.prepend(...Array.from(line.children));
      } else
        sp.insertBefore(
          line,
          child(sp, 'effectLst') ||
            child(sp, 'effectDag') ||
            child(sp, 'scene3d') ||
            child(sp, 'sp3d') ||
            child(sp, 'extLst') ||
            null,
        );
    }
  }
  return el;
}
function transitionXml(s: Slide, original?: Element) {
  const speed = s.duration >= 1.5 ? 'slow' : s.duration <= 0.5 ? 'fast' : 'med';
  const duration = `xmlns:p14="${P14}" p14:dur="${Math.round(s.duration * 1000)}"`;
  if (s.transition === 'preserve') return;
  const timing = transitionTiming(original);
  const click = s.advanceOnClick ?? timing.advanceOnClick;
  const after = s.advanceAfter === undefined ? timing.advanceAfter : s.advanceAfter;
  const attrs = `spd="${speed}" advClick="${click ? '1' : '0'}"${after != null ? ` advTm="${Math.round(after * 1000)}"` : ''}`;
  const inherited = original
    ? Array.from(original.children).filter((node) => ['sndAc', 'extLst'].includes(node.localName))
    : [];
  const tail = inherited.map(captureXml).join('');
  const { tag, attrs: effectAttrs } = nativeTransition(s.transition, s.transitionOption);
  if (!tag) return `<p:transition ${attrs}>${tail}</p:transition>`;
  const prior = parseTransition(original);
  const originalEffect =
    original && Array.from(original.children).find((node) => !['sndAc', 'extLst'].includes(node.localName));
  const currentOption = s.transitionOption ?? prior.transitionOption;
  const [prefix, localName] = tag.split(':') as [keyof typeof NS, string];
  let effect = `<${tag}${Object.entries(effectAttrs ?? {})
    .map(([name, value]) => ` ${name}="${esc(value)}"`)
    .join('')}/>`;
  if (
    prior.transition === s.transition &&
    originalEffect?.localName === localName &&
    originalEffect.namespaceURI === NS[prefix]
  ) {
    const source = captureXml(originalEffect);
    if (prior.transitionOption === currentOption) effect = source;
    else {
      const copy = fragment(originalEffect.ownerDocument, source);
      const option = transitions[s.transition].options?.find(([value]) => value === currentOption)?.[2];
      for (const [name, value] of Object.entries(option?.attrs ?? {})) copy.setAttribute(name, value);
      effect = serialize(copy);
    }
  }
  const requires = prefix === 'p' ? 'p14' : prefix;
  const fallback = prefix === 'p' ? effect : '<p:fade/>';
  return `<mc:AlternateContent xmlns:mc="${NS.mc}"><mc:Choice xmlns:${requires}="${NS[requires]}" Requires="${requires}"><p:transition ${attrs} ${duration}>${effect}${tail}</p:transition></mc:Choice><mc:Fallback><p:transition ${attrs}>${fallback}${tail}</p:transition></mc:Fallback></mc:AlternateContent>`;
}

export async function exportPptx(
  project: Project,
  deck: Deck,
  renderModel: (o: SlideObject, asset: Asset) => Promise<Uint8Array>,
  modelTextures?: ReadonlyMap<string, Uint8Array>,
  format: 'pptx' | 'potx' = 'pptx',
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(project.original);
  // Old Forma decks stored the editor's Euler angles directly in PowerPoint's rotation fields.
  const legacyModel = (o: SlideObject) => {
    if (o.kind !== 'model' || o.locked) return false;
    const raster = o.sourceXml?.match(/<(?:[\w.-]+:)?raster\b[^>]*>/)?.[0];
    return !!raster && /\brName="Forma"/.test(raster) && /\brVer="1"/.test(raster);
  };
  const legacyTable = (o: SlideObject) => o.kind === 'table' && o.sourceXml?.includes(legacyTableUri);
  const upgradeSlides = new Set(
    deck.slides.filter((slide) => slide.objects.some((o) => legacyModel(o) || legacyTable(o))),
  );
  const assets = { ...project.assets };
  for (const [key, bytes] of modelTextures || []) {
    const asset = assets[key];
    if (!asset) continue;
    assets[key] = { ...asset, bytes };
    // Replace an imported GLB in place so all relationships, model transforms and Morph IDs stay intact.
    if (key.startsWith('ppt/') && zip.file(key)) zip.file(key, bytes);
  }
  const types = await xmlEntry(zip, '[Content_Types].xml');
  const pres = await xmlEntry(zip, 'ppt/presentation.xml');
  const presRels = await relationships(zip, 'ppt/presentation.xml');
  const authorRel = legacyCommentRel(presRels, 'commentAuthors');
  const authorPath = authorRel
    ? resolvePart('ppt/presentation.xml', authorRel.getAttribute('Target')!)
    : 'ppt/commentAuthors.xml';
  let authors: Document | undefined;
  const presentationType = all(types, 'Override').find(
    (node) => node.getAttribute('PartName') === '/ppt/presentation.xml',
  );
  const requestedType = format === 'potx' ? TEMPLATE_CT : PRESENTATION_CT;
  let typesDirty = presentationType?.getAttribute('ContentType') !== requestedType;
  if (presentationType) presentationType.setAttribute('ContentType', requestedType);
  else ensureType(types, 'ppt/presentation.xml', requestedType);
  let presDirty = false;
  const originalOrder = presentationSlides(pres).map((e) =>
    resolvePart(
      'ppt/presentation.xml',
      getRel(presRels, e.getAttributeNS(NS.r, 'id')!)!.getAttribute('Target')!,
    ),
  );
  let size = child(pres.documentElement, 'sldSz');
  const sizeChanged =
    attrNum(size, 'cx', toEmu(1280)) !== toEmu(deck.width) ||
    attrNum(size, 'cy', toEmu(720)) !== toEmu(deck.height);
  if (sizeChanged) {
    if (!size) {
      size = fragment(pres, '<p:sldSz/>');
      pres.documentElement.insertBefore(size, child(pres.documentElement, 'notesSz') || null);
    }
    size.setAttribute('cx', String(toEmu(deck.width)));
    size.setAttribute('cy', String(toEmu(deck.height)));
    size.setAttribute('type', 'custom');
    presDirty = true;
  }
  const token = uid().replaceAll('-', '').slice(0, 12);
  if (
    !sizeChanged &&
    !typesDirty &&
    !deck.sectionsDirty &&
    !deck.customShowsDirty &&
    !deck.themeDirty &&
    !deck.masterDirty &&
    !deck.savedLayouts?.some(({ dirty }) => dirty) &&
    !modelTextures?.size &&
    !upgradeSlides.size &&
    originalOrder.length === deck.slides.length &&
    deck.slides.every(
      (s, i) => !s.dirty && !s.speakerNotesDirty && !s.sourcePart && s.part === originalOrder[i],
    )
  )
    return project.original;
  if (deck.masterDirty) {
    for (const relationship of all(presRels, 'Relationship')) {
      if (!relationship.getAttribute('Type')?.endsWith('/slideMaster')) continue;
      const path = resolvePart('ppt/presentation.xml', relationship.getAttribute('Target')!);
      const master = await xmlEntry(zip, path);
      const rels = await relationships(zip, path);
      const tree = first(master, 'spTree');
      if (!tree) continue;
      for (const existing of drawingChildren(tree)) {
        if (masterBrandNames.has(first(existing, 'cNvPr')?.getAttribute('name') || '')) existing.remove();
      }
      let id = Math.max(1, ...all(tree, 'cNvPr').map((node) => Number(node.getAttribute('id'))));
      for (const object of deck.masterObjects ?? []) {
        let node: Element;
        if (object.kind === 'image' && object.asset) {
          const resource = assets[object.asset];
          const part = object.asset.startsWith('ppt/')
            ? object.asset
            : `ppt/media/forma_${object.asset.replace(/[^a-zA-Z0-9]/g, '')}.${resource.mime === 'image/jpeg' ? 'jpeg' : 'png'}`;
          if (!zip.file(part)) zip.file(part, resource.bytes);
          ensureType(types, part, resource.mime);
          typesDirty = true;
          const target = relativePart(path, part);
          const rid =
            all(rels, 'Relationship')
              .find(
                (node) =>
                  node.getAttribute('Target') === target && node.getAttribute('Type') === REL + 'image',
              )
              ?.getAttribute('Id') || addRelationship(rels, REL + 'image', target);
          node = fragment(master, pictureXml(object, ++id, rid));
        } else node = fragment(master, shapeXml(object, ++id));
        tree.insertBefore(node, child(tree, 'extLst') ?? null);
      }
      zip.file(path, serialize(master));
      zip.file(relPath(path), serialize(rels));
    }
  }
  if (deck.themeDirty && deck.theme) {
    const parts = new Set<string>();
    for (const rel of all(presRels, 'Relationship')) {
      if (!rel.getAttribute('Type')?.endsWith('/slideMaster')) continue;
      const master = resolvePart('ppt/presentation.xml', rel.getAttribute('Target')!);
      const themeRel = related(await relationships(zip, master), 'theme');
      if (themeRel) parts.add(resolvePart(master, themeRel.getAttribute('Target')!));
    }
    for (const part of parts) {
      const doc = await xmlEntry(zip, part);
      for (const [tag, font] of [
        ['majorFont', deck.theme.heading],
        ['minorFont', deck.theme.body],
      ]) {
        const set = first(doc, tag);
        if (set) child(set, 'latin')?.setAttribute('typeface', font);
      }
      const accent = first(doc, 'accent1');
      if (accent)
        accent.replaceChildren(fragment(doc, `<a:srgbClr val="${esc(deck.theme.accent.slice(1))}"/>`));
      zip.file(part, serialize(doc));
    }
  }
  let partIndex = 0;
  function fresh(path: string) {
    return path.replace(/(\.[^/.]+)$/, `_forma_${token}_${++partIndex}$1`);
  }
  async function clonePart(path: string, memo: Map<string, string>): Promise<string> {
    if (memo.has(path)) return memo.get(path)!;
    const dest = fresh(path);
    memo.set(path, dest);
    const file = zip.file(path);
    if (!file) throw new Error(`Cannot duplicate missing part ${path}`);
    zip.file(dest, await file.async('uint8array'));
    const ct = all(types, 'Override')
      .find((e) => e.getAttribute('PartName') === '/' + path)
      ?.getAttribute('ContentType');
    if (ct) {
      ensureType(types, dest, ct);
      typesDirty = true;
    }
    const relFile = zip.file(relPath(path));
    if (relFile) {
      const rels = parseXml(await relFile.async('string'));
      for (const r of all(rels, 'Relationship')) {
        if (r.getAttribute('TargetMode') === 'External') continue;
        const target = resolvePart(path, r.getAttribute('Target')!);
        const type = r.getAttribute('Type')!.split('/').pop()!;
        const share = [
          'image',
          'model3d',
          'slideLayout',
          'slideMaster',
          'notesMaster',
          'theme',
          'slide',
          'audio',
          'video',
          'media',
          'hyperlink',
          'font',
        ].includes(type);
        const cloned = memo.get(target) || (share ? target : await clonePart(target, memo));
        r.setAttribute('Target', relativePart(dest, cloned));
      }
      zip.file(relPath(dest), serialize(rels));
    }
    return dest;
  }
  const savedParts = new Map<string, string>();
  const defaultMaster = related(presRels, 'slideMaster');
  let layoutId: number | undefined;
  for (const layout of deck.savedLayouts ?? []) {
    const part = layout.part ?? `ppt/slideLayouts/forma_layout_${layout.id}.xml`;
    savedParts.set(layout.id, part);
    if (!layout.dirty) continue;
    const masterTarget = defaultMaster?.getAttribute('Target');
    if (!masterTarget) throw new Error('This presentation has no slide master for custom layouts.');
    const rels = await relationships(zip, part);
    const existingMaster = related(rels, 'slideMaster');
    const masterPart = existingMaster
      ? resolvePart(part, existingMaster.getAttribute('Target')!)
      : resolvePart('ppt/presentation.xml', masterTarget);
    if (!existingMaster) addRelationship(rels, REL + 'slideMaster', relativePart(part, masterPart));
    const master = await xmlEntry(zip, masterPart);
    const masterRels = await relationships(zip, masterPart);
    const existingLayout = all(masterRels, 'Relationship').find(
      (rel) =>
        rel.getAttribute('Type') === REL + 'slideLayout' &&
        resolvePart(masterPart, rel.getAttribute('Target')!) === part,
    );
    if (!existingLayout) {
      const rid = addRelationship(masterRels, REL + 'slideLayout', relativePart(masterPart, part));
      const list = child(master.documentElement, 'sldLayoutIdLst');
      if (!list) throw new Error('The slide master has no layout collection.');
      layoutId ??= await highestMasterId(zip, pres, presRels);
      list.append(fragment(master, `<p:sldLayoutId id="${++layoutId}" r:id="${rid}"/>`));
      zip.file(masterPart, serialize(master));
      zip.file(relPath(masterPart), serialize(masterRels));
    }
    const doc = parseXml(
      blankSlide
        .replace(
          'p:sld ',
          `p:sldLayout type="cust" preserve="1" matchingName="${savedLayoutPrefix}${esc(layout.id)}" `,
        )
        .replace('</p:sld>', '</p:sldLayout>'),
    );
    first(doc, 'cSld').setAttribute('name', layout.name);
    const tree = first(doc, 'spTree');
    layout.placeholders.forEach((object, i) => tree.append(fragment(doc, shapeXml(object, i + 2))));
    zip.file(part, serialize(doc));
    zip.file(relPath(part), serialize(rels));
    ensureType(types, part, 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml');
    typesDirty = true;
  }
  for (const slide of deck.slides) {
    if (slide.layoutSource) {
      const source = await relationships(zip, slide.layoutSource);
      const layout = related(source, 'slideLayout');
      if (!layout) throw new Error('The source slide has no usable layout.');
      const rels = emptyRels();
      const target =
        (slide.savedLayout && savedParts.get(slide.savedLayout)) ||
        resolvePart(slide.layoutSource, layout.getAttribute('Target')!);
      addRelationship(rels, REL + 'slideLayout', relativePart(slide.part, target));
      zip.file(relPath(slide.part), serialize(rels));
      ensureType(types, slide.part, SLIDE_CT);
      typesDirty = true;
    } else if (slide.sourcePart) {
      // Seed slide mapping so notes' back-reference points to the duplicated slide.
      const memo = new Map<string, string>([[slide.sourcePart, slide.part]]);
      const sourceRels = await relationships(zip, slide.sourcePart);
      for (const r of all(sourceRels, 'Relationship')) {
        if (r.getAttribute('TargetMode') === 'External') continue;
        const target = resolvePart(slide.sourcePart, r.getAttribute('Target')!);
        const type = r.getAttribute('Type')!.split('/').pop()!;
        const share = [
          'image',
          'model3d',
          'slideLayout',
          'slideMaster',
          'theme',
          'audio',
          'video',
          'media',
          'hyperlink',
          'slide',
        ].includes(type);
        const cloned = share ? target : await clonePart(target, memo);
        r.setAttribute('Target', relativePart(slide.part, cloned));
      }
      zip.file(relPath(slide.part), serialize(sourceRels));
      zip.file(slide.part, slide.sourceXml);
      ensureType(types, slide.part, SLIDE_CT);
      typesDirty = true;
    }
    if (slide.speakerNotesDirty) {
      const slideRels = await relationships(zip, slide.part);
      const flags = await writeSpeakerNotes({
        zip,
        pres,
        presRels,
        types,
        slidePart: slide.part,
        slideRels,
        text: slide.speakerNotes ?? '',
        token,
        addRelationship,
        ensureType,
      });
      presDirty ||= flags.presChanged;
      typesDirty ||= flags.typesChanged;
      if (flags.typesChanged) zip.file(relPath(slide.part), serialize(slideRels));
    }
    if (!slide.dirty && !slide.sourcePart && !upgradeSlides.has(slide)) continue;
    const doc = parseXml(slide.sourceXml);
    const rels = await relationships(zip, slide.part);
    const tree = first(doc, 'spTree')!;
    const oldShapes = drawingChildren(tree);
    const oldMedia = new Set(
      oldShapes
        .filter(
          (shape) => shape.localName === 'pic' && (first(shape, 'videoFile') || first(shape, 'audioFile')),
        )
        .map((shape) => first(shape, 'cNvPr')?.getAttribute('id')),
    );
    const insertedMedia: Parameters<typeof addMediaTiming>[1] = [];
    const animationTargets = new Map<string, { spid: number; object: SlideObject }>();
    const maxId = Math.max(1, ...all(doc, 'cNvPr').map((n) => Number(n.getAttribute('id')) || 1));
    let nextId = maxId + 1;
    oldShapes.forEach((e) => e.remove());
    const assetRel = (key: string, type: string, suffix: string) => {
      const a = assets[key];
      if (!a) throw new Error(`Asset unavailable: ${key}`);
      const path = key.startsWith('ppt/')
        ? key
        : `ppt/media/forma_${key.replace(/[^a-zA-Z0-9]/g, '')}.${suffix}`;
      if (!zip.file(path)) zip.file(path, a.bytes);
      if (type !== MODEL_REL || !ensureDefault(types, 'glb', MODEL_CT))
        ensureType(types, path, type === MODEL_REL ? MODEL_CT : a.mime);
      typesDirty = true;
      const existing = all(rels, 'Relationship').find(
        (r) => r.getAttribute('Type') === type && resolvePart(slide.part, r.getAttribute('Target')!) === path,
      );
      return existing?.getAttribute('Id') || addRelationship(rels, type, relativePart(slide.part, path));
    };
    function applyLink(element: Element, link: SlideLink | undefined) {
      const nv = first(element, 'cNvPr');
      if (!nv) return;
      child(nv, 'hlinkClick')?.remove();
      if (!link) return;
      let rid = '',
        action = '';
      if (link.type === 'slide') {
        if (!deck.slides.some((item) => item.part === link.part)) return;
        rid = addRelationship(rels, REL + 'slide', relativePart(slide.part, link.part));
        action = 'ppaction://hlinksldjump';
      } else if (link.type === 'web') {
        const url = webLink(link.url);
        if (!url) return;
        rid = addRelationship(rels, REL + 'hyperlink', url);
        getRel(rels, rid)!.setAttribute('TargetMode', 'External');
      } else action = 'ppaction://hlinkshowjump?jump=' + link.jump;
      nv.prepend(fragment(doc, `<a:hlinkClick r:id="${rid}"${action ? ` action="${action}"` : ''}/>`));
    }
    async function writeChart(o: SlideObject) {
      const path = `ppt/charts/forma_chart_${token}_${++partIndex}.xml`;
      const workbook = `ppt/embeddings/forma_data_${token}_${partIndex}.xlsx`;
      const chartRels = emptyRels();
      addRelationship(chartRels, REL + 'package', relativePart(path, workbook));
      zip.file(path, chartXml(o.chart!));
      zip.file(relPath(path), serialize(chartRels));
      zip.file(workbook, await chartWorkbook(o.chart!));
      ensureType(types, path, chartContentType);
      ensureType(types, workbook, workbookContentType);
      typesDirty = true;
      return addRelationship(rels, REL + 'chart', relativePart(slide.part, path));
    }
    const groups = new Map<string, Element>();
    const connectorElements = new Map<SlideObject, Element>();
    const groupFrames = new Map<string, SlideObject[]>();
    for (const object of slide.objects) {
      if (!object.groupId) continue;
      const members = groupFrames.get(object.groupId) ?? [];
      members.push(object);
      groupFrames.set(object.groupId, members);
    }
    for (const object of slide.objects) {
      const frame = modelDisplayFrame(object);
      // Office represents Forma's zoom as a regular resize on both the native model and the fallback.
      const o = frame === object ? object : { ...frame, changed: [...frame.changed, 'x', 'y', 'w', 'h'] };
      let el: Element;
      const sourceDoc = o.sourceXml && parseXml(wrapper(o.sourceXml));
      const originalId = sourceDoc && Number(first(sourceDoc, 'cNvPr')?.getAttribute('id'));
      const id = (!o.changed.includes('duplicate') && originalId) || nextId++;
      if (o.sourceXml) {
        el = patchObject(doc, o, id, legacyModel(o));
        if (
          o.changed.includes('duplicate') &&
          o.sourcePart &&
          o.sourcePart !== (slide.sourcePart || slide.part)
        ) {
          const sourceRels = await relationships(zip, o.sourcePart);
          const replaced = new Map<string, string>();
          for (const element of [el, ...Array.from(el.getElementsByTagName('*'))]) {
            for (const attr of Array.from(element.attributes).filter(
              (a) => a.namespaceURI === NS.r && a.value,
            )) {
              const old = getRel(sourceRels, attr.value);
              if (!old) throw new Error(`Copied object is missing relationship ${attr.value}.`);
              const external = old.getAttribute('TargetMode') === 'External';
              const target = old.getAttribute('Target')!;
              let rid = replaced.get(attr.value);
              if (!rid) {
                rid = addRelationship(
                  rels,
                  old.getAttribute('Type')!,
                  external ? target : relativePart(slide.part, resolvePart(o.sourcePart, target)),
                );
                if (external) getRel(rels, rid)!.setAttribute('TargetMode', 'External');
                replaced.set(attr.value, rid);
              }
              attr.value = rid;
            }
          }
        }
        if (o.kind === 'image' && o.changed.includes('asset') && o.asset) {
          const mime = assets[o.asset].mime;
          const blip = first(el, 'blip');
          blip?.removeAttributeNS(NS.r, 'link');
          blip?.setAttributeNS(NS.r, 'r:embed', assetRel(o.asset, REL + 'image', pictureExtension(mime)));
        }
        if (o.kind === 'model' && o.changed.includes('asset') && o.asset) {
          const model = first(el, 'model3d');
          const updated = first(
            fragment(doc, modelXml(o, id, assetRel(o.asset, MODEL_REL, 'glb'), '')),
            'model3d',
          );
          if (model && updated) {
            model.setAttributeNS(NS.r, 'r:embed', updated.getAttributeNS(NS.r, 'embed')!);
            const transform = child(model, 'trans');
            const replacement = child(updated, 'trans');
            for (const part of ['meterPerModelUnit', 'preTrans', 'scale']) {
              const value = replacement && child(replacement, part);
              const old = transform && child(transform, part);
              if (old && value) old.replaceWith(value);
            }
          }
        }
        if (o.kind === 'model' && o.changed.some((k) => ['asset', 'pose', 'w', 'h'].includes(k))) {
          if (!o.asset || !assets[o.asset]) throw new Error('The 3D model asset is missing.');
          const previewBytes = await renderModel(o, assets[o.asset]);
          const path = `ppt/media/preview_${token}_${++partIndex}.png`;
          zip.file(path, previewBytes);
          ensureType(types, path, 'image/png');
          typesDirty = true;
          const rid = addRelationship(rels, REL + 'image', relativePart(slide.part, path));
          const raster = first(el, 'raster');
          const blip = raster && first(raster, 'blip');
          if (blip) blip.setAttributeNS(NS.r, 'r:embed', rid);
          const fallback = first(el, 'Fallback');
          const fb = fallback && first(fallback, 'blip');
          if (fb) fb.setAttributeNS(NS.r, 'r:embed', rid);
        }
        if (o.kind === 'table' && o.table) {
          const graphicData = first(el, 'graphicData');
          if (graphicData?.getAttribute('uri') === legacyTableUri) graphicData.setAttribute('uri', tableUri);
          const table = graphicData && child(graphicData, 'tbl');
          if (table && o.changed.some((key) => ['table', 'w', 'h'].includes(key)))
            patchTable(doc, table, o.table, o.w, o.h, o.changed.includes('w') || o.changed.includes('h'));
        }
        if (o.kind === 'chart' && o.chart && o.changed.includes('chart')) {
          first(el, 'chart')?.setAttributeNS(NS.r, 'r:id', await writeChart(o));
        }
      } else if (o.kind === 'model') {
        if (!o.asset || !assets[o.asset]) throw new Error('The 3D model asset is missing.');
        const rid = assetRel(o.asset, MODEL_REL, 'glb');
        const preview = await renderModel(o, assets[o.asset]);
        const path = `ppt/media/preview_${token}_${++partIndex}.png`;
        zip.file(path, preview);
        ensureType(types, path, 'image/png');
        typesDirty = true;
        const previewId = addRelationship(rels, REL + 'image', relativePart(slide.part, path));
        el = fragment(doc, modelXml(o, id, rid, previewId));
      } else if (o.kind === 'image') {
        const rid = assetRel(o.asset!, REL + 'image', pictureExtension(assets[o.asset!].mime));
        el = fragment(doc, pictureXml(o, id, rid));
      } else if (o.kind === 'table' && o.table) {
        el = fragment(doc, graphicFrameXml(o, id, tableUri, tableXml(o.table, o.w, o.h)));
      } else if (o.kind === 'chart' && o.chart) {
        const rid = await writeChart(o);
        el = fragment(doc, graphicFrameXml(o, id, NS.c, `<c:chart r:id="${rid}"/>`));
      } else if (o.kind === 'media' && o.media && o.asset && o.preview) {
        const suffix =
          assets[o.asset].mime === 'audio/mpeg'
            ? 'mp3'
            : assets[o.asset].mime === 'audio/wav'
              ? 'wav'
              : o.media === 'audio'
                ? 'm4a'
                : 'mp4';
        const file = assetRel(o.asset, REL + o.media, suffix);
        const embed = assetRel(o.asset, MEDIA_REL, suffix);
        const poster = assetRel(o.preview, REL + 'image', 'png');
        el = fragment(doc, mediaPictureXml(o, id, poster, file, embed));
      } else el = fragment(doc, shapeXml(o, id));
      if (
        o.media &&
        (!o.sourceXml || o.changed.includes('mediaPlayback') || o.changed.includes('duplicate'))
      ) {
        const settings = o.mediaPlayback;
        if (settings && (!o.sourceXml || o.changed.includes('mediaPlayback')))
          patchMediaOptions(
            doc,
            el,
            o,
            settings.captions && assets[settings.captions]
              ? assetRel(settings.captions, TRACK_REL, 'vtt')
              : undefined,
          );
        insertedMedia.push({ id, type: o.media, settings });
      }
      if ((!o.sourceXml && o.link) || o.changed.includes('link')) applyLink(el, o.link);
      if (o.kind === 'text') {
        const body = first(el, 'txBody');
        if (body) applyEditedFontSizes(doc, body, o);
      }
      const members = o.groupId && groupFrames.get(o.groupId);
      if (o.groupId && members && members.length > 1) {
        let group = groups.get(o.groupId);
        if (!group) {
          const x = Math.min(...members.map(({ x }) => x));
          const y = Math.min(...members.map(({ y }) => y));
          const w = Math.max(1, ...members.map((o) => o.x + o.w - x));
          const h = Math.max(1, ...members.map((o) => o.y + o.h - y));
          const offset = `x="${toEmu(x)}" y="${toEmu(y)}"`;
          const extent = `cx="${toEmu(w)}" cy="${toEmu(h)}"`;
          group = fragment(
            doc,
            `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${nextId++}" name="${groupPrefix}${esc(o.groupId)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off ${offset}/><a:ext ${extent}/><a:chOff ${offset}/><a:chExt ${extent}/></a:xfrm></p:grpSpPr></p:grpSp>`,
          );
          groups.set(o.groupId, group);
          tree.insertBefore(group, child(tree, 'extLst') || null);
        }
        group.append(el);
      } else tree.insertBefore(el, child(tree, 'extLst') || null);
      if ((!o.sourceXml || o.changed.includes('connector')) && isLine(o)) connectorElements.set(o, el);
      animationTargets.set(o.id, { spid: id, object: o });
    }
    for (const [object, element] of connectorElements) {
      const props = first(element, 'cNvCxnSpPr');
      if (!props) continue;
      child(props, 'stCxn')?.remove();
      child(props, 'endCxn')?.remove();
      if (!object.connector) continue;
      const from = animationTargets.get(object.connector.from),
        to = animationTargets.get(object.connector.to);
      if (!from || !to) continue;
      const sites = connectorFrame(from.object, to.object);
      props.insertBefore(
        fragment(doc, `<a:stCxn id="${from.spid}" idx="${sites.from}"/>`),
        child(props, 'extLst') || null,
      );
      props.insertBefore(
        fragment(doc, `<a:endCxn id="${to.spid}" idx="${sites.to}"/>`),
        child(props, 'extLst') || null,
      );
    }
    if (oldMedia.size) {
      const remaining = new Set(all(tree, 'cNvPr').map((element) => element.getAttribute('id')));
      for (const target of all(doc, 'spTgt')) {
        const id = target.getAttribute('spid');
        if (oldMedia.has(id) && !remaining.has(id)) playbackNode(target)?.remove();
      }
    }
    if (slide.replaceAnimationTiming) {
      for (const timing of all(doc, 'timing')) {
        for (const node of all(timing, 'cTn')) {
          if (['mainSeq', 'interactiveSeq'].includes(node.getAttribute('nodeType') || ''))
            node.parentElement?.remove();
        }
        child(timing, 'bldLst')?.remove();
      }
    }
    addMediaTiming(doc, insertedMedia);
    if (slide.animations?.length)
      addAnimationTiming(doc, slide.animations, animationTargets, deck.width, deck.height);
    if (slide.backgroundDirty) {
      const csld = first(doc, 'cSld')!;
      const paint = slide.backgroundPaint;
      let fill = fillXml(slide.background);
      if (paint?.kind === 'gradient') {
        fill = `<a:gradFill rotWithShape="1"><a:gsLst>${paint.stops
          .map(
            ({ color, position }) =>
              `<a:gs pos="${Math.round(position * 100000)}"><a:srgbClr val="${esc(color.slice(1))}"/></a:gs>`,
          )
          .join(
            '',
          )}</a:gsLst><a:lin ang="${Math.round((((paint.angle % 360) + 360) % 360) * 60000)}" scaled="1"/></a:gradFill>`;
      } else if (paint?.kind === 'pattern') {
        fill = `<a:pattFill prst="${paint.pattern}"><a:fgClr><a:srgbClr val="${esc(paint.fore.slice(1))}"/></a:fgClr><a:bgClr><a:srgbClr val="${esc(paint.back.slice(1))}"/></a:bgClr></a:pattFill>`;
      } else if (paint?.kind === 'image') {
        const rid = assetRel(
          paint.asset,
          REL + 'image',
          assets[paint.asset].mime === 'image/jpeg' ? 'jpeg' : 'png',
        );
        fill = `<a:blipFill rotWithShape="1"><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`;
      }
      const bg = fragment(doc, `<p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>`);
      const previous = child(csld, 'bg');
      if (previous) previous.replaceWith(bg);
      else csld.prepend(bg);
    }
    if (slide.hidden !== undefined) {
      if (slide.hidden) doc.documentElement.setAttribute('show', '0');
      else doc.documentElement.removeAttribute('show');
    }
    if (slide.transitionDirty && slide.transition !== 'preserve') {
      const old = slideTransitionNode(doc.documentElement);
      const next = fragment(doc, transitionXml(slide, primaryTransition(old))!);
      if (old) old.replaceWith(next);
      else
        doc.documentElement.insertBefore(
          next,
          child(doc.documentElement, 'timing') || child(doc.documentElement, 'extLst') || null,
        );
    }
    if (slide.rehearsalTimingDirty && slide.transition === 'preserve' && slide.advanceAfter != null) {
      const existing = slideTransitionNode(doc.documentElement);
      if (existing) {
        const variants = existing.localName === 'transition' ? [existing] : all(existing, 'transition');
        for (const transition of variants)
          transition.setAttribute('advTm', String(Math.round(slide.advanceAfter * 1000)));
      }
    }
    const newComments = slide.comments?.filter((comment) => !comment.imported) ?? [];
    if (newComments.length || slide.commentThreadsDirty) {
      if (!authors) {
        authors = zip.file(authorPath)
          ? await xmlEntry(zip, authorPath)
          : parseXml(`<p:cmAuthorLst xmlns:p="${NS.p}"/>`);
        if (!authorRel) {
          addRelationship(presRels, REL + 'commentAuthors', relativePart('ppt/presentation.xml', authorPath));
          presDirty = true;
        }
        ensureType(types, authorPath, AUTHORS_CT);
        typesDirty = true;
      }
      const commentRel = legacyCommentRel(rels, 'comments');
      const path = commentRel
        ? resolvePart(slide.part, commentRel.getAttribute('Target')!)
        : `ppt/comments/forma_comments_${token}_${++partIndex}.xml`;
      const comments = zip.file(path) ? await xmlEntry(zip, path) : parseXml(`<p:cmLst xmlns:p="${NS.p}"/>`);
      if (!commentRel) addRelationship(rels, REL + 'comments', relativePart(slide.part, path));
      ensureType(types, path, COMMENT_CT);
      if (slide.commentThreadsDirty) {
        const byKey = new Map(all(comments, 'cm').map((entry) => [nativeCommentKey(entry), entry]));
        for (const comment of slide.comments ?? []) {
          const entry = comment.nativeKey && byKey.get(comment.nativeKey);
          if (entry) writeThreadInfo(comments, entry, comment);
        }
      }
      for (const comment of newComments) {
        let author = all(authors, 'cmAuthor').find((node) => node.getAttribute('name') === comment.author);
        if (!author) {
          const id = Math.max(-1, ...all(authors, 'cmAuthor').map((node) => attrNum(node, 'id'))) + 1;
          const initials = comment.author
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase();
          author = fragment(
            authors,
            `<p:cmAuthor id="${id}" name="${esc(comment.author)}" initials="${esc(initials)}" lastIdx="0" clrIdx="${id % 8}"/>`,
          );
          authors.documentElement.insertBefore(author, child(authors.documentElement, 'extLst') || null);
        }
        const number = attrNum(author, 'lastIdx') + 1;
        author.setAttribute('lastIdx', String(number));
        const entry = fragment(
          comments,
          `<p:cm authorId="${author.getAttribute('id')}" dt="${esc(comment.date)}" idx="${number}"><p:pos x="120" y="90"/><p:text>${esc(comment.text)}</p:text></p:cm>`,
        );
        writeThreadInfo(comments, entry, comment);
        comments.documentElement.insertBefore(entry, child(comments.documentElement, 'extLst') || null);
      }
      zip.file(path, serialize(comments));
    }
    zip.file(slide.part, serialize(doc));
    zip.file(relPath(slide.part), serialize(rels));
  }
  if (
    deck.slides.some((s, i) => s.part !== originalOrder[i]) ||
    originalOrder.length !== deck.slides.length
  ) {
    presDirty = true;
    const list = child(pres.documentElement, 'sldIdLst')!;
    const old = presentationSlides(pres);
    let max = Math.max(255, ...old.map((e) => Number(e.getAttribute('id'))));
    const byPart = new Map(
      old.map((e) => [
        resolvePart(
          'ppt/presentation.xml',
          getRel(presRels, e.getAttributeNS(NS.r, 'id')!)!.getAttribute('Target')!,
        ),
        e,
      ]),
    );
    const retained = new Set(deck.slides.map((s) => s.part));
    const removed = [...byPart.entries()].filter(([part]) => !retained.has(part)).map(([, e]) => e);
    const deletedIds = new Set(removed.map((e) => e.getAttribute('id')));
    const deletedRels = new Set(removed.map((e) => e.getAttributeNS(NS.r, 'id')));
    for (const show of all(pres, 'custShow')) {
      for (const entry of all(show, 'sld')) {
        if (deletedRels.has(entry.getAttributeNS(NS.r, 'id'))) entry.remove();
      }
      if (!all(show, 'sld').length) show.remove();
    }
    const originalMemberships = new Map<string | null, Element>();
    const memberships = new Map<string | null, Element>();
    for (const section of all(pres, 'section')) {
      const members = child(section, 'sldIdLst');
      if (!members) continue;
      for (const member of Array.from(members.children)) {
        originalMemberships.set(member.getAttribute('id'), members);
        memberships.set(member.getAttribute('id'), members);
        if (deletedIds.has(member.getAttribute('id'))) member.remove();
      }
    }
    old.forEach((e) => e.remove());
    for (const slide of deck.slides) {
      let el = byPart.get(slide.part);
      if (!el) {
        const rid = addRelationship(
          presRels,
          REL + 'slide',
          relativePart('ppt/presentation.xml', slide.part),
        );
        el = pres.createElementNS(NS.p, 'p:sldId');
        el.setAttribute('id', String(++max));
        el.setAttributeNS(NS.r, 'r:id', rid);
      }
      list.appendChild(el);
      if (slide.sectionAnchor) {
        const sourceId = byPart.get(slide.sectionAnchor)?.getAttribute('id') ?? null;
        const id = el.getAttribute('id');
        const before = memberships.get(id);
        const section = originalMemberships.get(sourceId);
        if (section && section !== before) {
          if (before)
            Array.from(before.children)
              .find((entry) => entry.getAttribute('id') === id)
              ?.remove();
          const entry = pres.createElementNS(
            section.namespaceURI,
            section.prefix ? section.prefix + ':sldId' : 'sldId',
          );
          entry.setAttribute('id', el.getAttribute('id')!);
          section.appendChild(entry);
          memberships.set(el.getAttribute('id'), section);
        }
      }
    }
    const order = new Map(presentationSlides(pres).map((entry, i) => [entry.getAttribute('id'), i]));
    for (const members of new Set(memberships.values())) {
      for (const entry of Array.from(members.children).sort(
        (a, b) =>
          (order.get(a.getAttribute('id')) ?? Infinity) - (order.get(b.getAttribute('id')) ?? Infinity),
      ))
        members.appendChild(entry);
    }
  }
  if (deck.customShowsDirty) {
    writeCustomShows(pres, presRels, deck.slides, deck.customShows ?? []);
    presDirty = true;
  }
  if (deck.sectionsDirty) {
    const existing = all(pres, 'sectionLst').find((node) => node.namespaceURI === P14);
    let extension: Element | undefined = existing?.parentElement ?? undefined;
    existing?.remove();
    if (deck.sections?.length) {
      if (!extension) {
        let extensions = child(pres.documentElement, 'extLst');
        if (!extensions) {
          extensions = pres.createElementNS(NS.p, 'p:extLst');
          pres.documentElement.append(extensions);
        }
        extension = pres.createElementNS(NS.p, 'p:ext');
        extension.setAttribute('uri', '{521415D9-36F7-43E2-AB2F-B90AF26B5E84}');
        extensions.append(extension);
      }
      const ids = presentationSlides(pres);
      const list = pres.createElementNS(P14, 'p14:sectionLst');
      for (const { id, name } of deck.sections) {
        const section = pres.createElementNS(P14, 'p14:section');
        const members = pres.createElementNS(P14, 'p14:sldIdLst');
        section.setAttribute('id', id);
        section.setAttribute('name', name);
        deck.slides.forEach((slide, index) => {
          if (slide.sectionId !== id) return;
          const member = pres.createElementNS(P14, 'p14:sldId');
          member.setAttribute('id', ids[index].getAttribute('id')!);
          members.append(member);
        });
        section.append(members);
        list.append(section);
      }
      extension.append(list);
    } else if (!extension?.children.length) extension?.remove();
    presDirty = true;
  }
  if (presDirty) {
    zip.file('ppt/presentation.xml', serialize(pres));
    zip.file('ppt/_rels/presentation.xml.rels', serialize(presRels));
  }
  if (authors) zip.file(authorPath, serialize(authors));
  if (typesDirty) zip.file('[Content_Types].xml', serialize(types));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export function duplicateSlide(deck: Deck, index: number, morph = true): Deck {
  const original = deck.slides[index];
  const source = original.layoutSource ? undefined : original.sourcePart || original.part;
  const updated = structuredClone(deck);
  const sourceSlide = updated.slides[index];
  if (morph)
    for (const o of sourceSlide.objects) {
      if (o.kind === 'unsupported' || o.locked) continue;
      if (!o.name.startsWith('!!')) {
        o.name = `!!Forma_${o.id}`;
        o.changed = [...new Set([...o.changed, 'name'])];
      }
    }
  if (morph && sourceSlide.objects.some((o) => o.changed.includes('name'))) sourceSlide.dirty = true;
  const copy: Slide = {
    ...structuredClone(sourceSlide),
    id: uid(),
    part: `ppt/slides/slide_${uid().replaceAll('-', '')}.xml`,
    sourcePart: source,
    sectionAnchor: original.sectionAnchor || original.sourcePart || original.part,
    dirty: true,
    transitionDirty: morph || sourceSlide.transitionDirty,
    transition: morph ? 'morph' : sourceSlide.transition,
    transitionOption: morph ? undefined : sourceSlide.transitionOption,
  };
  const copiedIds = new Map(copy.objects.map((o) => [o.id, uid()]));
  copy.objects.forEach((o) => {
    o.id = copiedIds.get(o.id)!;
    if (o.connector)
      o.connector = {
        from: copiedIds.get(o.connector.from) ?? o.connector.from,
        to: copiedIds.get(o.connector.to) ?? o.connector.to,
      };
  });
  copy.animations?.forEach((animation) => {
    animation.target = copiedIds.get(animation.target) ?? animation.target;
    if (animation.trigger) animation.trigger = copiedIds.get(animation.trigger);
  });
  updated.slides.splice(index + 1, 0, copy);
  return updated;
}

const blankSlide = `<p:sld xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
export function insertBlankSlide(deck: Deck, index: number): Deck {
  const anchor = deck.slides[index];
  const slide: Slide = {
    id: uid(),
    part: `ppt/slides/slide_${uid().replaceAll('-', '')}.xml`,
    layoutSource: anchor.layoutSource || anchor.sourcePart || anchor.part,
    sectionAnchor: anchor.sectionAnchor || anchor.sourcePart || anchor.part,
    sectionId: anchor.sectionId,
    sourceXml: deck.masterObjects?.length
      ? blankSlide
      : blankSlide.replace('<p:sld ', '<p:sld showMasterSp="0" '),
    masterObjects: deck.masterObjects?.length ? deck.masterObjects : undefined,
    masterGraphicsHidden: !deck.masterObjects?.length,
    objects: [],
    background: '#ffffff',
    backgroundDirty: true,
    transition: 'none',
    duration: 1,
    dirty: true,
    warnings: [],
  };
  const slides = [...deck.slides];
  slides.splice(index + 1, 0, slide);
  return { ...deck, slides };
}

export async function createProject(): Promise<Project> {
  const zip = new JSZip();
  const rels = (entries: [string, string, string][]) =>
    `<Relationships xmlns="${NS.rel}">${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL + type}" Target="${target}"/>`).join('')}</Relationships>`;
  zip.file('_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
  zip.file(
    'ppt/presentation.xml',
    `<p:presentation xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    rels([
      ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
      ['rId2', 'slide', 'slides/slide1.xml'],
    ]),
  );
  zip.file('ppt/slides/slide1.xml', blankSlide);
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]),
  );
  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    blankSlide
      .replace('p:sld ', 'p:sldLayout type="blank" preserve="1" ')
      .replace('</p:sld>', '</p:sldLayout>'),
  );
  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
  );
  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    blankSlide
      .replace('p:sld ', 'p:sldMaster ')
      .replace(
        '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>',
        '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>',
      )
      .replace('</p:sld>', '</p:sldMaster>'),
  );
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    rels([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ['rId2', 'theme', '../theme/theme1.xml'],
    ]),
  );
  const colors = {
    dk1: '17233B',
    lt1: 'FFFFFF',
    dk2: '344256',
    lt2: 'F4F5F7',
    accent1: '6554C0',
    accent2: '39A99B',
    accent3: 'EBA45F',
    accent4: 'DB657A',
    accent5: '4B89CF',
    accent6: '8A6DB1',
    hlink: '0563C1',
    folHlink: '954F72',
  };
  const fills = `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`;
  zip.file(
    'ppt/theme/theme1.xml',
    `<a:theme xmlns:a="${NS.a}" name="Forma"><a:themeElements><a:clrScheme name="Forma">${Object.entries(
      colors,
    )
      .map(([k, v]) => `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`)
      .join(
        '',
      )}</a:clrScheme><a:fontScheme name="Forma"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Forma"><a:fillStyleLst>${fills.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${`<a:ln w="9525">${fills}<a:prstDash val="solid"/></a:ln>`.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fills.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
  );
  const types = parseXml(
    `<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`,
  );
  for (const [p, t] of Object.entries({
    'ppt/presentation.xml': 'presentation.main',
    'ppt/slides/slide1.xml': 'slide',
    'ppt/slideMasters/slideMaster1.xml': 'slideMaster',
    'ppt/slideLayouts/slideLayout1.xml': 'slideLayout',
  }))
    ensureType(types, p, `application/vnd.openxmlformats-officedocument.presentationml.${t}+xml`);
  ensureType(types, 'ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml');
  zip.file('[Content_Types].xml', serialize(types));
  return importPptx(await zip.generateAsync({ type: 'uint8array' }), 'Untitled presentation');
}

export function newObject(kind: SlideObject['kind'], deck: Deck): SlideObject {
  return {
    id: uid(),
    name: kind === 'model' ? '3D model' : kind === 'text' ? 'Text box' : kind === 'image' ? 'Image' : 'Shape',
    kind,
    x: deck.width * 0.3,
    y: deck.height * 0.3,
    w: deck.width * 0.35,
    h: kind === 'text' ? 90 : deck.height * 0.45,
    rotation: 0,
    changed: [],
    text: kind === 'text' ? 'Your next big idea' : undefined,
    fontSize: 38,
    color: '#17233b',
    fontFamily: kind === 'text' && deck.themeDirty ? deck.theme?.body : undefined,
    fill: kind === 'text' ? 'transparent' : '#dcd7f5',
    geometry: 'rect',
    pose: kind === 'model' ? [0, 0, 0] : undefined,
  };
}
export { makeAsset };

export async function reuseSlides(project: Project, source: Project, positions: number[], after: number) {
  const destination = await JSZip.loadAsync(project.original);
  const foreign = await JSZip.loadAsync(source.original);
  const presPart = 'ppt/presentation.xml';
  const pres = await xmlEntry(destination, presPart);
  const rels = await relationships(destination, presPart);
  const types = await xmlEntry(destination, '[Content_Types].xml');
  const foreignTypes = await xmlEntry(foreign, '[Content_Types].xml');
  const contentTypes = new Map(
    all(foreignTypes, 'Override').map((node) => [
      node.getAttribute('PartName'),
      node.getAttribute('ContentType'),
    ]),
  );
  const defaults = new Map(
    all(foreignTypes, 'Default').map((node) => [
      node.getAttribute('Extension'),
      node.getAttribute('ContentType'),
    ]),
  );
  const token = uid().replaceAll('-', '').slice(0, 12);
  const relocated = new Map<string, string>();
  const pending: string[] = [];
  function locate(part: string) {
    const existing = relocated.get(part);
    if (existing) return existing;
    const path = part.replace(/([^/]+)$/, `reuse_${token}_$1`);
    relocated.set(part, path);
    pending.push(part);
    return path;
  }
  let masterId = await highestMasterId(destination, pres, rels);
  const masterParts: { path: string; id: number }[] = [];
  const authorIds = new Map<string, string>();
  let sharedAuthors: Document | undefined;
  let authorsPath: string | undefined;
  async function reuseCommentAuthors() {
    if (sharedAuthors) return;
    const sourceRels = await relationships(foreign, presPart);
    const sourceRel = legacyCommentRel(sourceRels, 'commentAuthors');
    if (!sourceRel) return;
    const currentRel = legacyCommentRel(rels, 'commentAuthors');
    authorsPath = currentRel
      ? resolvePart(presPart, currentRel.getAttribute('Target')!)
      : 'ppt/commentAuthors.xml';
    sharedAuthors = destination.file(authorsPath)
      ? await xmlEntry(destination, authorsPath)
      : parseXml(`<p:cmAuthorLst xmlns:p="${NS.p}"/>`);
    const incoming = await xmlEntry(foreign, resolvePart(presPart, sourceRel.getAttribute('Target')!));
    let authorId = Math.max(-1, ...all(sharedAuthors, 'cmAuthor').map((node) => attrNum(node, 'id')));
    for (const author of all(incoming, 'cmAuthor')) {
      const id = String(++authorId);
      authorIds.set(author.getAttribute('id')!, id);
      const copy = sharedAuthors.importNode(author, true);
      copy.setAttribute('id', id);
      sharedAuthors.documentElement.append(copy);
    }
    if (!currentRel) addRelationship(rels, REL + 'commentAuthors', relativePart(presPart, authorsPath));
    ensureType(types, authorsPath, AUTHORS_CT);
  }
  const selected = positions.map((index) => locate(source.deck.slides[index].part));
  for (let index = 0; index < pending.length; index++) {
    const part = pending[index];
    const file = foreign.file(part);
    if (!file) throw new Error(`A reused slide is missing the part ${part}.`);
    const path = relocated.get(part)!;
    const type = contentTypes.get('/' + part) || defaults.get(part.split('.').pop()!);
    const savedLayout = source.deck.savedLayouts?.find((layout) => layout.part === part);
    if (savedLayout) {
      const layout = parseXml(await file.async('string'));
      layout.documentElement.setAttribute('matchingName', savedLayoutPrefix + token + '_' + savedLayout.id);
      destination.file(path, serialize(layout));
    } else if (type === MASTER_CT) {
      const master = parseXml(await file.async('string'));
      masterParts.push({ path, id: ++masterId });
      for (const layout of all(master, 'sldLayoutId')) layout.setAttribute('id', String(++masterId));
      destination.file(path, serialize(master));
    } else if (type === COMMENT_CT) {
      await reuseCommentAuthors();
      const comments = parseXml(await file.async('string'));
      for (const comment of all(comments, 'cm')) {
        const id = authorIds.get(comment.getAttribute('authorId')!);
        if (id) comment.setAttribute('authorId', id);
      }
      destination.file(path, serialize(comments));
    } else destination.file(path, await file.async('uint8array'));
    if (type) ensureType(types, path, type);
    if (!foreign.file(relPath(part))) continue;
    const partRels = await relationships(foreign, part);
    for (const rel of all(partRels, 'Relationship')) {
      if (rel.getAttribute('TargetMode') === 'External') continue;
      const target = resolvePart(part, rel.getAttribute('Target')!);
      rel.setAttribute('Target', relativePart(path, locate(target)));
    }
    destination.file(relPath(path), serialize(partRels));
  }
  const list = child(pres.documentElement, 'sldIdLst')!;
  let slideId = Math.max(255, ...presentationSlides(pres).map((node) => Number(node.getAttribute('id'))));
  for (const path of selected) {
    const rel = addRelationship(rels, REL + 'slide', relativePart(presPart, path));
    list.append(fragment(pres, `<p:sldId id="${++slideId}" r:id="${rel}"/>`));
  }
  let masters = child(pres.documentElement, 'sldMasterIdLst');
  if (!masters) {
    masters = fragment(pres, '<p:sldMasterIdLst/>');
    pres.documentElement.prepend(masters);
  }
  for (const { path, id } of masterParts) {
    const rel = addRelationship(rels, REL + 'slideMaster', relativePart(presPart, path));
    masters.append(fragment(pres, `<p:sldMasterId id="${id}" r:id="${rel}"/>`));
  }
  if (authorsPath && sharedAuthors) destination.file(authorsPath, serialize(sharedAuthors));
  destination.file(presPart, serialize(pres));
  destination.file(relPath(presPart), serialize(rels));
  destination.file('[Content_Types].xml', serialize(types));
  const original = await destination.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const imported = await importPptx(original, project.deck.name);
  const assets = { ...project.assets };
  for (const [key, asset] of Object.entries(imported.assets)) {
    if (assets[key]) URL.revokeObjectURL(asset.url);
    else assets[key] = asset;
  }
  const anchor = project.deck.slides[after];
  const copied = imported.deck.slides.slice(-selected.length).map((slide) => ({
    ...slide,
    sectionId: anchor.sectionId,
    sectionAnchor: anchor.sectionAnchor || anchor.sourcePart || anchor.part,
  }));
  const slides = [...project.deck.slides];
  slides.splice(after + 1, 0, ...copied);
  const layouts = imported.deck.savedLayouts?.filter((layout) => layout.id.startsWith(token + '_')) || [];
  return {
    ...project,
    assets,
    original,
    deck: {
      ...project.deck,
      slides,
      sectionsDirty: project.deck.sectionsDirty || !!project.deck.sections?.length,
      savedLayouts: [...(project.deck.savedLayouts ?? []), ...layouts],
    },
  };
}
