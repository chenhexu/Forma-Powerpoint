type TextPoint = { node: Node; offset: number };
export type TextSelection = { start: number; end: number };
export type TextEditSession = {
  id: string;
  read: () => { text: string; selection?: TextSelection };
  restore: (selection: TextSelection) => void;
};

function textMap(root: HTMLElement) {
  let text = '';
  const starts = new Map<Node, number>();
  const edges = new Map<Node, number[]>();
  const spans: { node: Node; start: number; end: number }[] = [];
  const isBlock = (node: Node | undefined) =>
    node instanceof HTMLElement &&
    ['DIV', 'P'].includes(node.tagName) &&
    !node.hasAttribute('data-editor-art');

  function visit(node: Node) {
    starts.set(node, text.length);
    if (node.nodeType === Node.TEXT_NODE) {
      const start = text.length;
      text += node.nodeValue;
      spans.push({ node, start, end: text.length });
      return;
    }
    if (node instanceof HTMLElement && node.hasAttribute('data-editor-art')) return;
    const children = Array.from(node.childNodes);
    const offsets: number[] = [];
    for (const [index, child] of children.entries()) {
      if (index && (isBlock(child) || isBlock(children[index - 1]))) text += '\n';
      offsets.push(text.length);
      if (child.nodeName === 'BR') {
        // Browsers add a final filler break to keep an empty editing line selectable.
        if (index < children.length - 1) text += '\n';
      } else visit(child);
    }
    edges.set(node, [...offsets, text.length]);
  }
  visit(root);
  function offset(node: Node, index: number) {
    return (
      edges.get(node)?.[index] ?? (starts.get(node) ?? 0) + (node.nodeType === Node.TEXT_NODE ? index : 0)
    );
  }
  function point(index: number, atEnd: boolean): TextPoint {
    const span =
      spans.find(({ start, end }) =>
        atEnd ? index > start && index <= end : index >= start && index < end,
      ) ?? spans.find(({ start, end }) => index >= start && index <= end);
    return span
      ? { node: span.node, offset: index - span.start }
      : { node: root, offset: index ? root.childNodes.length : 0 };
  }
  return { text, offset, point };
}

export function readTextSelection(root: HTMLElement) {
  const map = textMap(root);
  const selected = window.getSelection();
  const range = selected?.rangeCount ? selected.getRangeAt(0) : undefined;
  const selection =
    range && root.contains(range.startContainer) && root.contains(range.endContainer)
      ? {
          start: map.offset(range.startContainer, range.startOffset),
          end: map.offset(range.endContainer, range.endOffset),
        }
      : undefined;
  return { text: map.text, selection };
}

export function textSelectionAt(root: HTMLElement, x: number, y: number, word = false): TextSelection {
  const document = root.ownerDocument;
  const caret = document.caretPositionFromPoint?.(x, y);
  const range = caret ? undefined : document.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? range?.startContainer;
  const map = textMap(root);
  const start =
    node && root.contains(node)
      ? map.offset(node, caret?.offset ?? range?.startOffset ?? 0)
      : y < root.getBoundingClientRect().top
        ? 0
        : map.text.length;
  if (word && node && root.contains(node)) {
    for (const part of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(map.text)) {
      const end = part.index + part.segment.length;
      if (part.isWordLike && start >= part.index && start <= end) return { start: part.index, end };
    }
  }
  return { start, end: start };
}

export function restoreTextSelection(root: HTMLElement, { start, end }: TextSelection) {
  const map = textMap(root);
  const a = map.point(start, false);
  const b = start === end ? a : map.point(end, true);
  root.focus({ preventScroll: true });
  window.getSelection()?.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
}
