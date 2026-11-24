import type { Deck } from './types';

type Field = [string, unknown?];
type ListEdit = {
  id: string;
  put?: { id: string };
  remove?: boolean;
  fields?: Field[];
  changed?: string[];
  lists?: Partial<Record<'objects' | 'comments' | 'animations', ListPatch>>;
};
type ListPatch = { edits: ListEdit[]; order?: string[] };
export type DeckPatch = { fields?: Field[]; slides?: ListPatch };
export function diffDeck(before: Deck, after: Deck): DeckPatch | undefined;
export function applyDeckPatch(deck: Deck, patch?: DeckPatch): Deck;
