import { uid, type Asset, type BackgroundPaint, type Deck, type Slide, type SlideObject } from './types';

export function pasteObjects(deck: Deck, destination: number, items: SlideObject[], sourceId?: string) {
  const next = structuredClone(deck);
  const target = next.slides[destination];
  const source = next.slides.find((slide) => slide.id === sourceId);
  const acrossSlides = !!sourceId && sourceId !== target.id;
  const names = new Set(target.objects.map(({ name }) => name));
  const groupIds = new Map<string, string>();
  const ids = new Map(items.map(({ id }) => [id, uid()]));
  const copies = items.map((item) => {
    const copy = structuredClone(item);
    copy.id = ids.get(item.id)!;
    copy.deleteBlocked = false;
    copy.layoutPlaceholder = undefined;
    const original = source?.objects.find(({ id }) => id === item.id);
    const liveName = original?.name ?? item.name;
    const morphName =
      liveName.startsWith('!!') && (source?.objects.filter(({ name }) => name === liveName).length ?? 0) <= 1
        ? liveName
        : `!!Forma_${item.id}`;
    if (acrossSlides && !names.has(morphName)) {
      copy.name = morphName;
      if (original && original.name !== morphName) {
        original.name = morphName;
        original.changed = [...new Set([...original.changed, 'name'])];
        source!.dirty = true;
      }
    } else {
      copy.name = `${item.name.replace(/^!!/, '')} copy ${copy.id.slice(0, 5)}`;
      copy.x += 24;
      copy.y += 24;
    }
    names.add(copy.name);
    if (copy.groupId) {
      if (!groupIds.has(copy.groupId)) groupIds.set(copy.groupId, uid());
      copy.groupId = groupIds.get(copy.groupId);
    }
    if (copy.connector) {
      const from = ids.get(copy.connector.from);
      const to = ids.get(copy.connector.to);
      copy.connector = from && to ? { from, to } : undefined;
    }
    copy.changed = [
      ...new Set([...copy.changed, 'x', 'y', 'name', 'duplicate', 'connector', 'layoutPlaceholder']),
    ];
    return copy;
  });
  target.objects.push(...copies);
  target.dirty = true;
  return { deck: next, copies };
}

export function slideBackground(slide: Slide, assets: Record<string, Asset>) {
  const paint = slide.backgroundPaint;
  if (!paint) return slide.background;
  if (paint.kind === 'gradient') {
    const stops = paint.stops.map(({ color, position }) => `${color} ${position * 100}%`);
    return `linear-gradient(${paint.angle + 90}deg, ${stops.join(', ')})`;
  }
  if (paint.kind === 'image') {
    const asset = assets[paint.asset];
    return asset ? `url("${asset.url}") center / 100% 100% no-repeat` : slide.background;
  }
  const direction = paint.pattern === 'ltVert' ? '90deg' : paint.pattern === 'ltHorz' ? '0deg' : '45deg';
  return `repeating-linear-gradient(${direction}, ${paint.back} 0 5px, ${paint.fore} 5px 6px)`;
}

export function resizeDeck(deck: Deck, width: number, height: number, fit: boolean): Deck {
  if (!fit) return { ...deck, width, height };
  const scale = Math.min(width / deck.width, height / deck.height);
  return {
    ...deck,
    width,
    height,
    slides: deck.slides.map((slide) => ({
      ...slide,
      dirty: true,
      objects: slide.objects.map((object) => {
        const result = {
          ...object,
          x: (width - deck.width * scale) / 2 + object.x * scale,
          y: (height - deck.height * scale) / 2 + object.y * scale,
          w: object.w * scale,
          h: object.h * scale,
          changed: [...new Set([...object.changed, 'x', 'y', 'w', 'h'])],
        };
        if (object.fontSize && !object.sourceXml) result.fontSize = object.fontSize * scale;
        if (object.stroke)
          result.stroke = {
            ...object.stroke,
            width: object.stroke.width * scale,
            points: object.stroke.points.map(({ x, y }) => ({ x: x * scale, y: y * scale })),
          };
        return result;
      }),
    })),
  };
}

export const backgroundFallback = (paint: BackgroundPaint) =>
  paint.kind === 'gradient' ? paint.stops[0].color : paint.kind === 'pattern' ? paint.back : '#ffffff';
