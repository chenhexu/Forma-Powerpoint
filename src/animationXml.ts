import {
  animationDirection,
  animationEffect,
  animationPath,
  directionCodes,
  type AnimationDirection,
  type SlideAnimation,
} from './animations';
import { animationColor, animationSample } from './animationVisual';
import { all, child, esc, first, fragment } from './xml';
import type { SlideObject } from './types';

function milliseconds(value: string | null | undefined) {
  return value && /^\d+$/.test(value) ? Number(value) / 1000 : 0;
}

function animationDelay(node: Element) {
  const cond = child(node, 'stCondLst')?.firstElementChild;
  return milliseconds(cond?.getAttribute('delay'));
}

function effectDuration(node: Element) {
  return (
    Math.max(
      milliseconds(node.getAttribute('dur')),
      ...all(node, 'cTn').map((time) => milliseconds(time.getAttribute('dur'))),
    ) || 0.5
  );
}

type EffectTiming = { start: number; end: number; delay: number };

function effectGroupTiming(group: Element) {
  const entries = new Map<Element, EffectTiming>();
  const ids = new Map<string, EffectTiming>();
  let previous: EffectTiming | undefined;
  for (const node of all(group, 'cTn')) {
    if (!node.hasAttribute('presetID') || !node.hasAttribute('presetClass')) continue;
    const kind = node.getAttribute('nodeType');
    const base = kind === 'withEffect' ? previous?.start : kind === 'afterEffect' ? previous?.end : 0;
    const wrapper = node.parentElement?.parentElement?.parentElement;
    const condition =
      wrapper && group.contains(wrapper) ? child(wrapper, 'stCondLst')?.firstElementChild : null;
    const event = condition?.getAttribute('evt');
    const reference = ids.get((condition && child(condition, 'tn')?.getAttribute('val')) || '');
    const outer = reference
      ? (event === 'onEnd' ? reference.end : reference.start) + milliseconds(condition?.getAttribute('delay'))
      : milliseconds(condition?.getAttribute('delay'));
    const start = outer + animationDelay(node);
    const repeat = Number(node.getAttribute('repeatCount')) / 1000;
    const end = start + effectDuration(node) * (repeat > 1 ? repeat : 1);
    previous = { start, end, delay: Math.max(0, Math.round((start - (base ?? 0)) * 1000) / 1000) };
    entries.set(node, previous);
    ids.set(node.getAttribute('id') ?? '', previous);
  }
  return { entries, last: previous };
}

export function readSlideAnimations(timing: Element, targets: Map<string, string>) {
  const seq = all(timing, 'cTn').find((node) => node.getAttribute('nodeType') === 'mainSeq');
  const interactive = new Map<Element, string>();
  for (const branch of all(timing, 'cTn').filter(
    (node) => node.getAttribute('nodeType') === 'interactiveSeq',
  )) {
    const start = child(branch, 'stCondLst')?.firstElementChild;
    const spid =
      start?.getAttribute('evt') === 'onClick' ? first(start, 'spTgt')?.getAttribute('spid') : undefined;
    const trigger = spid && targets.get(spid);
    if (trigger) interactive.set(branch, trigger);
  }
  const scheduled = new Map<Element, EffectTiming>();
  const steps = seq && child(seq, 'childTnLst');
  for (const step of Array.from(steps?.children ?? [])) {
    const group = child(step, 'cTn') && child(child(step, 'cTn')!, 'childTnLst');
    if (!group) continue;
    for (const [node, position] of effectGroupTiming(group).entries) scheduled.set(node, position);
  }
  const effects = all(timing, 'cTn').filter(
    (node) => node.hasAttribute('presetClass') && node.hasAttribute('presetID'),
  );
  let unpreviewed = false;
  const animations: SlideAnimation[] = [];
  for (const [i, node] of effects.entries()) {
    const preset = node.getAttribute('presetClass') + ':' + node.getAttribute('presetID');
    const id =
      preset === 'emph:27' && first(node, 'animClr')
        ? 'emph:38'
        : preset === 'emph:26' &&
            (first(node, 'animScale') || all(node, 'attrName').some((attr) => attr.textContent === 'ppt_w'))
          ? 'emph:37'
          : preset;
    const target = first(node, 'spTgt');
    const objectId = targets.get(target?.getAttribute('spid') ?? '');
    const kind = node.getAttribute('nodeType');
    const trigger = !seq?.contains(node)
      ? [...interactive].find(([branch]) => branch.contains(node))?.[1]
      : undefined;
    if (!objectId || !animationEffect(id) || (!seq?.contains(node) && !trigger) || first(target!, 'charRg')) {
      unpreviewed = true;
      continue;
    }
    const subtype = Number(node.getAttribute('presetSubtype'));
    const direction = (Object.keys(directionCodes) as AnimationDirection[]).find(
      (d) => directionCodes[d] === subtype,
    );
    const p = first(target!, 'pRg');
    const innerDelay = animationDelay(node);
    const container = node.parentElement?.parentElement?.parentElement;
    const duration = effectDuration(node);
    const repeat = Number(node.getAttribute('repeatCount')) / 1000;
    const readEasing = (name: string) => {
      const value = node.getAttribute(name);
      if (!value) return undefined;
      const ratio = value.endsWith('%') ? parseFloat(value) / 100 : Number(value) / 100000;
      return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) * duration : undefined;
    };
    const after =
      container &&
      child(container, 'childTnLst') &&
      all(child(container, 'childTnLst')!, 'set').find((set) => {
        const timing = first(set, 'cTn');
        return (
          timing?.getAttribute('afterEffect') === '1' &&
          first(timing, 'tn')?.getAttribute('val') === node.getAttribute('id')
        );
      });
    const afterAttribute = after && first(after, 'attrName')?.textContent;
    animations.push({
      id: 'pptx-animation-' + i,
      target: objectId,
      imported: true,
      effect: id,
      duration,
      trigger,
      repeat: Number.isInteger(repeat) && repeat > 1 ? repeat : undefined,
      rewind: node.getAttribute('fill') === 'remove' || undefined,
      smoothStart: readEasing('accel'),
      smoothEnd: readEasing('decel'),
      after:
        afterAttribute === 'style.visibility'
          ? 'hide'
          : afterAttribute === 'style.opacity'
            ? 'dim'
            : undefined,
      delay: scheduled.get(node)?.delay ?? innerDelay,
      start: kind === 'withEffect' ? 'with' : kind === 'afterEffect' ? 'after' : 'click',
      direction,
      paragraphs: p ? [Number(p.getAttribute('st')), Number(p.getAttribute('end'))] : undefined,
      nativePath: first(node, 'animMotion')?.getAttribute('path') || undefined,
    });
  }
  return { animations, unpreviewed };
}

const filters: Record<string, string> = {
  fade: 'fade',
  blinds: 'blinds(horizontal)',
  box: 'box(out)',
  checker: 'checkerboard(across)',
  circle: 'circle(out)',
  diamond: 'diamond(out)',
  dissolve: 'dissolve',
  plus: 'plus(out)',
  bars: 'randombar(vertical)',
  split: 'barn(outVertical)',
  strips: 'strips(downRight)',
  wheel: 'wheel(1)',
  wedge: 'wedge',
  breaks: 'dissolve',
  random: 'dissolve',
  typewriter: 'wipe(right)',
};
const wipe = { bottom: 'up', top: 'down', left: 'right', right: 'left' };

function behaviorXml(
  animation: SlideAnimation,
  spid: number,
  o: SlideObject,
  w: number,
  h: number,
  id: () => number,
) {
  const effect = animationEffect(animation.effect)!;
  const duration = Math.max(1, Math.round(animation.duration * 1000));
  const target = animation.paragraphs
    ? `<p:spTgt spid="${spid}"><p:txEl><p:pRg st="${animation.paragraphs[0]}" end="${animation.paragraphs[1]}"/></p:txEl></p:spTgt>`
    : `<p:spTgt spid="${spid}"/>`;
  const behavior = (attribute?: string, ms = duration, delay = 0, additive = '') =>
    `<p:cBhvr${additive}><p:cTn id="${id()}" dur="${ms}" fill="hold">${delay ? `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>` : ''}</p:cTn><p:tgtEl>${target}</p:tgtEl>${attribute ? `<p:attrNameLst><p:attrName>${attribute}</p:attrName></p:attrNameLst>` : ''}</p:cBhvr>`;
  const set = (attribute: string, value: string, delay = 0) =>
    `<p:set>${behavior(attribute, 1, delay)}<p:to><p:strVal val="${esc(value)}"/></p:to></p:set>`;
  const visibility =
    effect.group === 'entr'
      ? set('style.visibility', 'visible')
      : effect.group === 'exit'
        ? set('style.visibility', 'hidden', effect.style === 'instant' ? 0 : Math.max(0, duration - 1))
        : '';
  if (effect.style === 'instant') return visibility;
  if (effect.group === 'path') {
    const path = animationPath(animation)
      .replace(/\bE\s*$/i, '')
      .trim()
      .toUpperCase();
    return `<p:animMotion origin="layout" path="${esc(path)} E" pathEditMode="relative">${behavior(undefined, duration, 0, ' additive="base"')}</p:animMotion>`;
  }
  if (effect.style === 'spin') return `<p:animRot by="21600000">${behavior('r')}</p:animRot>`;
  if (effect.style === 'grow') return `<p:animScale>${behavior()}<p:by x="150000" y="150000"/></p:animScale>`;
  const filter =
    filters[effect.style] ??
    (['wipe', 'peek'].includes(effect.style) ? `wipe(${wipe[animationDirection(animation)]})` : '');
  if (filter)
    return (
      visibility +
      `<p:animEffect transition="${effect.group === 'exit' ? 'out' : 'in'}" filter="${filter}">${behavior()}</p:animEffect>`
    );

  const samples = Array.from({ length: 13 }, (_, i) => animationSample(animation, i / 12, o, w, h));
  const animate = (attr: string, values: number[], operation?: '+' | '*') => {
    const entries = values
      .map((n, i) => {
        const v = Number(n.toFixed(5));
        const val = operation
          ? `<p:strVal val="#${attr}${operation}${operation === '+' && v < 0 ? '(' + v + ')' : v}"/>`
          : `<p:fltVal val="${v}"/>`;
        return `<p:tav tm="${Math.round((i / 12) * 100000)}"><p:val>${val}</p:val></p:tav>`;
      })
      .join('');
    return `<p:anim calcmode="lin" valueType="num">${behavior(attr)}<p:tavLst>${entries}</p:tavLst></p:anim>`;
  };
  let result = '';
  if (samples.some((p) => p.x))
    result += animate(
      'ppt_x',
      samples.map((p) => p.x / w),
      '+',
    );
  if (samples.some((p) => p.y))
    result += animate(
      'ppt_y',
      samples.map((p) => p.y / h),
      '+',
    );
  if (samples.some((p) => p.sx !== 1))
    result += animate(
      'ppt_w',
      samples.map((p) => p.sx),
      '*',
    );
  if (samples.some((p) => p.sy !== 1))
    result += animate(
      'ppt_h',
      samples.map((p) => p.sy),
      '*',
    );
  if (samples.some((p) => p.rotate))
    result += animate(
      'ppt_r',
      samples.map((p) => p.rotate),
    );
  if (samples.some((p) => p.opacity !== 1))
    result += animate(
      'style.opacity',
      samples.map((p) => p.opacity),
    );
  const colorProperties: Record<string, string> = {
    fillColor: 'fillcolor',
    lineColor: 'line.color',
    fontColor: 'style.color',
    brushColor: 'style.color',
    objectColor: 'fillcolor',
    colorBlend: 'fillcolor',
    colorWave: 'fillcolor',
    growColor: 'style.color',
    complement: 'fillcolor',
    complement2: 'fillcolor',
    colorPulse: 'fillcolor',
  };
  const colorAttr = colorProperties[effect.style];
  if (colorAttr) {
    result += `<p:animClr clrSpc="rgb" dir="cw">${behavior(colorAttr)}<p:to><a:srgbClr val="${animationColor.slice(1).toUpperCase()}"/></p:to></p:animClr>`;
  }
  const textProperties: Record<string, [string, string]> = {
    font: ['style.fontFamily', 'Georgia'],
    fontStyle: ['style.fontWeight', 'bold'],
    boldReveal: ['style.fontWeight', 'bold'],
    boldFlash: ['style.fontWeight', 'bold'],
    underline: ['style.textDecorationUnderline', 'true'],
    desaturate: ['imageData.grayscale', 'true'],
  };
  const text = textProperties[effect.style];
  if (text) result += `<p:set>${behavior(text[0])}<p:to><p:strVal val="${esc(text[1])}"/></p:to></p:set>`;
  if (!result && effect.group === 'emph') {
    const peak = effect.style === 'darken' ? 0.45 : 0.73;
    result = animate(
      'style.opacity',
      samples.map((_, i) => 1 - (1 - peak) * Math.sin((Math.PI * i) / 12)),
    );
  }
  return result + visibility;
}

export function addAnimationTiming(
  doc: Document,
  animations: SlideAnimation[],
  targets: Map<string, { spid: number; object: SlideObject }>,
  width: number,
  height: number,
) {
  const additions = animations.filter(
    (animation) => !animation.imported && targets.has(animation.target) && animationEffect(animation.effect),
  );
  if (!additions.length) return;
  const root = doc.documentElement;
  let timing = child(root, 'timing') ?? first(root, 'timing');
  if (!timing) {
    timing = fragment(doc, '<p:timing/>');
    root.insertBefore(timing, child(root, 'extLst') ?? null);
  }
  let list = child(timing, 'tnLst');
  if (!list) {
    list = fragment(doc, '<p:tnLst/>');
    timing.prepend(list);
  }
  let next = Math.max(0, ...all(timing, 'cTn').map((node) => Number(node.getAttribute('id')) || 0)) + 1;
  const id = () => next++;
  let base = all(list, 'cTn').find((node) => node.getAttribute('nodeType') === 'tmRoot');
  if (!base) {
    const par = fragment(
      doc,
      `<p:par><p:cTn id="${id()}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst/></p:cTn></p:par>`,
    );
    list.append(par);
    base = child(par, 'cTn')!;
  }
  let rootChildren = child(base, 'childTnLst');
  if (!rootChildren) {
    rootChildren = fragment(doc, '<p:childTnLst/>');
    base.insertBefore(rootChildren, child(base, 'subTnLst') ?? null);
  }
  function writeEffect(group: Element, animation: SlideAnimation, offset = 0) {
    const { spid, object } = targets.get(animation.target)!;
    const effect = animationEffect(animation.effect)!;
    const cut = animation.start === 'click';
    const nodeType = cut ? 'clickEffect' : animation.start === 'with' ? 'withEffect' : 'afterEffect';
    const presetSubtype =
      effect.directional && effect.group !== 'path'
        ? directionCodes[animationDirection(animation)]
        : effect.style === 'wheel'
          ? 1
          : effect.style === 'split'
            ? 37
            : ['circle', 'box', 'diamond', 'plus'].includes(effect.style)
              ? 32
              : 0;
    const effectId = id();
    const delay = Math.round(animation.delay * 1000);
    const dur = Math.max(1, Math.round(animation.duration * 1000));
    const body = behaviorXml(animation, spid, object, width, height, id);
    const repeat = (animation.repeat ?? 1) > 1 ? ` repeatCount="${animation.repeat! * 1000}"` : '';
    const accel = animation.smoothStart
      ? ` accel="${Math.round((animation.smoothStart / animation.duration) * 100000)}"`
      : '';
    const decel = animation.smoothEnd
      ? ` decel="${Math.round((animation.smoothEnd / animation.duration) * 100000)}"`
      : '';
    const fill = animation.rewind ? 'remove' : 'hold';
    const effectNode = `<p:par><p:cTn id="${effectId}" presetID="${effect.preset}" presetClass="${effect.group}" presetSubtype="${presetSubtype}" dur="${dur}" fill="${fill}" nodeType="${nodeType}"${repeat}${accel}${decel}><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${body}</p:childTnLst></p:cTn></p:par>`;
    const after = animation.after
      ? `<p:set><p:cBhvr><p:cTn id="${id()}" dur="1" fill="hold" afterEffect="1"><p:stCondLst><p:cond evt="onEnd" delay="0"><p:tn val="${effectId}"/></p:cond></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.${animation.after === 'hide' ? 'visibility' : 'opacity'}</p:attrName></p:attrNameLst></p:cBhvr><p:to>${animation.after === 'hide' ? '<p:strVal val="hidden"/>' : '<p:fltVal val="0.45"/>'}</p:to></p:set>`
      : '';
    group.append(
      fragment(
        doc,
        `<p:par><p:cTn id="${id()}" fill="hold"><p:stCondLst><p:cond delay="${offset}"/></p:stCondLst><p:childTnLst>${effectNode}${after}</p:childTnLst></p:cTn></p:par>`,
      ),
    );
    const start = offset + delay;
    return { start, end: start + dur * (animation.repeat ?? 1) };
  }
  function addGroup(sequence: Element, delay: string, beginWith?: string) {
    const outer = fragment(
      doc,
      `<p:par><p:cTn id="${id()}" fill="hold"><p:stCondLst><p:cond delay="${delay}"/>${beginWith ? `<p:cond evt="onBegin" delay="0"><p:tn val="${beginWith}"/></p:cond>` : ''}</p:stCondLst><p:childTnLst/></p:cTn></p:par>`,
    );
    sequence.append(outer);
    return first(outer, 'childTnLst')!;
  }
  const ordinary = additions.filter((animation) => !animation.trigger || !targets.has(animation.trigger));
  if (ordinary.length) {
    let main = all(rootChildren, 'cTn').find((node) => node.getAttribute('nodeType') === 'mainSeq');
    if (!main) {
      const nav = (direction: 'prev' | 'next') =>
        `<p:${direction}CondLst><p:cond evt="on${direction === 'prev' ? 'Prev' : 'Next'}" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:${direction}CondLst>`;
      const seq = fragment(
        doc,
        `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${id()}" dur="indefinite" nodeType="mainSeq"><p:childTnLst/></p:cTn>${nav('prev')}${nav('next')}</p:seq>`,
      );
      rootChildren.prepend(seq);
      main = child(seq, 'cTn')!;
    }
    let sequence = child(main, 'childTnLst');
    if (!sequence) {
      sequence = fragment(doc, '<p:childTnLst/>');
      main.insertBefore(sequence, child(main, 'subTnLst') ?? null);
    }
    const finalGroup = sequence.lastElementChild && child(sequence.lastElementChild, 'cTn');
    let group = finalGroup ? child(finalGroup, 'childTnLst') : undefined;
    const previousEffect = group && effectGroupTiming(group).last;
    let previous = previousEffect && {
      start: Math.round(previousEffect.start * 1000),
      end: Math.round(previousEffect.end * 1000),
    };
    for (const animation of ordinary) {
      if (!group || animation.start === 'click') {
        const onEntry = animation.start !== 'click' ? (main.getAttribute('id') ?? undefined) : undefined;
        group = addGroup(sequence, 'indefinite', onEntry);
        previous = undefined;
      }
      // PowerPoint schedules the wrappers relative to the click. A held preset's end event is unreliable.
      const offset = (animation.start === 'with' ? previous?.start : previous?.end) ?? 0;
      previous = writeEffect(group, animation, offset);
    }
  }
  const branches = new Map<string, Element>();
  for (const animation of additions) {
    const source = animation.trigger && targets.get(animation.trigger);
    if (!source) continue;
    let group = branches.get(animation.trigger!);
    if (!group) {
      const target = `<p:tgtEl><p:spTgt spid="${source.spid}"/></p:tgtEl>`;
      const seq = fragment(
        doc,
        `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${id()}" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq"><p:stCondLst><p:cond evt="onClick" delay="0">${target}</p:cond></p:stCondLst><p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync><p:childTnLst/></p:cTn></p:seq>`,
      );
      rootChildren.append(seq);
      group = addGroup(first(seq, 'childTnLst')!, '0');
      branches.set(animation.trigger!, group);
    }
    writeEffect(group, { ...animation, start: 'click' });
  }
}
