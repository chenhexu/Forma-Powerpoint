export const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  am3d: 'http://schemas.microsoft.com/office/drawing/2017/model3d',
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  p15: 'http://schemas.microsoft.com/office/powerpoint/2012/main',
  p159: 'http://schemas.microsoft.com/office/powerpoint/2015/09/main',
};
export function parseXml(xml: string): XMLDocument {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('XML document types are not supported.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid XML in this presentation.');
  return doc;
}
export const serialize = (node: Node) => new XMLSerializer().serializeToString(node);
export const all = (node: Document | Element, local: string) =>
  Array.from(node.getElementsByTagNameNS('*', local));
export const first = (node: Document | Element, local: string) => all(node, local)[0];
export const child = (node: Element, local: string) =>
  Array.from(node.children).find((e) => e.localName === local);
export const esc = (s: string | number) =>
  String(s).replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
export const wrapper = (inner: string) =>
  `<root ${Object.entries(NS)
    .map(([p, n]) => `xmlns:${p}="${n}"`)
    .join(' ')}>${inner}</root>`;
export function fragment(doc: Document, xml: string) {
  return doc.importNode(parseXml(wrapper(xml)).documentElement.firstElementChild!, true) as Element;
}
export const relPath = (path: string) => path.replace(/([^/]+)$/, '_rels/$1.rels');
export function resolvePart(from: string, target: string) {
  const bits = (
    target.startsWith('/') ? target.slice(1) : from.slice(0, from.lastIndexOf('/') + 1) + target
  ).split('/');
  const out: string[] = [];
  for (const bit of bits) {
    if (bit === '..') out.pop();
    else if (bit && bit !== '.') out.push(bit);
  }
  return decodeURI(out.join('/'));
}
export function relativePart(from: string, to: string) {
  const a = from.split('/');
  a.pop();
  const b = to.split('/');
  while (a.length && b.length && a[0] === b[0]) {
    a.shift();
    b.shift();
  }
  return '../'.repeat(a.length) + b.join('/');
}
