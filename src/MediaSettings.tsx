import { useEffect, useRef, useState } from 'react';
import { SlideToolsDialog } from './SlideTools';
import type { Asset, MediaPlayback, SlideObject } from './types';
import { recordedWav } from './insertMedia';

export function MediaSettings({
  object,
  asset,
  close,
  save,
}: {
  object: SlideObject;
  asset: Asset;
  close: () => void;
  save: (settings: MediaPlayback, file?: File) => void;
}) {
  const current = object.mediaPlayback ?? {};
  const [duration, setDuration] = useState<number>();
  const [caption, setCaption] = useState<File>();
  const [clear, setClear] = useState(false);
  const [error, setError] = useState('');
  return (
    <SlideToolsDialog title="Media Playback" onClose={close}>
      <form
        className="insert-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const start = Number(data.get('start')),
            end = Number(data.get('end')) || undefined;
          const bookmarks = String(data.get('bookmarks') || '')
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => {
              const [time, ...name] = line.split(' ');
              return { time: Number(time), name: name.join(' ').trim() };
            });
          if (
            (end !== undefined && end <= start) ||
            (duration !== undefined && (start >= duration || (end ?? 0) > duration + 0.001))
          ) {
            setError('Choose a trim range within the clip.');
            return;
          }
          if (
            bookmarks.some(
              ({ time, name }) =>
                !Number.isFinite(time) || time < start || time > (end ?? duration ?? Infinity) || !name,
            ) ||
            new Set(bookmarks.map(({ name }) => name)).size !== bookmarks.length ||
            new Set(bookmarks.map(({ time }) => time)).size !== bookmarks.length
          ) {
            setError('Use a distinct time and name for each bookmark within the clip.');
            return;
          }
          if (caption && !/^\uFEFF?WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(await caption.text())) {
            setError('Choose a valid WebVTT caption file.');
            return;
          }
          save(
            {
              start,
              end,
              autoplay: data.has('autoplay'),
              loop: data.has('loop'),
              rewind: data.has('rewind'),
              volume: Number(data.get('volume')) / 100,
              bookmarks,
              captions: clear ? undefined : current.captions,
              captionLabel: caption?.name.replace(/\.vtt$/i, '') || current.captionLabel,
            },
            caption,
          );
        }}
      >
        {object.media === 'video' ? (
          <video
            className="media-settings-preview"
            src={asset.url}
            controls
            preload="metadata"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          />
        ) : (
          <audio
            src={asset.url}
            controls
            preload="metadata"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          />
        )}
        <div className="insert-form-row">
          <label>
            Trim start (s)
            <input name="start" type="number" min="0" step="any" defaultValue={current.start || 0} />
          </label>
          <label>
            Trim end (s)
            <input
              name="end"
              type="number"
              min="0"
              step="any"
              placeholder={duration?.toFixed(2) || 'End'}
              defaultValue={current.end}
            />
          </label>
          <label>
            Volume (%)
            <input
              name="volume"
              type="number"
              min="0"
              max="100"
              required
              defaultValue={Math.round((current.volume ?? 1) * 100)}
            />
          </label>
        </div>
        <div className="insert-form-row">
          {(
            [
              ['autoplay', 'Play automatically'],
              ['loop', 'Loop'],
              ['rewind', 'Rewind after playback'],
            ] as const
          ).map(([key, label]) => (
            <label className="insert-check" key={key}>
              <input name={key} type="checkbox" defaultChecked={current[key]} /> {label}
            </label>
          ))}
        </div>
        <label>
          Bookmarks <small>One per line. Enter seconds, a space, then a name.</small>
          <textarea
            name="bookmarks"
            rows={3}
            defaultValue={current.bookmarks?.map(({ time, name }) => `${time} ${name}`).join('\n')}
          />
        </label>
        <label>
          WebVTT captions
          <input
            type="file"
            accept=".vtt,text/vtt"
            onChange={(e) => {
              setCaption(e.target.files?.[0]);
              setClear(false);
            }}
          />
        </label>
        {current.captions && (
          <label className="insert-check">
            <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} /> Remove{' '}
            {current.captionLabel || 'captions'}
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="insert-dialog-actions">
          <button className="button primary" type="submit">
            Apply Playback Settings
          </button>
        </div>
      </form>
    </SlideToolsDialog>
  );
}

export function RecordAudio({
  close,
  insert,
  mode = 'audio',
}: {
  close: () => void;
  insert: (file: File) => void;
  mode?: 'audio' | 'narration' | 'camera';
}) {
  const camera = mode === 'camera';
  const video = useRef<HTMLVideoElement>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream>();
  useEffect(() => {
    if (video.current) video.current.srcObject = previewStream ?? null;
  }, [previewStream]);
  const active = useRef<MediaRecorder | undefined>(undefined);
  const mounted = useRef(true);
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [file, setFile] = useState<File>();
  const [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);
  async function start() {
    setWorking(true);
    setError('');
    let stream: MediaStream | undefined;
    try {
      const mimeType = camera
        ? ['video/mp4;codecs=avc1.42001E,mp4a.40.2', 'video/mp4'].find((mime) =>
            MediaRecorder.isTypeSupported(mime),
          )
        : undefined;
      if (camera && !mimeType) {
        setError('This browser cannot record MP4. Try recording narration instead.');
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: camera ? { width: { ideal: 640 }, height: { ideal: 360 } } : false,
      });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: camera ? 1000000 : undefined,
      });
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = ({ data }) => {
        if (data.size) {
          chunks.push(data);
          bytes += data.size;
          if (bytes >= 35 * 1024 * 1024 && recorder.state === 'recording') recorder.stop();
        }
      };
      recorder.onstop = async () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        if (!mounted.current) return;
        setRecording(false);
        setPreviewStream(undefined);
        setWorking(true);
        try {
          const recording = new Blob(chunks, { type: camera ? 'video/mp4' : recorder.mimeType });
          const file = camera
            ? new File([recording], 'Camera recording.mp4', { type: 'video/mp4' })
            : await recordedWav(recording);
          if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('Recordings must be under 50 MB.');
          if (mounted.current) setFile(file);
        } catch (error) {
          if (mounted.current)
            setError(error instanceof Error ? error.message : 'The recording could not be decoded.');
        } finally {
          if (mounted.current) setWorking(false);
        }
      };
      active.current = recorder;
      recorder.start(400);
      if (camera) setPreviewStream(stream);
      setRecording(true);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (mounted.current)
        setError(
          camera ? 'Camera or microphone access is unavailable.' : 'Microphone access is unavailable.',
        );
    } finally {
      if (mounted.current) setWorking(false);
    }
  }
  return (
    <SlideToolsDialog
      title={camera ? 'Record Camera' : mode === 'narration' ? 'Record Narration' : 'Record Audio'}
      onClose={close}
    >
      <div className="insert-form">
        {error && <p role="alert">{error}</p>}
        {recording && <p role="status">Recording</p>}
        {camera && recording && (
          <video ref={video} className="media-settings-preview" muted autoPlay playsInline />
        )}
        <div className="insert-form-row">
          <button
            className="button"
            type="button"
            disabled={working}
            onClick={() => (recording ? active.current?.stop() : void start())}
          >
            {recording ? 'Stop recording' : file ? 'Record again' : 'Start recording'}
          </button>
          <button
            className="button primary"
            type="button"
            disabled={!file || working || recording}
            onClick={() => file && insert(file)}
          >
            Insert Recording
          </button>
        </div>
      </div>
    </SlideToolsDialog>
  );
}
