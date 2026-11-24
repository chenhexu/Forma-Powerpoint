import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Dropdown } from './Ribbon';
import { chartTypes } from './InsertRibbon';
import { chartPreviews, linkTargetPreviews, slideActionPreviews } from './RibbonPreviews';
import { chartSeries, jumpTargets, mergeAt, readChartWorkbook, tableEdges, webLink } from './insertContent';
import type { ChartData, Slide, SlideComment, SlideLink, TableData, TableEdge } from './types';

type LinkEntry = 'link' | 'action' | 'zoom' | 'online';
export type InsertDialogState =
  | { type: 'table'; objectId?: string; data?: TableData }
  | { type: 'table-paste' }
  | { type: 'chart'; objectId?: string; data: ChartData }
  | { type: 'link'; objectId?: string; entry: LinkEntry; link?: SlideLink }
  | { type: 'footer' }
  | { type: 'equation' }
  | { type: 'comment'; author: string };

export type InsertResult =
  | { type: 'table'; data: TableData; objectId?: string }
  | { type: 'chart'; data: ChartData; objectId?: string }
  | { type: 'link'; link?: SlideLink; label: string; objectId?: string }
  | { type: 'footer'; header: string; footer: string; date: boolean; number: boolean; allSlides: boolean }
  | { type: 'equation'; text: string }
  | { type: 'comment'; text: string; author: string; replyTo?: string }
  | { type: 'comment-resolve'; id: string; resolved: boolean };

export function emptyTable(columns: number, rows: number, header = true): TableData {
  return { header, cells: Array.from({ length: rows }, () => Array<string>(columns).fill('')) };
}

const linkTitles: Record<LinkEntry, string> = {
  link: 'Link',
  action: 'Slide action',
  zoom: 'Slide navigation link',
  online: 'Online video link',
};

function Form({
  children,
  submit,
  close,
  label,
}: {
  children: ReactNode;
  submit: (form: FormData) => void;
  close: () => void;
  label: string;
}) {
  return (
    <form
      className="insert-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      {children}
      <div className="insert-dialog-actions">
        <button type="button" className="button" onClick={close}>
          Cancel
        </button>
        <button type="submit" className="button primary">
          {label}
        </button>
      </div>
    </form>
  );
}

function TableForm({
  state,
  save,
  close,
}: {
  state: Extract<InsertDialogState, { type: 'table' }>;
  save: (result: InsertResult) => void;
  close: () => void;
}) {
  const [data, setData] = useState(state.data ?? emptyTable(3, 3));
  const [[activeRow, col], select] = useState<[number, number]>([0, 0]);
  const [spanRows, setSpanRows] = useState(1);
  const [spanCols, setSpanCols] = useState(2);
  const [edge, setEdge] = useState<TableEdge>('B');
  const [border, setBorder] = useState('#6345bd');
  const row = activeRow;
  const merge = mergeAt(data, row, col);
  const rows = data.cells.length,
    columns = data.cells[0].length;
  function resize(nextColumns: number, nextRows: number) {
    if (nextColumns < 1 || nextColumns > 12 || nextRows < 1 || nextRows > 12) return;
    setData({
      ...data,
      merges: data.merges?.filter((m) => m.row + m.rows <= nextRows && m.column + m.columns <= nextColumns),
      widths: nextColumns === columns ? data.widths : undefined,
      heights: nextRows === rows ? data.heights : undefined,
      fills: data.fills?.slice(0, nextRows).map((items) => items.slice(0, nextColumns)),
      borders: data.borders?.slice(0, nextRows).map((items) => items.slice(0, nextColumns)),
      cells: Array.from({ length: nextRows }, (_, row) =>
        Array.from({ length: nextColumns }, (_, col) => data.cells[row]?.[col] ?? ''),
      ),
    });
    select([Math.min(row, nextRows - 1), Math.min(col, nextColumns - 1)]);
  }
  const canMerge =
    !merge &&
    spanRows >= 1 &&
    spanCols >= 1 &&
    spanRows + spanCols > 2 &&
    row + spanRows <= rows &&
    col + spanCols <= columns &&
    !data.merges?.some(
      (area) =>
        row < area.row + area.rows &&
        area.row < row + spanRows &&
        col < area.column + area.columns &&
        area.column < col + spanCols,
    );
  function setCellBorder(color: string) {
    const borders = data.cells.map((cells, r) =>
      cells.map((_, c) => ({
        ...data.borders?.[r]?.[c],
        ...(r === row && c === col ? { [edge]: color } : {}),
      })),
    );
    setData({ ...data, borders });
  }

  return (
    <Form
      close={close}
      label={state.objectId ? 'Save Table' : 'Insert Table'}
      submit={() => save({ type: 'table', data, objectId: state.objectId })}
    >
      <div className="insert-form-row">
        <label>
          Columns{' '}
          <input
            type="number"
            min={1}
            max={12}
            value={columns}
            onChange={(e) => resize(Number(e.target.value), rows)}
          />
        </label>
        <label>
          Rows{' '}
          <input
            type="number"
            min={1}
            max={12}
            value={rows}
            onChange={(e) => resize(columns, Number(e.target.value))}
          />
        </label>
      </div>
      <label className="insert-check">
        <input
          type="checkbox"
          checked={data.header}
          onChange={(e) => setData({ ...data, header: e.target.checked })}
        />{' '}
        Header row
      </label>
      <div className="insert-form-row">
        <span className="table-active-cell">
          Cell {row + 1}, {col + 1}
        </span>
        <label>
          Span rows
          <input
            aria-label="Span rows"
            type="number"
            min="1"
            max={rows - row}
            value={spanRows}
            onChange={(e) => setSpanRows(Number(e.target.value))}
          />
        </label>
        <label>
          Span columns
          <input
            aria-label="Span columns"
            type="number"
            min="1"
            max={columns - col}
            value={spanCols}
            onChange={(e) => setSpanCols(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          className="button"
          disabled={!canMerge}
          onClick={() => {
            setData({
              ...data,
              merges: [...(data.merges ?? []), { row, column: col, rows: spanRows, columns: spanCols }],
            });
            setSpanRows(1);
            setSpanCols(1);
          }}
        >
          Merge cells
        </button>
        <button
          type="button"
          className="button"
          disabled={!merge}
          onClick={() => setData({ ...data, merges: data.merges?.filter((item) => item !== merge) })}
        >
          Split cells
        </button>
      </div>
      <div className="insert-form-row">
        <Dropdown
          label="Cell border edge"
          choices={[
            ['T', 'Top'],
            ['B', 'Bottom'],
            ['L', 'Left'],
            ['R', 'Right'],
          ]}
          value={edge}
          onChange={setEdge}
        />
        <label>
          Border color
          <input type="color" value={border} onChange={(e) => setBorder(e.target.value)} />
        </label>
        <button type="button" className="button" onClick={() => setCellBorder(border)}>
          Apply border
        </button>
        <button type="button" className="button" onClick={() => setCellBorder('transparent')}>
          Clear border
        </button>
      </div>
      <div className="insert-table-fields">
        <table aria-label="Table cells">
          <tbody>
            {data.cells.map((row, r) => (
              <tr key={r}>
                {row.map((text, c) => {
                  const area = mergeAt(data, r, c);
                  if (area && (area.row !== r || area.column !== c)) return null;
                  const styling = data.borders?.[r]?.[c];
                  return (
                    <td
                      key={c}
                      rowSpan={area?.rows}
                      colSpan={area?.columns}
                      data-active={(r === activeRow && c === col) || undefined}
                      className={r === 0 && data.header ? 'table-header-cell' : ''}
                      style={Object.fromEntries(
                        tableEdges.flatMap((side) =>
                          styling?.[side]
                            ? [
                                [
                                  { T: 'borderTop', B: 'borderBottom', L: 'borderLeft', R: 'borderRight' }[
                                    side
                                  ],
                                  '2px solid ' + styling[side],
                                ],
                              ]
                            : [],
                        ),
                      )}
                    >
                      <input
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        value={text}
                        onFocus={() => {
                          select([r, c]);
                          setSpanRows(1);
                          setSpanCols(c + 1 < columns ? 2 : 1);
                        }}
                        onChange={(e) => {
                          const value = e.target.value;
                          setData((previous) => ({
                            ...previous,
                            cells: previous.cells.map((cells, i) =>
                              i === r ? cells.map((entry, j) => (j === c ? value : entry)) : cells,
                            ),
                          }));
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Form>
  );
}

function ChartForm({
  state,
  close,
  save,
}: {
  state: Extract<InsertDialogState, { type: 'chart' }>;
  close: () => void;
  save: (result: InsertResult) => void;
}) {
  const [type, setType] = useState(state.data.type);
  const [labels, setLabels] = useState(state.data.points.map(({ label }) => label));
  const [series, setSeries] = useState(
    chartSeries(state.data).map(({ name, values }) => ({ name, values: values.map(String) })),
  );
  const [workbookName, setWorkbookName] = useState(state.data.workbookName);
  const [error, setError] = useState('');
  const columns = type === 'pie' ? series.slice(0, 1) : series;
  function changeType(value: ChartData['type']) {
    setType(value);
    if (value === 'combo' && series.length === 1)
      setSeries([...series, { name: 'Trend', values: labels.map(() => '0') }]);
  }
  async function loadWorkbook(file: File) {
    try {
      const imported = await readChartWorkbook(file, type);
      setLabels(imported.points.map(({ label }) => label));
      setSeries(chartSeries(imported).map(({ name, values }) => ({ name, values: values.map(String) })));
      setWorkbookName(file.name);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The workbook could not be read.');
    }
  }
  return (
    <Form
      close={close}
      label={state.objectId ? 'Save Chart' : 'Insert Chart'}
      submit={() => {
        const values = columns.map(({ name, values }) => ({
          name: name.trim() || 'Value',
          values: values.map(Number),
        }));
        if (
          labels.some((label) => !label.trim()) ||
          values.some(({ values }) =>
            values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e15),
          )
        ) {
          setError('Enter a category and valid numbers in each row.');
          return;
        }
        if (type === 'pie' && (values[0].values.some((n) => n < 0) || !values[0].values.some((n) => n > 0))) {
          setError('A pie chart needs nonnegative values and a positive total.');
          return;
        }
        save({
          type: 'chart',
          data: {
            type,
            workbookName,
            firstSeries: values[0].name,
            series: values.slice(1),
            points: labels.map((label, i) => ({ label: label.trim(), value: values[0].values[i] })),
          },
          objectId: state.objectId,
        });
      }}
    >
      <div className="insert-form-row">
        <Dropdown
          label="Chart type"
          value={type}
          choices={chartTypes}
          previews={chartPreviews}
          onChange={changeType}
        />
        <button
          type="button"
          className="button"
          disabled={labels.length >= 100}
          onClick={() => {
            setLabels([...labels, '']);
            setSeries(series.map((item) => ({ ...item, values: [...item.values, '0'] })));
          }}
        >
          <Plus size={15} /> Add category
        </button>
        <button
          type="button"
          className="button"
          disabled={type === 'pie' || series.length >= 6}
          onClick={() =>
            setSeries([...series, { name: 'Series ' + (series.length + 1), values: labels.map(() => '0') }])
          }
        >
          <Plus size={15} /> Add series
        </button>
      </div>
      <label>
        Excel workbook
        <input
          type="file"
          accept=".xlsx"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadWorkbook(file);
          }}
        />
      </label>
      {workbookName && <small>Data from {workbookName}. Choose the workbook again to refresh.</small>}
      <div className="insert-chart-fields">
        <div
          className="insert-chart-row"
          style={{
            gridTemplateColumns: `minmax(100px, 1fr) repeat(${columns.length}, minmax(90px, 0.8fr)) 34px`,
          }}
        >
          <span>Category</span>
          {columns.map(({ name }, i) => (
            <div key={i} className="chart-series-header">
              <input
                aria-label={`Series ${i + 1} name`}
                value={name}
                onChange={(event) =>
                  setSeries(series.map((item, j) => (i === j ? { ...item, name: event.target.value } : item)))
                }
              />
              {i > 0 && (
                <button
                  type="button"
                  className="button"
                  aria-label={`Remove series ${i + 1}`}
                  disabled={type === 'combo' && series.length === 2}
                  onClick={() => setSeries(series.filter((_, j) => j !== i))}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          <span />
          {labels.flatMap((label, row) => [
            <input
              key={`label-${row}`}
              aria-label={`Category ${row + 1}`}
              required
              maxLength={80}
              value={label}
              onChange={(event) =>
                setLabels(labels.map((item, i) => (i === row ? event.target.value : item)))
              }
            />,
            ...columns.map(({ values }, col) => (
              <input
                key={`value-${row}-${col}`}
                aria-label={col ? `Series ${col + 1}, value ${row + 1}` : `Value ${row + 1}`}
                type="number"
                required
                step="any"
                value={values[row]}
                onChange={(event) =>
                  setSeries(
                    series.map((item, i) =>
                      i === col
                        ? {
                            ...item,
                            values: item.values.map((value, j) => (j === row ? event.target.value : value)),
                          }
                        : item,
                    ),
                  )
                }
              />
            )),
            <button
              key={`remove-${row}`}
              type="button"
              className="button"
              aria-label={`Remove category ${row + 1}`}
              disabled={labels.length === 1}
              onClick={() => {
                setLabels(labels.filter((_, i) => i !== row));
                setSeries(
                  series.map((item) => ({ ...item, values: item.values.filter((_, i) => i !== row) })),
                );
              }}
            >
              <Trash2 size={14} />
            </button>,
          ])}
        </div>
      </div>
      {error && (
        <p role="alert" className="insert-error">
          {error}
        </p>
      )}
    </Form>
  );
}

function LinkForm({
  state,
  slides,
  close,
  save,
}: {
  state: Extract<InsertDialogState, { type: 'link' }>;
  slides: Slide[];
  close: () => void;
  save: (result: InsertResult) => void;
}) {
  const initialKind =
    state.entry === 'action' ? 'action' : state.entry === 'zoom' ? 'slide' : (state.link?.type ?? 'web');
  const [kind, setKind] = useState(initialKind);
  const [target, setTarget] = useState(state.link?.type === 'slide' ? state.link.part : slides[0].part);
  const [jump, setJump] = useState(state.link?.type === 'action' ? state.link.jump : 'nextslide');
  const [error, setError] = useState('');
  const slideChoices = slides.map((slide, i) => {
    const title = slide.objects
      .find((object) => object.kind === 'text' && object.text && !object.slideNumber)
      ?.text?.split('\n')[0];
    return [slide.part, title ? `${i + 1}. ${title.slice(0, 60)}` : `Slide ${i + 1}`] as const;
  });
  return (
    <Form
      close={close}
      label={state.objectId ? 'Save Link' : 'Insert Link'}
      submit={(form) => {
        const url = kind === 'web' ? webLink(String(form.get('url') || '')) : undefined;
        if (kind === 'web' && !url) {
          setError('Enter a full URL starting with https://, http://, or mailto:.');
          return;
        }
        const link: SlideLink = url
          ? { type: 'web', url }
          : kind === 'slide'
            ? { type: 'slide', part: target }
            : { type: 'action', jump };
        const label =
          String(form.get('label') || '').trim() ||
          (link.type === 'slide'
            ? (slideChoices.find(([part]) => part === target)?.[1] ?? 'Slide link')
            : state.entry === 'online'
              ? 'Play online video'
              : url || 'Slide link');
        save({ type: 'link', link, label, objectId: state.objectId });
      }}
    >
      {state.entry === 'link' && (
        <Dropdown
          label="Link target"
          previews={linkTargetPreviews}
          value={kind}
          choices={[
            ['web', 'Web address'],
            ['slide', 'Slide in this presentation'],
            ['action', 'Slide action'],
          ]}
          onChange={setKind}
        />
      )}
      {kind === 'web' && (
        <label>
          {state.entry === 'online' ? 'Video URL' : 'Address'}
          <input
            name="url"
            defaultValue={state.link?.type === 'web' ? state.link.url : ''}
            placeholder="https://example.com"
            required
          />
        </label>
      )}
      {kind === 'slide' && (
        <Dropdown
          label="Destination slide"
          choices={slideChoices}
          value={target}
          onChange={setTarget}
          previews={Object.fromEntries(
            slides.map(({ part }, index) => [
              part,
              <span className="layout-preview numbered-layout-preview">{index + 1}</span>,
            ]),
          )}
        />
      )}
      {kind === 'action' && (
        <Dropdown
          label="Action destination"
          choices={jumpTargets}
          value={jump}
          previews={slideActionPreviews}
          onChange={setJump}
        />
      )}
      {!state.objectId && (
        <label>
          Display text <input name="label" maxLength={140} />
        </label>
      )}
      {state.entry === 'online' && (
        <p className="insert-explanation">The link opens the video in a new tab during the slide show.</p>
      )}
      {state.objectId && state.link && (
        <button
          type="button"
          className="button"
          onClick={() => save({ type: 'link', label: '', objectId: state.objectId })}
        >
          Remove Link
        </button>
      )}
      {error && (
        <p role="alert" className="insert-error">
          {error}
        </p>
      )}
    </Form>
  );
}

function CommentsForm({
  state,
  comments,
  close,
  save,
}: {
  state: Extract<InsertDialogState, { type: 'comment' }>;
  comments: SlideComment[];
  close: () => void;
  save: (result: InsertResult) => void;
}) {
  const [replyTo, reply] = useState<string>();
  const [showResolved, setShowResolved] = useState(false);
  const parent = comments.find(({ id }) => id === replyTo);
  const ids = new Set(comments.map(({ id }) => id));
  const roots = comments.filter((item) => !item.replyTo || !ids.has(item.replyTo));
  return (
    <Form
      label={parent ? 'Add Reply' : 'Add Comment'}
      close={close}
      submit={(form) => {
        const text = String(form.get('comment') || '').trim();
        const author = String(form.get('author') || '').trim() || 'Forma';
        if (text) save({ type: 'comment', text, author, replyTo: parent?.id });
      }}
    >
      {!!roots.length && (
        <>
          {roots.some(({ resolved }) => resolved) && (
            <label className="insert-check">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(event) => setShowResolved(event.target.checked)}
              />{' '}
              Show resolved threads
            </label>
          )}
          <ul className="insert-comments comment-threads">
            {roots
              .filter((item) => showResolved || !item.resolved)
              .map((item) => (
                <li key={item.id}>
                  <strong>{item.author}</strong>
                  {item.resolved && <small> · Resolved</small>}
                  <p>{item.text}</p>
                  {comments
                    .filter((comment) => comment.replyTo === item.id)
                    .map((comment) => (
                      <div className="comment-reply" key={comment.id}>
                        <strong>{comment.author}</strong>
                        <p>{comment.text}</p>
                      </div>
                    ))}
                  <div className="insert-form-row">
                    <button
                      type="button"
                      className="button"
                      disabled={item.resolved}
                      onClick={() => reply(item.id)}
                    >
                      Reply
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => save({ type: 'comment-resolve', id: item.id, resolved: !item.resolved })}
                    >
                      {item.resolved ? 'Reopen' : 'Resolve'}
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </>
      )}
      <label>
        Name <input name="author" maxLength={64} defaultValue={state.author} />
      </label>
      <label>
        {parent ? `Reply to ${parent.author}` : 'Comment'}{' '}
        <textarea name="comment" rows={3} maxLength={4000} required />
      </label>
      {parent && (
        <button type="button" className="button" onClick={() => reply(undefined)}>
          Cancel Reply
        </button>
      )}
    </Form>
  );
}

export function InsertDialog({
  state,
  slides,
  comments,
  close,
  save,
}: {
  state: InsertDialogState;
  slides: Slide[];
  comments: SlideComment[];
  close: () => void;
  save: (data: InsertResult) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  let title: string;
  let body: ReactNode;
  switch (state.type) {
    case 'table':
      title = state.objectId ? 'Edit table cells' : 'Insert Table';
      body = <TableForm state={state} save={save} close={close} />;
      break;
    case 'table-paste':
      title = 'Paste table data';
      body = (
        <Form
          label="Insert Table"
          close={close}
          submit={(form) => {
            const cells = String(form.get('data') || '')
              .replace(/\r\n?/g, '\n')
              .replace(/\n$/, '')
              .split('\n')
              .map((row) => row.split('\t'));
            const width = Math.max(1, ...cells.map((row) => row.length));
            if (cells.length > 100 || width > 40) {
              setError('Paste up to 100 rows and 40 columns.');
              return;
            }
            save({
              type: 'table',
              data: {
                header: form.has('header'),
                cells: cells.map((row) => Array.from({ length: width }, (_, column) => row[column] ?? '')),
              },
            });
          }}
        >
          <label>
            Cells copied from a spreadsheet{' '}
            <textarea name="data" rows={6} required placeholder="Paste tab-separated cells" />
          </label>
          <label className="insert-check">
            <input name="header" type="checkbox" defaultChecked /> Header row
          </label>
          {error && (
            <p role="alert" className="insert-error">
              {error}
            </p>
          )}
        </Form>
      );
      break;
    case 'chart':
      title = state.objectId ? 'Edit chart data' : 'Insert Chart';
      body = <ChartForm state={state} close={close} save={save} />;
      break;
    case 'link':
      title = linkTitles[state.entry];
      body = <LinkForm state={state} slides={slides} close={close} save={save} />;
      break;
    case 'footer':
      title = 'Header & Footer';
      body = (
        <Form
          label="Apply"
          close={close}
          submit={(form) =>
            save({
              type: 'footer',
              header: String(form.get('header') || '').trim(),
              footer: String(form.get('footer') || '').trim(),
              number: form.has('number'),
              date: form.has('date'),
              allSlides: form.has('all'),
            })
          }
        >
          <label>
            Header <input name="header" maxLength={200} />
          </label>
          <label>
            Footer <input name="footer" maxLength={200} />
          </label>
          <label className="insert-check">
            <input type="checkbox" name="date" /> Date
          </label>
          <label className="insert-check">
            <input type="checkbox" name="number" /> Slide number
          </label>
          <label className="insert-check">
            <input type="checkbox" name="all" /> Apply to all slides
          </label>
        </Form>
      );
      break;
    case 'equation':
      title = 'Insert Equation';
      body = (
        <Form
          label="Insert Equation"
          close={close}
          submit={(form) => {
            const text = String(form.get('equation') || '').trim();
            if (text) save({ type: 'equation', text });
          }}
        >
          <label>
            Equation text <textarea name="equation" rows={3} required placeholder="e.g. E = mc²" />
          </label>
        </Form>
      );
      break;
    case 'comment':
      title = 'Slide Comments';
      body = <CommentsForm state={state} comments={comments} close={close} save={save} />;
      break;
  }
  return (
    <dialog
      className="modal insert-dialog"
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <button className="modal-close" type="button" aria-label="Close dialog" onClick={close}>
        <X size={18} />
      </button>
      <h2 id={titleId}>{title}</h2>
      {body}
    </dialog>
  );
}
