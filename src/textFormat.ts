import type { ListStyle, SlideObject } from './types';

export const bulletCharacters = { disc: '•', circle: '○', square: '▪' };
export const numberingTypes = { decimal: 'arabicPeriod', alpha: 'alphaLcPeriod', roman: 'romanLcPeriod' };
export const runFormatKeys = [
  'fontSize',
  'fontFamily',
  'color',
  'bold',
  'italic',
  'underline',
  'strike',
  'baseline',
  'letterSpacing',
] as const;
export const paragraphFormatKeys = ['alignment', 'listStyle', 'indentLevel', 'lineSpacing'] as const;

export function listMarker(style: ListStyle | undefined, number: number) {
  if (style && style in bulletCharacters) return bulletCharacters[style as keyof typeof bulletCharacters];
  if (style === 'decimal') return `${number}.`;
  if (style === 'alpha') {
    let label = '';
    for (let n = number; n > 0; n = Math.floor((n - 1) / 26))
      label = String.fromCharCode(97 + ((n - 1) % 26)) + label;
    return label + '.';
  }
  if (style === 'roman') {
    if (number > 3999) return `${number}.`;
    let label = '';
    for (const [value, symbol] of [
      [1000, 'm'],
      [900, 'cm'],
      [500, 'd'],
      [400, 'cd'],
      [100, 'c'],
      [90, 'xc'],
      [50, 'l'],
      [40, 'xl'],
      [10, 'x'],
      [9, 'ix'],
      [5, 'v'],
      [4, 'iv'],
      [1, 'i'],
    ] as const) {
      label += symbol.repeat(Math.floor(number / value));
      number %= value;
    }
    return label + '.';
  }
}

export function paragraphMargins(o: SlideObject, listed: boolean) {
  const hanging = listed ? 24 : 0;
  return { left: (o.indentLevel ?? 0) * 24 + hanging, indent: -hanging };
}
