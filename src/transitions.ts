import { NS, child, first } from './xml';

type Attributes = Record<string, string>;
type NativeTransition = { tag: string; attrs?: Attributes };
type EffectOption = readonly [value: string, label: string, effect: NativeTransition];
type Definition = { label: string; tag: string; attrs?: Attributes; options?: readonly EffectOption[] };
const effect = (
  label: string,
  tag: string,
  attrs?: Attributes,
  options?: readonly EffectOption[],
): Definition => ({ label, tag, attrs, options });
const dir = (left = true, vertical = true): EffectOption[] => [
  ...(left
    ? ([
        ['l', 'From Right', { tag: '', attrs: { dir: 'l' } }],
        ['r', 'From Left', { tag: '', attrs: { dir: 'r' } }],
      ] as const)
    : []),
  ...(vertical
    ? ([
        ['u', 'From Bottom', { tag: '', attrs: { dir: 'u' } }],
        ['d', 'From Top', { tag: '', attrs: { dir: 'd' } }],
      ] as const)
    : []),
];
const orientation = [
  ['hor', 'Horizontal', { tag: '', attrs: { dir: 'horz' } }],
  ['vert', 'Vertical', { tag: '', attrs: { dir: 'vert' } }],
] as const;
const inOut = [
  ['in', 'In', { tag: '', attrs: { dir: 'in' } }],
  ['out', 'Out', { tag: '', attrs: { dir: 'out' } }],
] as const;
const preset = (label: string, prst: string) => effect(label, 'p15:prstTrans', { prst });

export const transitionGroups = {
  Subtle: {
    none: effect('None', ''),
    morph: effect('Morph', 'p159:morph', { option: 'byObject' }, [
      ['byObject', 'Objects', { tag: '', attrs: { option: 'byObject' } }],
      ['byWord', 'Words', { tag: '', attrs: { option: 'byWord' } }],
      ['byChar', 'Characters', { tag: '', attrs: { option: 'byChar' } }],
    ]),
    fade: effect('Fade', 'p:fade', undefined, [
      ['smooth', 'Smoothly', { tag: '', attrs: { thruBlk: '0' } }],
      ['black', 'Through Black', { tag: '', attrs: { thruBlk: '1' } }],
    ]),
    push: effect('Push', 'p:push', { dir: 'u' }, dir()),
    wipe: effect('Wipe', 'p:wipe', { dir: 'l' }, dir()),
    split: effect(
      'Split',
      'p:split',
      { orient: 'vert', dir: 'out' },
      ['vert', 'hor'].flatMap((orient) =>
        ['out', 'in'].map((direction): EffectOption => [
          orient + '-' + direction,
          (orient === 'vert' ? 'Vertical ' : 'Horizontal ') + (direction === 'in' ? 'In' : 'Out'),
          { tag: '', attrs: { orient: orient === 'hor' ? 'horz' : orient, dir: direction } },
        ]),
      ),
    ),
    reveal: effect('Reveal', 'p14:reveal', { dir: 'l' }, dir(true, false)),
    cut: effect('Cut', 'p:cut', undefined, [
      ['instant', 'Instant', { tag: '', attrs: { thruBlk: '0' } }],
      ['black', 'Through Black', { tag: '', attrs: { thruBlk: '1' } }],
    ]),
    randomBars: effect('Random Bars', 'p:randomBar', { dir: 'vert' }, orientation),
    shape: effect('Shape', 'p:circle', undefined, [
      ['circle', 'Circle', { tag: 'p:circle' }],
      ['diamond', 'Diamond', { tag: 'p:diamond' }],
      ['plus', 'Plus', { tag: 'p:plus' }],
    ]),
    uncover: effect('Uncover', 'p:pull', { dir: 'l' }, dir()),
    cover: effect('Cover', 'p:cover', { dir: 'l' }, dir()),
    flash: effect('Flash', 'p14:flash'),
  },
  Exciting: {
    fallOver: preset('Fall Over', 'fallOver'),
    drape: preset('Drape', 'drape'),
    curtains: preset('Curtains', 'curtains'),
    wind: preset('Wind', 'wind'),
    prestige: preset('Prestige', 'prestige'),
    fracture: preset('Fracture', 'fracture'),
    crush: preset('Crush', 'crush'),
    peelOff: preset('Peel Off', 'peelOff'),
    pageCurl: effect('Page Curl', 'p15:prstTrans', { prst: 'pageCurlSingle' }, [
      ['single', 'Single Page', { tag: '', attrs: { prst: 'pageCurlSingle' } }],
      ['double', 'Double Page', { tag: '', attrs: { prst: 'pageCurlDouble' } }],
    ]),
    airplane: preset('Airplane', 'airplane'),
    origami: preset('Origami', 'origami'),
    dissolve: effect('Dissolve', 'p:dissolve'),
    checkerboard: effect('Checkerboard', 'p:checker', { dir: 'horz' }, orientation),
    blinds: effect('Blinds', 'p:blinds', { dir: 'vert' }, orientation),
    clock: effect('Clock', 'p:wheel', { spokes: '1' }, [
      ['clockwise', 'Clockwise', { tag: 'p:wheel' }],
      ['counterclockwise', 'Counterclockwise', { tag: 'p14:wheelReverse' }],
    ]),
    ripple: effect('Ripple', 'p14:ripple', { dir: 'center' }),
    honeycomb: effect('Honeycomb', 'p14:honeycomb'),
    glitter: effect('Glitter', 'p14:glitter', { dir: 'l', pattern: 'hexagon' }, dir()),
    vortex: effect('Vortex', 'p14:vortex', { dir: 'l' }, dir()),
    shred: effect('Shred', 'p14:shred', { pattern: 'strip', dir: 'in' }, inOut),
    switch: effect('Switch', 'p14:switch', { dir: 'l' }, dir(true, false)),
    flip: effect('Flip', 'p14:flip', { dir: 'l' }, dir(true, false)),
    gallery: effect('Gallery', 'p14:gallery', { dir: 'l' }, dir(true, false)),
    cube: effect('Cube', 'p14:prism', { dir: 'l', isContent: '0', isInverted: '0' }, dir()),
    doors: effect('Doors', 'p14:doors', { dir: 'vert' }, orientation),
    box: effect('Box', 'p14:prism', { dir: 'l', isContent: '0', isInverted: '1' }, dir()),
    comb: effect('Comb', 'p:comb', { dir: 'horz' }, orientation),
    zoom: effect('Zoom', 'p14:warp', { dir: 'in' }, inOut),
    random: effect('Random', 'p:random'),
  },
  'Dynamic Content': {
    pan: effect('Pan', 'p14:pan', { dir: 'u' }, dir()),
    ferris: effect('Ferris Wheel', 'p14:ferris', { dir: 'l' }, dir(true, false)),
    conveyor: effect('Conveyor', 'p14:conveyor', { dir: 'l' }, dir(true, false)),
    rotate: effect('Rotate', 'p14:prism', { dir: 'l', isContent: '1', isInverted: '0' }, dir()),
    window: effect('Window', 'p14:window', { dir: 'vert' }, orientation),
    orbit: effect('Orbit', 'p14:prism', { dir: 'l', isContent: '1', isInverted: '1' }, dir()),
    flyThrough: effect('Fly Through', 'p14:flythrough', { dir: 'in' }, inOut),
  },
} as const;

export const transitions = {
  ...transitionGroups.Subtle,
  ...transitionGroups.Exciting,
  ...transitionGroups['Dynamic Content'],
};
export type Effect = keyof typeof transitions;
export type Transition = Effect | 'preserve';
export const transitionChoices = Object.entries(transitions).map(
  ([id, { label }]) => [id as Effect, label] as const,
);

export function nativeTransition(value: Effect, option?: string): NativeTransition {
  const definition = transitions[value];
  const variant = definition.options?.find(([id]) => id === option)?.[2];
  return { tag: variant?.tag || definition.tag, attrs: { ...definition.attrs, ...variant?.attrs } };
}

export function defaultTransitionOption(value: Effect) {
  const definition = transitions[value];
  return (
    definition.options?.find(
      ([, , { tag, attrs }]) =>
        (!tag || tag === definition.tag) &&
        Object.entries(attrs ?? {}).every(([key, val]) => definition.attrs?.[key] === val),
    )?.[0] ?? definition.options?.[0]?.[0]
  );
}

export function slideTransitionNode(root: Element) {
  return Array.from(root.children).find(
    (element) =>
      (element.namespaceURI === NS.p && element.localName === 'transition') ||
      (element.namespaceURI === NS.mc &&
        element.localName === 'AlternateContent' &&
        first(element, 'transition')),
  );
}

export function primaryTransition(container?: Element) {
  return container?.localName === 'transition' ? container : container && first(container, 'transition');
}

function normalizedBoolean(value: string | null, fallback: string) {
  return value === 'true' ? '1' : value === 'false' ? '0' : (value ?? fallback);
}

export function parseTransition(transition?: Element): { transition: Transition; transitionOption?: string } {
  const native =
    transition &&
    Array.from(transition.children).find((element) => !['sndAc', 'extLst'].includes(element.localName));
  if (!native) return { transition: 'none' };
  const tag = Object.entries(NS).find(([, uri]) => uri === native.namespaceURI)?.[0] + ':' + native.localName;
  for (const [id] of transitionChoices) {
    const definition = transitions[id];
    const options = (definition.options ?? []).filter(([, , option]) => option.tag || option.attrs?.prst);
    const candidates = [nativeTransition(id), ...options.map(([option]) => nativeTransition(id, option))];
    if (
      !candidates.some(
        (candidate) =>
          candidate.tag === tag &&
          ['prst', 'isContent', 'isInverted'].every(
            (name) =>
              candidate.attrs?.[name] === undefined ||
              normalizedBoolean(native.getAttribute(name), '0') === candidate.attrs[name],
          ),
      )
    )
      continue;
    const selected = definition.options?.find(
      ([option, , spec]) =>
        nativeTransition(id, option).tag === tag &&
        Object.entries(spec.attrs ?? {}).every(([key, value]) => {
          const actual = normalizedBoolean(native.getAttribute(key), definition.attrs?.[key] ?? '0');
          return actual === value || (value === 'horz' && actual === 'hor');
        }),
    )?.[0];
    return { transition: id, transitionOption: selected ?? defaultTransitionOption(id) };
  }
  return { transition: 'preserve' };
}

export function transitionTiming(transition?: Element) {
  const ms = transition?.getAttributeNS(NS.p14, 'dur');
  const speed = transition?.getAttribute('spd');
  const auto = transition?.getAttribute('advTm');
  const click = transition?.getAttribute('advClick');
  return {
    duration:
      ms !== null && ms !== undefined && Number.isFinite(Number(ms))
        ? Math.max(0.1, Number(ms) / 1000)
        : speed === 'fast'
          ? 0.5
          : speed === 'slow'
            ? 1.5
            : 1,
    advanceAfter:
      auto != null && Number.isFinite(Number(auto)) ? Math.max(0, Number(auto) / 1000) : undefined,
    advanceOnClick: click !== '0' && click !== 'false',
  };
}
