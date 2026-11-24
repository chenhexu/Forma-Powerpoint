import type JSZip from 'jszip';
import {
  NS,
  all,
  child,
  esc,
  first,
  fragment,
  parseXml,
  relPath,
  relativePart,
  resolvePart,
  serialize,
} from './xml';

const relationshipType = (name: string) => NS.r + '/' + name;
const contentType = (name: string) =>
  'application/vnd.openxmlformats-officedocument.presentationml.' + name + '+xml';
const emptyRelationships = () => parseXml(`<Relationships xmlns="${NS.rel}"/>`);
const relation = (doc: Document, name: string) =>
  all(doc, 'Relationship').find((node) => node.getAttribute('Type') === relationshipType(name));

function findBody(doc: Document) {
  const tree = first(doc, 'spTree');
  return (
    tree &&
    Array.from(tree.children).find(
      (shape) =>
        shape.namespaceURI === NS.p &&
        shape.localName === 'sp' &&
        child(child(shape, 'nvSpPr') ?? shape, 'nvPr')?.firstElementChild?.getAttribute('type') === 'body',
    )
  );
}
function paragraphText(paragraph: Element) {
  return Array.from(paragraph.children)
    .map((node) => (node.localName === 'br' ? '\n' : (child(node, 't')?.textContent ?? '')))
    .join('');
}

export async function readSpeakerNotes(zip: JSZip, slidePart: string, slideRels: Document) {
  const target = relation(slideRels, 'notesSlide')?.getAttribute('Target');
  const part = target ? zip.file(resolvePart(slidePart, target)) : null;
  if (!part) return;
  try {
    const shape = findBody(parseXml(await part.async('text')));
    const body = shape && child(shape, 'txBody');
    return (
      body &&
      Array.from(body.children)
        .filter((node) => node.localName === 'p')
        .map(paragraphText)
        .join('\n')
    );
  } catch {
    return undefined;
  }
}

const namespaceAttrs = `xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}"`;
const shapeTree =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const shapeFrame = (y: number, height: number) =>
  `<a:xfrm><a:off x="914400" y="${y}"/><a:ext cx="5029200" cy="${height}"/></a:xfrm>`;
const placeholder = (id: number, name: string, type: string, pr = '') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}" idx="${id - 2}"/></p:nvPr></p:nvSpPr><p:spPr>${pr}</p:spPr>${type === 'body' ? '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>' : ''}</p:sp>`;

export async function writeSpeakerNotes({
  zip,
  pres,
  presRels,
  types,
  slidePart,
  slideRels,
  text,
  token,
  addRelationship,
  ensureType,
}: {
  zip: JSZip;
  pres: Document;
  presRels: Document;
  types: Document;
  slidePart: string;
  slideRels: Document;
  text: string;
  token: string;
  addRelationship: (rels: Document, type: string, target: string) => string;
  ensureType: (types: Document, part: string, mime: string) => void;
}) {
  const target = relation(slideRels, 'notesSlide')?.getAttribute('Target');
  if (!target && !text) return { presChanged: false, typesChanged: false };
  let presChanged = false;
  const notesPart = target
    ? resolvePart(slidePart, target)
    : `ppt/notesSlides/${slidePart
        .split('/')
        .at(-1)!
        .replace(/\.xml$/, '_notes_')}${token}.xml`;
  const existing = zip.file(notesPart);
  const notes = parseXml(
    existing
      ? await existing.async('text')
      : `<p:notes ${namespaceAttrs}><p:cSld><p:spTree>${shapeTree}${placeholder(2, 'Slide Image', 'sldImg')}${placeholder(3, 'Speaker Notes', 'body')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`,
  );
  let shape = findBody(notes);
  if (!shape) {
    const tree = first(notes, 'spTree');
    if (!tree) throw new Error('The speaker notes have no drawing tree.');
    const id = Math.max(1, ...all(tree, 'cNvPr').map((node) => Number(node.getAttribute('id')) || 0)) + 1;
    shape = fragment(notes, placeholder(id, 'Speaker Notes', 'body'));
    tree.insertBefore(shape, child(tree, 'extLst') ?? null);
  }
  let body = child(shape, 'txBody');
  if (!body) {
    body = fragment(notes, '<p:txBody><a:bodyPr/><a:lstStyle/></p:txBody>');
    shape.insertBefore(body, child(shape, 'extLst') ?? null);
  }
  const paragraphs = Array.from(body.children).filter((node) => node.localName === 'p');
  const updated = text.replace(/\r\n?/g, '\n').split('\n');
  if (paragraphs.map(paragraphText).join('\n') !== updated.join('\n')) {
    const replacement = updated.map((line, index) => {
      const prior = paragraphs[index];
      if (prior && paragraphText(prior) === line) return prior;
      const paragraph = fragment(notes, `<a:p><a:r><a:t>${esc(line)}</a:t></a:r></a:p>`);
      const props = prior && child(prior, 'pPr');
      if (props) paragraph.prepend(props.cloneNode(true));
      const runStyle = prior && first(prior, 'rPr');
      if (runStyle) first(paragraph, 'r').prepend(runStyle.cloneNode(true));
      return paragraph;
    });
    paragraphs.forEach((p) => p.remove());
    body.append(...replacement);
  }
  zip.file(notesPart, serialize(notes));
  ensureType(types, notesPart, contentType('notesSlide'));
  if (!target || !existing || !zip.file(relPath(notesPart))) {
    const masterTarget = relation(presRels, 'notesMaster')?.getAttribute('Target');
    const master = masterTarget
      ? resolvePart('ppt/presentation.xml', masterTarget)
      : `ppt/notesMasters/forma_notes_${token}.xml`;
    if (!masterTarget) {
      const theme = Object.keys(zip.files).find((path) => /^ppt\/theme\/[^/]+\.xml$/.test(path));
      if (!theme) throw new Error('The presentation theme is required for speaker notes.');
      const clrMap =
        'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
      zip.file(
        master,
        `<p:notesMaster ${namespaceAttrs}><p:cSld><p:spTree>${shapeTree}${placeholder(2, 'Slide Image', 'sldImg', shapeFrame(685800, 2900000))}${placeholder(3, 'Speaker Notes', 'body', shapeFrame(4000000, 4300000))}</p:spTree></p:cSld><p:clrMap ${clrMap}/><p:notesStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></p:notesStyle></p:notesMaster>`,
      );
      const masterRels = emptyRelationships();
      addRelationship(masterRels, relationshipType('theme'), relativePart(master, theme));
      zip.file(relPath(master), serialize(masterRels));
      ensureType(types, master, contentType('notesMaster'));
      const id = addRelationship(
        presRels,
        relationshipType('notesMaster'),
        relativePart('ppt/presentation.xml', master),
      );
      pres.documentElement.insertBefore(
        fragment(pres, `<p:notesMasterIdLst><p:notesMasterId r:id="${id}"/></p:notesMasterIdLst>`),
        Array.from(pres.documentElement.children).find((node) => node.localName !== 'sldMasterIdLst') ?? null,
      );
      presChanged = true;
    }
    const notesRels = emptyRelationships();
    addRelationship(notesRels, relationshipType('notesMaster'), relativePart(notesPart, master));
    addRelationship(notesRels, relationshipType('slide'), relativePart(notesPart, slidePart));
    zip.file(relPath(notesPart), serialize(notesRels));
    if (!target)
      addRelationship(slideRels, relationshipType('notesSlide'), relativePart(slidePart, notesPart));
  }
  return { presChanged, typesChanged: true };
}
