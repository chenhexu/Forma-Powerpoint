import { useState } from 'react';
import { SlideToolsDialog } from './SlideTools';
import { slideTitle } from './ShowTools';
import type { Deck } from './types';

export function AccessibilityReview({
  deck,
  active,
  close,
  jump,
}: {
  deck: Deck;
  active: number;
  close: () => void;
  jump: (index: number, object?: string) => void;
}) {
  const [index, setIndex] = useState(active);
  const slide = deck.slides[index] ?? deck.slides[0];
  const issues = deck.slides.flatMap((page, index) => {
    const visible = page.objects.filter(({ hidden }) => !hidden);
    const missing = visible.filter(
      (object) => ['image', 'model', 'chart', 'media'].includes(object.kind) && !object.altText?.trim(),
    );
    return [
      ...(!visible.some((object) => object.kind === 'text' && object.text?.trim())
        ? [{ index, id: undefined, label: 'Slide has no visible text' }]
        : []),
      ...missing.map((item) => ({ index, id: item.id, label: `Missing alt text for ${item.name}` })),
    ];
  });
  return (
    <SlideToolsDialog title="Accessibility Checker" onClose={close}>
      <div className="insert-form">
        <h3 className="review-heading">Accessibility issues</h3>
        <p>
          {issues.length
            ? `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} found`
            : 'All slides have visible text and descriptions for visual objects.'}
        </p>
        {!!issues.length && (
          <div className="show-slide-list" aria-label="Accessibility issues">
            {issues.map((issue) => (
              <button
                type="button"
                className="button"
                key={issue.index + ':' + issue.id}
                onClick={() => jump(issue.index, issue.id)}
              >
                Slide {issue.index + 1} · {issue.label}
              </button>
            ))}
          </div>
        )}
        <h3 className="review-heading">Reading order</h3>
        <label>
          Slide
          <select value={index} onChange={(event) => setIndex(Number(event.target.value))}>
            {deck.slides.map((item, i) => (
              <option key={item.id} value={i}>
                {i + 1}. {slideTitle(item, i)}
              </option>
            ))}
          </select>
        </label>
        <ol className="show-slide-list reading-order-list">
          {slide.objects
            .filter((item) => !item.hidden)
            .map((item) => (
              <li key={item.id}>
                <button type="button" className="button" onClick={() => jump(index, item.id)}>
                  {item.altText || item.text?.trim().split('\n')[0]?.slice(0, 75) || item.name}
                </button>
              </li>
            ))}
        </ol>
      </div>
    </SlideToolsDialog>
  );
}
