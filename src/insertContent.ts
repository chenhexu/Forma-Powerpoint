import JSZip from 'jszip';
import { EMU, type ChartData, type SlideLink, type TableData, type TableEdge } from './types';
import { NS, all, child, esc, first, fragment, parseXml, resolvePart } from './xml';

export const tableUri = 'http://schemas.openxmlformats.org/drawingml/2006/table';
export const chartContentType = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
export const workbookContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const chartColors = ['#7253c8', '#348c8a', '#cf7b39', '#5182bd', '#b45591', '#758229'];
export const jumpTargets: [Extract<SlideLink, { type: 'action' }>['jump'], string][] = [
  ['nextslide', 'Next slide'],
  ['previousslide', 'Previous slide'],
  ['firstslide', 'First slide'],
  ['lastslide', 'Last slide'],
  ['endshow', 'End slide show'],
];

export function webLink(value: string) {
  try {
    const url = new URL(value.trim());
    if (['http:', 'https:', 'mailto:'].includes(url.protocol)) return url.href;
  } catch {
    return undefined;
  }
}

const rowsOf = (table: Element) => Array.from(table.children).filter((node) => node.localName === 'tr');
const cellsOf = (row: Element) => Array.from(row.children).filter((node) => node.localName === 'tc');
const cellText = (cell: Element) =>
  all(cell, 'p')
    .map((paragraph) =>
      all(paragraph, 't')
        .map((run) => run.textContent || '')
        .join(''),
    )
    .join('\n');

export function tableFill(table: TableData, row: number, column: number) {
  return (
    table.fills?.[row]?.[column] || (table.header && row === 0 ? '#6345bd' : row % 2 ? '#f4effc' : '#ffffff')
  );
}

export const tableEdges: TableEdge[] = ['L', 'R', 'T', 'B'];
export const mergeAt = (table: TableData, row: number, column: number) =>
  table.merges?.find(
    (range) =>
      row >= range.row &&
      row < range.row + range.rows &&
      column >= range.column &&
      column < range.column + range.columns,
  );

export function readTable(table: Element): TableData | undefined {
  const rows = rowsOf(table);
  const grid = child(table, 'tblGrid');
  const widths = Array.from(grid?.children || []).map((node) => Number(node.getAttribute('w')));
  const heights = rows.map((row) => Number(row.getAttribute('h')));
  if (
    !widths.length ||
    !rows.length ||
    widths.length > 40 ||
    rows.length > 100 ||
    [...widths, ...heights].some((length) => !Number.isFinite(length) || length <= 0)
  )
    return;
  const matrix = rows.map(cellsOf);
  if (matrix.some((row) => row.length !== widths.length)) return;
  const merges: NonNullable<TableData['merges']> = [];
  matrix.forEach((row, r) =>
    row.forEach((cell, c) => {
      const covered = ['hMerge', 'vMerge'].some((name) =>
        ['1', 'true'].includes(cell.getAttribute(name) || ''),
      );
      if (covered) return;
      const rows = Number(cell.getAttribute('rowSpan') || 1);
      const columns = Number(cell.getAttribute('gridSpan') || 1);
      if (
        (rows > 1 || columns > 1) &&
        rows >= 1 &&
        columns >= 1 &&
        r + rows <= matrix.length &&
        c + columns <= widths.length
      )
        merges.push({ row: r, column: c, rows, columns });
    }),
  );
  return {
    widths,
    heights,
    merges: merges.length ? merges : undefined,
    borders: matrix.map((row) =>
      row.map((cell) => {
        const props = child(cell, 'tcPr');
        return Object.fromEntries(
          tableEdges.flatMap((edge) => {
            const line = props && child(props, 'ln' + edge);
            if (!line) return [];
            const hex = first(line, 'srgbClr')?.getAttribute('val');
            if (hex && /^[\da-f]{6}$/i.test(hex)) return [[edge, '#' + hex]];
            return child(line, 'noFill') ? [[edge, 'transparent']] : [];
          }),
        );
      }),
    ),
    header: ['1', 'true'].includes(child(table, 'tblPr')?.getAttribute('firstRow') || ''),
    cells: matrix.map((row) => row.map(cellText)),
    fills: matrix.map((row) =>
      row.map((cell) => {
        const paint = child(child(cell, 'tcPr') ?? cell, 'solidFill');
        const rgb = paint && child(paint, 'srgbClr')?.getAttribute('val');
        return rgb && /^[\da-f]{6}$/i.test(rgb) ? '#' + rgb : '';
      }),
    ),
  };
}

export function proportions(length: number, total: number, weights?: number[]) {
  const values = weights?.length === length ? weights : Array.from({ length }, () => 1);
  const sum = values.reduce((a, b) => a + b, 0);
  let used = 0;
  return values.map((value, i) => {
    const start = used;
    used += value;
    return Math.round((total * used) / sum) - Math.round((total * start) / sum);
  });
}

const cellInsets = 'marL="85725" marR="85725" marT="57150" marB="57150" anchor="ctr"';
const rgb = (hex: string) => `<a:solidFill><a:srgbClr val="${hex.slice(1)}"/></a:solidFill>`;
function tableParagraph(text: string, header: boolean) {
  return `<a:p><a:r><a:rPr lang="en-US" sz="1500" b="${header ? 1 : 0}">${rgb(header ? '#ffffff' : '#252438')}</a:rPr><a:t>${esc(text)}</a:t></a:r><a:endParaRPr lang="en-US" sz="1500"/></a:p>`;
}

function cellSpan(data: TableData, r: number, c: number) {
  const merge = mergeAt(data, r, c);
  if (!merge) return {};
  return {
    ...(r === merge.row && merge.rows > 1 ? { rowSpan: String(merge.rows) } : {}),
    ...(c === merge.column && merge.columns > 1 ? { gridSpan: String(merge.columns) } : {}),
    ...(c > merge.column ? { hMerge: '1' } : {}),
    ...(r > merge.row ? { vMerge: '1' } : {}),
  };
}

function borderXml(edge: TableEdge, color: string) {
  return `<a:ln${edge} w="9525">${color === 'transparent' ? '<a:noFill/>' : rgb(color)}</a:ln${edge}>`;
}

function tableCellXml(data: TableData, r: number, c: number) {
  const borders = tableEdges
    .map((edge) => borderXml(edge, data.borders?.[r]?.[c]?.[edge] ?? '#ddd6ed'))
    .join('');
  const span = Object.entries(cellSpan(data, r, c))
    .map(([key, value]) => ` ${key}="${value}"`)
    .join('');
  const paragraphs = data.cells[r][c]
    .split('\n')
    .map((line) => tableParagraph(line, data.header && r === 0))
    .join('');
  return `<a:tc${span}><a:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</a:txBody><a:tcPr ${cellInsets}>${borders}${rgb(tableFill(data, r, c))}</a:tcPr></a:tc>`;
}

export function tableXml(data: TableData, width: number, height: number) {
  const columns = proportions(data.cells[0].length, Math.round(width * EMU), data.widths);
  const rows = proportions(data.cells.length, Math.round(height * EMU), data.heights);
  return `<a:tbl><a:tblPr firstRow="${data.header ? 1 : 0}" bandRow="0"/><a:tblGrid>${columns.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${data.cells
    .map((row, r) => `<a:tr h="${rows[r]}">${row.map((_, c) => tableCellXml(data, r, c)).join('')}</a:tr>`)
    .join('')}</a:tbl>`;
}

export function patchTable(
  doc: Document,
  table: Element,
  data: TableData,
  width: number,
  height: number,
  resize: boolean,
) {
  const rows = rowsOf(table);
  const grid = child(table, 'tblGrid');
  if (!grid) return;
  const columnCount = data.cells[0].length;
  const structural = rows.length !== data.cells.length || grid.children.length !== columnCount;
  if (resize || structural) {
    const sizes = proportions(columnCount, Math.round(width * EMU), data.widths);
    while (grid.children.length > columnCount) grid.lastElementChild?.remove();
    sizes.forEach((size, column) => {
      const col = grid.children[column] ?? grid.appendChild(fragment(doc, '<a:gridCol/>'));
      col.setAttribute('w', String(size));
    });
  }
  const heights = proportions(data.cells.length, Math.round(height * EMU), data.heights);
  const props = child(table, 'tblPr');
  if (props && data.header !== ['1', 'true'].includes(props.getAttribute('firstRow') || ''))
    props.setAttribute('firstRow', data.header ? '1' : '0');
  rows.slice(data.cells.length).forEach((row) => row.remove());
  data.cells.forEach((texts, r) => {
    const row = rows[r] ?? table.appendChild(fragment(doc, '<a:tr/>'));
    if (resize || structural) row.setAttribute('h', String(heights[r]));
    const cells = cellsOf(row);
    cells.slice(columnCount).forEach((cell) => cell.remove());
    texts.forEach((text, c) => {
      if (!cells[c]) {
        row.append(fragment(doc, tableCellXml(data, r, c)));
        return;
      }
      const cell = cells[c];
      const span = cellSpan(data, r, c);
      for (const key of ['rowSpan', 'gridSpan', 'hMerge', 'vMerge'] as const) {
        if (span[key]) cell.setAttribute(key, span[key]!);
        else cell.removeAttribute(key);
      }
      const styling = child(cell, 'tcPr');
      for (const edge of tableEdges) {
        const color = data.borders?.[r]?.[c]?.[edge];
        if (!color || !styling) continue;
        const previous = child(styling, 'ln' + edge);
        const rgb = previous && first(previous, 'srgbClr')?.getAttribute('val');
        if (color === (rgb ? '#' + rgb : previous && child(previous, 'noFill') ? 'transparent' : ''))
          continue;
        const replacement = fragment(doc, borderXml(edge, color));
        if (previous) previous.replaceWith(replacement);
        else {
          const slot = Array.from(styling.children).find(
            (node) =>
              !/^ln[LRTB]$/.test(node.localName) ||
              tableEdges.indexOf(node.localName.slice(2) as TableEdge) > tableEdges.indexOf(edge),
          );
          styling.insertBefore(replacement, slot ?? null);
        }
      }
      const body = child(cell, 'txBody');
      if (!body || cellText(cell) === text) return;
      const template = first(body, 'p');
      const style = template && first(template, 'rPr');
      const paragraphStyle = template && child(template, 'pPr');
      all(body, 'p').forEach((paragraph) => paragraph.remove());
      for (const line of text.split('\n')) {
        const paragraph = fragment(doc, tableParagraph(line, data.header && r === 0));
        const runStyle = first(paragraph, 'rPr');
        if (style && runStyle) runStyle.replaceWith(style.cloneNode(true));
        if (paragraphStyle) paragraph.prepend(paragraphStyle.cloneNode(true));
        body.append(paragraph);
      }
    });
  });
}

export function chartSeries(data: ChartData) {
  const primary = { name: data.firstSeries || 'Value', values: data.points.map(({ value }) => value) };
  const extra = data.series?.length
    ? data.series
    : data.type === 'combo'
      ? [{ name: 'Trend', values: primary.values.map((value) => value * 0.75) }]
      : [];
  return data.type === 'pie' ? [primary] : [primary, ...extra];
}

export function readChart(doc: Document): ChartData | undefined {
  const plot = first(doc, 'plotArea');
  const charts = Array.from(plot?.children ?? []).filter((node) => node.localName.endsWith('Chart'));
  if (
    !charts.length ||
    charts.length > 2 ||
    charts.some((node) => !['barChart', 'lineChart', 'pieChart'].includes(node.localName))
  )
    return;
  const nodes = charts.flatMap((chart) =>
    Array.from(chart.children).filter((node) => node.localName === 'ser'),
  );
  const series = nodes.map((node) => ({
    name: first(child(node, 'tx') || node, 'v')?.textContent || 'Value',
    labels: all(child(node, 'cat') || node, 'pt').map((p) => child(p, 'v')?.textContent || ''),
    values: all(child(node, 'val') || node, 'pt').map((p) => Number(child(p, 'v')?.textContent)),
  }));
  const primary = series[0];
  if (
    !primary?.labels.length ||
    series.some(
      ({ values }) =>
        values.length !== primary.labels.length ||
        values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e15),
    )
  )
    return;
  const chart = charts[0];
  const type =
    charts.length === 2
      ? 'combo'
      : chart.localName === 'pieChart'
        ? 'pie'
        : chart.localName === 'lineChart'
          ? 'line'
          : child(chart, 'grouping')?.getAttribute('val') === 'stacked'
            ? 'stacked'
            : child(chart, 'barDir')?.getAttribute('val') === 'bar'
              ? 'bar'
              : 'column';
  return {
    type,
    firstSeries: primary.name,
    points: primary.labels.map((label, i) => ({ label, value: primary.values[i] })),
    series: series.length > 1 ? series.slice(1).map(({ name, values }) => ({ name, values })) : undefined,
  };
}

export function chartXml(data: ChartData) {
  const series = chartSeries(data);
  const size = data.points.length;
  const idX = 12345,
    idY = 67890;
  const ids = `<c:axId val="${idX}"/><c:axId val="${idY}"/>`;
  const cache = (type: 'str' | 'num', column: string, values: (number | string)[], firstRow = 2) =>
    `<c:${type}Ref><c:f>Data!$${column}$${firstRow}${values.length === 1 ? '' : ':$' + column + '$' + (firstRow + values.length - 1)}</c:f><c:${type}Cache>${type === 'num' ? '<c:formatCode>General</c:formatCode>' : ''}<c:ptCount val="${values.length}"/>${values.map((value, i) => `<c:pt idx="${i}"><c:v>${esc(value)}</c:v></c:pt>`).join('')}</c:${type}Cache></c:${type}Ref>`;
  function writeSeries(i: number, kind: 'bar' | 'pie' | 'line') {
    const column = String.fromCharCode(66 + i);
    const color = chartColors[i % chartColors.length];
    const format =
      kind === 'pie'
        ? data.points
            .map(
              (_, j) =>
                `<c:dPt><c:idx val="${j}"/><c:spPr>${rgb(chartColors[j % chartColors.length])}</c:spPr></c:dPt>`,
            )
            .join('')
        : `<c:spPr>${rgb(color)}<a:ln w="${kind === 'line' ? 38100 : 0}">${rgb(color)}</a:ln></c:spPr>${kind === 'line' ? '<c:marker><c:symbol val="circle"/><c:size val="7"/></c:marker>' : ''}`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx>${cache('str', column, [series[i].name], 1)}</c:tx>${format}<c:cat>${cache(
      'str',
      'A',
      data.points.map(({ label }) => label),
    )}</c:cat><c:val>${cache('num', column, series[i].values.slice(0, size))}</c:val></c:ser>`;
  }
  const pie = data.type === 'pie',
    horizontal = data.type === 'bar',
    stack = data.type === 'stacked';
  const bar = (indices: number[]) =>
    `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="${stack ? 'stacked' : 'clustered'}"/>${indices.map((i) => writeSeries(i, 'bar')).join('')}<c:gapWidth val="65"/>${stack ? '<c:overlap val="100"/>' : ''}${ids}</c:barChart>`;
  const line = (indices: number[]) =>
    `<c:lineChart><c:grouping val="standard"/>${indices.map((i) => writeSeries(i, 'line')).join('')}${ids}</c:lineChart>`;
  const indices = series.map((_, i) => i);
  const plot = pie
    ? `<c:pieChart><c:varyColors val="1"/>${writeSeries(0, 'pie')}</c:pieChart>`
    : data.type === 'combo'
      ? bar([0]) + line(indices.slice(1))
      : data.type === 'line'
        ? line(indices)
        : bar(indices);
  const axis = (id: number, side: string) =>
    `<c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${side}"/>`;
  const cross = (id: number) =>
    `<c:tickLblPos val="nextTo"/><c:crossAx val="${id}"/><c:crosses val="autoZero"/>`;
  const axes = pie
    ? ''
    : `<c:catAx>${axis(idX, horizontal ? 'l' : 'b')}${cross(idY)}<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx>${axis(idY, horizontal ? 'b' : 'l')}<c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/>${cross(idX)}<c:crossBetween val="between"/></c:valAx>`;
  const legend =
    pie || series.length > 1 ? '<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>' : '';
  return `<c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><c:lang val="en-US"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>${plot}${axes}</c:plotArea>${legend}<c:plotVisOnly val="1"/></c:chart><c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}

export async function readChartWorkbook(file: File, type: ChartData['type']): Promise<ChartData> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a workbook smaller than 20 MB.');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const work = zip.file('xl/workbook.xml');
  const rels = zip.file('xl/_rels/workbook.xml.rels');
  if (!work || !rels) throw new Error('Choose an Excel .xlsx file.');
  const sheet = first(parseXml(await work.async('string')), 'sheet');
  const id = sheet?.getAttributeNS(NS.r, 'id');
  const rel = all(parseXml(await rels.async('string')), 'Relationship').find(
    (node) => node.getAttribute('Id') === id,
  );
  const target = rel?.getAttribute('Target');
  const table = target && zip.file(resolvePart('xl/workbook.xml', target));
  if (!table) throw new Error('The workbook has no readable sheet.');
  const strings = zip.file('xl/sharedStrings.xml');
  const shared = strings
    ? all(parseXml(await strings.async('string')), 'si').map((node) => node.textContent || '')
    : [];
  const rows = all(parseXml(await table.async('string')), 'row')
    .slice(0, 101)
    .map((row) => {
      const cells: string[] = [];
      for (const cell of all(row, 'c')) {
        const index = (cell.getAttribute('r') || '').charCodeAt(0) - 65;
        if (!/^[A-G]\d+$/.test(cell.getAttribute('r') || '')) continue;
        const number = child(cell, 'v')?.textContent || '';
        cells[index] =
          cell.getAttribute('t') === 's'
            ? shared[Number(number)] || ''
            : cell.getAttribute('t') === 'inlineStr'
              ? child(cell, 'is')?.textContent || ''
              : number;
      }
      return cells;
    });
  const [headers, ...values] = rows;
  const series = (headers || []).slice(1).filter(Boolean);
  const usable = values.filter(
    (row) =>
      row[0] &&
      series.every(
        (_, i) => row[i + 1] !== undefined && row[i + 1] !== '' && Number.isFinite(Number(row[i + 1])),
      ),
  );
  if (!series.length || !usable.length)
    throw new Error('Use category labels in column A and named numeric columns from column B.');
  return {
    type,
    firstSeries: series[0],
    workbookName: file.name,
    points: usable.map((row) => ({ label: row[0], value: Number(row[1]) })),
    series: series.slice(1).map((name, i) => ({ name, values: usable.map((row) => Number(row[i + 2])) })),
  };
}

export async function chartWorkbook(data: ChartData) {
  const zip = new JSZip();
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relation = (type: string, target: string) =>
    `<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.r}/${type}" Target="${target}"/></Relationships>`;
  zip.file(
    '[Content_Types].xml',
    `<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="${workbookContentType}.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  zip.file('_rels/.rels', relation('officeDocument', 'xl/workbook.xml'));
  zip.file(
    'xl/workbook.xml',
    `<workbook xmlns="${main}" xmlns:r="${NS.r}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file('xl/_rels/workbook.xml.rels', relation('worksheet', 'worksheets/sheet1.xml'));
  const stringCell = (cell: string, value: string) =>
    `<c r="${cell}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
  const series = chartSeries(data);
  const entries = data.points
    .map(({ label }, i) => {
      const row = i + 2;
      return `<row r="${row}">${stringCell('A' + row, label)}${series.map(({ values }, j) => `<c r="${String.fromCharCode(66 + j)}${row}"><v>${values[i]}</v></c>`).join('')}</row>`;
    })
    .join('');
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="${main}"><sheetData><row r="1">${stringCell('A1', 'Category')}${series.map(({ name }, i) => stringCell(String.fromCharCode(66 + i) + '1', name)).join('')}</row>${entries}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
