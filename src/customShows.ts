import type { CustomShow, Slide } from './types';
import { NS, all, child, esc, fragment, resolvePart } from './xml';

const presentationPart = 'ppt/presentation.xml';

function linkedParts(rels: Document) {
  return new Map(
    all(rels, 'Relationship')
      .filter(
        (relation) => relation.getAttribute('Type') === NS.r + '/slide' && relation.getAttribute('Target'),
      )
      .map((relation) => [
        relation.getAttribute('Id'),
        resolvePart(presentationPart, relation.getAttribute('Target')!),
      ]),
  );
}

export function readCustomShows(pres: Document, rels: Document, slides: Slide[]): CustomShow[] {
  const parts = linkedParts(rels);
  const byPart = new Map(slides.map(({ id, part }) => [part, id]));
  return all(pres, 'custShow').flatMap((item) => {
    if (item.namespaceURI !== NS.p) return [];
    const list = child(item, 'sldLst');
    const slideIds = Array.from(list?.children ?? []).flatMap((node) => {
      const part = parts.get(node.getAttributeNS(NS.r, 'id'));
      const id = part && byPart.get(part);
      return id ? [id] : [];
    });
    const id = Number(item.getAttribute('id'));
    return slideIds.length && Number.isSafeInteger(id) && id >= 0
      ? [{ id, name: item.getAttribute('name') || 'Custom Show', slideIds }]
      : [];
  });
}

export function writeCustomShows(pres: Document, rels: Document, slides: Slide[], shows: CustomShow[]) {
  const parts = linkedParts(rels);
  const listEntries = Array.from(child(pres.documentElement, 'sldIdLst')?.children ?? []);
  const targetIds = new Map(
    listEntries.map((entry) => {
      const id = entry.getAttributeNS(NS.r, 'id');
      return [parts.get(id), id];
    }),
  );
  const byId = new Map(slides.map(({ id, part }) => [id, targetIds.get(part)]));
  const old = child(pres.documentElement, 'custShowLst');
  const existing = new Map(
    Array.from(old?.children ?? []).map((element) => [Number(element.getAttribute('id')), element]),
  );
  const list = fragment(pres, '<p:custShowLst/>');
  for (const show of shows) {
    const entries = show.slideIds.flatMap((id) => {
      const target = byId.get(id);
      return target ? [fragment(pres, `<p:sld r:id="${esc(target)}"/>`)] : [];
    });
    if (!entries.length) continue;
    const element = existing.get(show.id) ?? fragment(pres, `<p:custShow id="${show.id}"/>`);
    element.setAttribute('name', show.name);
    const nextSlides = fragment(pres, '<p:sldLst/>');
    nextSlides.append(...entries);
    const previous = child(element, 'sldLst');
    if (previous) previous.replaceWith(nextSlides);
    else element.prepend(nextSlides);
    list.append(element);
  }
  if (old) {
    if (list.children.length) old.replaceWith(list);
    else old.remove();
  } else if (list.children.length) {
    const following = [
      'photoAlbum',
      'custDataLst',
      'kinsoku',
      'defaultTextStyle',
      'modifyVerifier',
      'extLst',
    ];
    const before = Array.from(pres.documentElement.children).find((node) =>
      following.includes(node.localName),
    );
    pres.documentElement.insertBefore(list, before ?? null);
  }
}
