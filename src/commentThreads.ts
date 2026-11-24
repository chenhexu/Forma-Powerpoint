import { uid, type SlideComment } from './types';
import { all, child, fragment } from './xml';

const threadNamespace = 'urn:forma:presentation:comment-thread';
const threadExtension = '{6A77A171-B1EC-47B5-BC21-C184E3CA0F46}';

export function nativeCommentKey(element: Element) {
  return `${element.getAttribute('authorId')}:${element.getAttribute('idx')}`;
}

export function readComment(entry: Element, authors: ReadonlyMap<string | null, string>): SlideComment {
  const metadata = all(entry, 'thread').find((node) => node.namespaceURI === threadNamespace);
  return {
    id: metadata?.getAttribute('id') || uid(),
    author: authors.get(entry.getAttribute('authorId')) || 'Author',
    text: child(entry, 'text')?.textContent || '',
    date: entry.getAttribute('dt') || '',
    imported: true,
    nativeKey: nativeCommentKey(entry),
    replyTo: metadata?.getAttribute('parent') || undefined,
    resolved: metadata?.getAttribute('resolved') === '1' || undefined,
  };
}

export function writeThreadInfo(doc: Document, entry: Element, comment: SlideComment) {
  let list = child(entry, 'extLst');
  if (!list) {
    list = fragment(doc, '<p:extLst/>');
    entry.append(list);
  }
  let extension = Array.from(list.children).find((item) => item.getAttribute('uri') === threadExtension);
  if (!extension) {
    extension = fragment(doc, `<p:ext uri="${threadExtension}"/>`);
    list.append(extension);
  }
  const metadata = doc.createElementNS(threadNamespace, 'forma:thread');
  metadata.setAttribute('id', comment.id);
  if (comment.replyTo) metadata.setAttribute('parent', comment.replyTo);
  if (comment.resolved) metadata.setAttribute('resolved', '1');
  extension.replaceChildren(metadata);
}
