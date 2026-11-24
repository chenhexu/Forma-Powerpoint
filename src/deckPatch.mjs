// A field entry with no second value removes the property. Nested collections use stable object IDs.
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
const slideCollections = ['objects', 'comments', 'animations'];
const equal = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

function diffFields(before, after, excluded) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !excluded.includes(key) && !reserved.has(key) && !equal(before[key], after[key]))
    .map((key) => (after[key] === undefined ? [key] : [key, after[key]]));
}

function diffList(before, after, slideLevel = false) {
  if (before === after) return;
  const byId = new Map(before.map((item) => [item.id, item]));
  const remaining = new Set(after.map((item) => item.id));
  const keptOrder = before.filter(({ id }) => remaining.has(id)).map(({ id }) => id);
  const edits = before
    .filter((item) => !remaining.has(item.id))
    .map((item) => ({ id: item.id, remove: true }));
  for (const item of after) {
    const previous = byId.get(item.id);
    if (!previous) {
      edits.push({ id: item.id, put: item });
      keptOrder.push(item.id);
      continue;
    }
    const fields = diffFields(previous, item, slideLevel ? slideCollections : []);
    // Keep both property lists when two users edit different parts of one original PowerPoint object.
    const addedChanges =
      !slideLevel && previous.sourceXml
        ? item.changed?.filter((key) => !previous.changed?.includes(key))
        : undefined;
    const changes = addedChanges?.length ? fields.filter(([key]) => key !== 'changed') : fields;
    const lists = slideLevel
      ? Object.fromEntries(
          slideCollections.flatMap((key) => {
            const patch = diffList(previous[key] ?? [], item[key] ?? []);
            return patch ? [[key, patch]] : [];
          }),
        )
      : undefined;
    const changed = addedChanges?.length ? addedChanges : undefined;
    if (changes.length || changed || (lists && Object.keys(lists).length))
      edits.push({ id: item.id, fields: changes, changed, lists });
  }
  const ids = after.map(({ id }) => id);
  const order = equal(keptOrder, ids) ? undefined : ids;
  return edits.length || order ? { edits, order } : undefined;
}

export function diffDeck(before, after) {
  if (before === after) return;
  const fields = diffFields(before, after, ['slides']);
  const slides = diffList(before.slides, after.slides, true);
  return fields.length || slides ? { fields, slides } : undefined;
}

function applyFields(record, fields, excluded) {
  const result = { ...record };
  for (const [key, value] of fields ?? []) {
    if (typeof key !== 'string' || reserved.has(key) || excluded.includes(key) || key === 'id') continue;
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  return result;
}

function applyList(list, diff, slideLevel = false) {
  if (!diff) return list;
  const result = new Map(list.map((item) => [item.id, item]));
  for (const edit of diff.edits ?? []) {
    if (edit.put?.id === edit.id) result.set(edit.id, edit.put);
  }
  for (const edit of diff.edits ?? []) {
    if (edit.remove) {
      if (!slideLevel || result.size > 1) result.delete(edit.id);
      continue;
    }
    if (edit.put) continue;
    const existing = result.get(edit.id);
    if (!existing) continue;
    const item = applyFields(existing, edit.fields, slideLevel ? slideCollections : []);
    if (edit.changed?.length) item.changed = [...new Set([...(existing.changed ?? []), ...edit.changed])];
    if (slideLevel) {
      for (const key of slideCollections) {
        if (edit.lists?.[key]) item[key] = applyList(existing[key] ?? [], edit.lists[key]);
      }
    }
    result.set(edit.id, item);
  }
  if (!diff.order) return [...result.values()];
  const ordered = [];
  for (const id of diff.order) {
    if (!result.has(id)) continue;
    ordered.push(result.get(id));
    result.delete(id);
  }
  return [...ordered, ...result.values()];
}

export function applyDeckPatch(deck, patch) {
  if (!patch) return deck;
  return {
    ...applyFields(deck, patch.fields, ['slides']),
    slides: applyList(deck.slides, patch.slides, true),
  };
}
