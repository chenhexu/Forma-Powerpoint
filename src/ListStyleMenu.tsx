import { List, ListOrdered } from 'lucide-react';
import { Dropdown } from './Ribbon';
import { listMarker } from './textFormat';
import type { ListStyle } from './types';

const choices: [ListStyle, string][] = [
  ['none', 'No list'],
  ['disc', 'Filled bullets'],
  ['circle', 'Open bullets'],
  ['square', 'Square bullets'],
  ['decimal', 'Numbers'],
  ['alpha', 'Letters'],
  ['roman', 'Roman numerals'],
];
const groups = {
  disc: 'Bullets',
  circle: 'Bullets',
  square: 'Bullets',
  decimal: 'Numbering',
  alpha: 'Numbering',
  roman: 'Numbering',
};
const previews = Object.fromEntries(
  choices.map(([style]) => [
    style,
    <span className="list-style-preview" aria-hidden="true">
      {[1, 2, 3].map((row) => (
        <span className="list-preview-row" key={row}>
          {style !== 'none' && <span className="list-preview-marker">{listMarker(style, row)}</span>}
          <span className="list-preview-line" />
        </span>
      ))}
    </span>,
  ]),
);

export function ListStyleMenu({
  value,
  onChange,
  disabled,
}: {
  value?: ListStyle;
  onChange: (style: ListStyle) => void;
  disabled: boolean;
}) {
  const Icon =
    value && value in groups && groups[value as keyof typeof groups] === 'Numbering' ? ListOrdered : List;
  return (
    <Dropdown
      label="Bullets and numbering"
      caption="List style"
      value={value ?? 'none'}
      choices={choices}
      onChange={onChange}
      disabled={disabled}
      groups={groups}
      previews={previews}
      icon={<Icon size={14} aria-hidden="true" />}
    />
  );
}
