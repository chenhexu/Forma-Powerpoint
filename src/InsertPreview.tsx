import { Film, Music2 } from 'lucide-react';
import { chartColors, chartSeries, mergeAt, proportions, tableFill } from './insertContent';
import type { Asset, ChartData, SlideObject, TableData } from './types';

export function TablePreview({ data, width, height }: { data: TableData; width: number; height: number }) {
  const columns = proportions(data.cells[0].length, 10000, data.widths);
  const rows = proportions(data.cells.length, 10000, data.heights);
  const fontSize = Math.max(
    6,
    Math.min(20, width / data.cells[0].length / 4, height / data.cells.length / 2),
  );
  return (
    <table className="insert-table-preview" style={{ fontSize }}>
      <colgroup>
        {columns.map((size, i) => (
          <col key={i} style={{ width: size / 100 + '%' }} />
        ))}
      </colgroup>
      <tbody>
        {data.cells.map((row, r) => (
          <tr key={r} style={{ height: rows[r] / 100 + '%' }}>
            {row.map((text, c) => {
              const region = mergeAt(data, r, c);
              if (region && (region.row !== r || region.column !== c)) return null;
              const edge = data.borders?.[r]?.[c];
              const head = data.header && r === 0;
              const Cell = head ? 'th' : 'td';
              return (
                <Cell
                  key={c}
                  rowSpan={region?.rows}
                  colSpan={region?.columns}
                  style={{
                    background: tableFill(data, r, c),
                    color: head ? '#fff' : '#252438',
                    borderTopColor: edge?.T,
                    borderBottomColor: edge?.B,
                    borderLeftColor: edge?.L,
                    borderRightColor: edge?.R,
                  }}
                >
                  {text}
                </Cell>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChartPreview({ data, width, height }: { data: ChartData; width: number; height: number }) {
  const series = chartSeries(data);
  const ranges =
    data.type === 'stacked'
      ? data.points.flatMap((_, i) => {
          const values = series.map(({ values }) => values[i]);
          return [
            values.reduce((sum, value) => sum + Math.max(0, value), 0),
            values.reduce((sum, value) => sum + Math.min(0, value), 0),
          ];
        })
      : series.flatMap(({ values }) => values);
  const min = Math.min(0, ...ranges);
  const max = Math.max(0, ...ranges);
  const clipLabel = (label: string) => (label.length > 16 ? label.slice(0, 15) + '…' : label);
  if (data.type === 'pie') {
    const total = data.points.reduce((sum, { value }) => sum + Math.max(0, value), 0) || 1;
    const radius = Math.min(width * 0.22, height * 0.4);
    const circumference = Math.PI * 2 * radius;
    const step = Math.min(25, (height * 0.83) / data.points.length);
    let offset = 0;
    return (
      <svg
        className="insert-chart-preview"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Pie chart"
      >
        <rect width={width} height={height} fill="white" />
        {data.points.map(({ label, value }, i) => {
          const length = (circumference * Math.max(0, value)) / total;
          const start = offset;
          offset += length;
          const x = width * 0.58,
            y = (height - step * data.points.length) / 2 + i * step;
          const fill = chartColors[i % chartColors.length];
          return (
            <g key={i}>
              {length > 0 && (
                <circle
                  cx={width * 0.29}
                  cy={height / 2}
                  r={radius / 2}
                  fill="none"
                  stroke={fill}
                  strokeWidth={radius}
                  strokeDasharray={`${length / 2} ${circumference / 2}`}
                  strokeDashoffset={-start / 2}
                  transform={`rotate(-90 ${width * 0.29} ${height / 2})`}
                />
              )}
              <rect x={x} y={y + step * 0.2} width={step * 0.6} height={step * 0.6} fill={fill} />
              <text
                x={x + step}
                y={y + step * 0.52}
                dominantBaseline="central"
                fill="#535064"
                fontSize={step * 0.63}
              >
                {clipLabel(label)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }
  if (data.type === 'bar') {
    const left = width * 0.31,
      span = width * 0.64,
      top = height * 0.09;
    const row = (height * 0.83) / data.points.length;
    const x = (value: number) => left + ((value - min) * span) / (max - min || 1);
    return (
      <svg
        className="insert-chart-preview"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Bar chart"
      >
        <rect width={width} height={height} fill="white" />
        <path d={`M ${x(0)} ${top} v ${height * 0.83}`} stroke="#ddd6ed" />
        {data.points.map(({ label, value }, i) => (
          <g key={i}>
            <text
              x={left - width * 0.02}
              y={top + row * (i + 0.5)}
              dominantBaseline="central"
              textAnchor="end"
              fill="#535064"
              fontSize={Math.min(16, row * 0.5)}
            >
              {clipLabel(label)}
            </text>
            {series.map(({ values }, j) => (
              <rect
                key={j}
                x={Math.min(x(0), x(values[i]))}
                y={top + row * (i + 0.19 + (j * 0.62) / series.length)}
                width={Math.abs(x(values[i]) - x(0))}
                height={(row * 0.62) / series.length}
                fill={chartColors[j % chartColors.length]}
              />
            ))}
          </g>
        ))}
      </svg>
    );
  }
  const left = width * 0.14,
    top = height * 0.08,
    bottom = height * 0.82;
  const plotWidth = width * 0.81;
  const y = (value: number) => bottom - ((value - min) * (bottom - top)) / (max - min || 1);
  const tick = plotWidth / data.points.length;
  const font = Math.min(16, height * 0.075, tick / 3);
  const points = data.points.map(({ label }, i) => ({ label, x: left + (i + 0.5) * tick }));
  const barSeries = data.type === 'line' ? 0 : data.type === 'combo' ? 1 : series.length;
  return (
    <svg
      className="insert-chart-preview"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={data.type === 'column' ? 'Column chart' : 'Line chart'}
    >
      <rect width={width} height={height} fill="white" />
      {[0, 1, 2, 3, 4].map((step) => {
        const value = min + (step * (max - min || 1)) / 4;
        const position = y(value);
        return (
          <g key={step}>
            <path d={`M ${left} ${position} h ${plotWidth}`} stroke="#e2ddeb" />
            <text
              x={left - font / 2}
              y={position}
              dominantBaseline="central"
              textAnchor="end"
              fill="#535064"
              fontSize={font}
            >
              {Number(value.toPrecision(3))}
            </text>
          </g>
        );
      })}
      {series.map(({ values, name }, j) => {
        const fill = chartColors[j % chartColors.length];
        if (j >= barSeries)
          return (
            <g key={j}>
              <title>{name}</title>
              <polyline
                points={points.map(({ x }, i) => x + ',' + y(values[i])).join(' ')}
                stroke={fill}
                strokeWidth={font / 4}
                fill="none"
              />
              {points.map(({ x }, i) => (
                <circle key={i} cx={x} cy={y(values[i])} r={font / 4} fill={fill} />
              ))}
            </g>
          );
        return (
          <g key={j}>
            <title>{name}</title>
            {points.map(({ x }, i) => {
              const value = values[i];
              const stacked = data.type === 'stacked';
              const base = stacked
                ? series
                    .slice(0, j)
                    .reduce(
                      (sum, entry) =>
                        sum + (Math.sign(entry.values[i]) === Math.sign(value) ? entry.values[i] : 0),
                      0,
                    )
                : 0;
              const w = (tick * 0.64) / (stacked ? 1 : barSeries);
              return (
                <rect
                  key={i}
                  x={x - tick * 0.32 + (stacked ? 0 : j * w)}
                  y={Math.min(y(base), y(base + value))}
                  width={w}
                  height={Math.abs(y(base) - y(base + value))}
                  fill={fill}
                />
              );
            })}
          </g>
        );
      })}
      {points.map(({ label, x }, i) => (
        <g key={i}>
          <text x={x} y={bottom + font * 1.65} textAnchor="middle" fill="#535064" fontSize={font}>
            {clipLabel(label)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function MediaPreview({
  object,
  assets,
  playing,
}: {
  object: SlideObject;
  assets: Record<string, Asset>;
  playing?: boolean;
}) {
  const file = object.asset && assets[object.asset];
  const poster = object.preview ? assets[object.preview]?.url : undefined;
  const settings = object.mediaPlayback;
  const caption = settings?.captions && assets[settings.captions];
  const track = caption ? (
    <track
      kind="captions"
      label={settings?.captionLabel || 'Captions'}
      src={caption.url}
      srcLang="en"
      default
    />
  ) : null;
  const playback = {
    controls: true,
    autoPlay: settings?.autoplay,
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      event.currentTarget.currentTime = settings?.start ?? 0;
      event.currentTarget.volume = settings?.volume ?? 1;
    },
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const player = event.currentTarget;
      if (settings?.end !== undefined && player.currentTime >= settings.end) {
        if (!settings.loop) player.pause();
        if (settings.loop || settings.rewind) player.currentTime = settings.start ?? 0;
      }
    },
    onEnded: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const player = event.currentTarget;
      if (settings?.loop || settings?.rewind) player.currentTime = settings.start ?? 0;
      if (settings?.loop) void player.play().catch(() => {});
    },
  };
  if (playing && file) {
    return (
      <div className="insert-media-player" onClick={(event) => event.stopPropagation()}>
        {object.media === 'video' ? (
          <video
            {...playback}
            src={file.url}
            poster={poster}
            playsInline
            preload="metadata"
            aria-label={object.name}
          >
            {track}
          </video>
        ) : (
          <audio {...playback} src={file.url} preload="metadata" aria-label={object.name}>
            {track}
          </audio>
        )}
      </div>
    );
  }
  if (poster) return <img draggable={false} src={poster} alt={object.altText || object.name} />;
  return (
    <div className="placeholder">
      {object.media === 'video' ? <Film /> : <Music2 />}
      <span>{object.name}</span>
    </div>
  );
}
