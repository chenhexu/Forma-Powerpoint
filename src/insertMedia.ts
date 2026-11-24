function canvasPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not create a PNG preview.'))),
      'image/png',
    );
  });
}

function nextFrame(video: HTMLVideoElement) {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', failed);
    };
    const ready = () => {
      cancel();
      resolve();
    };
    const failed = () => {
      cancel();
      reject(new Error('The browser could not read the video frame.'));
    };
    const timer = setTimeout(failed, 6000);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('error', failed);
  });
}

async function videoFrame(source: string | MediaStream, limit: number) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (typeof source === 'string') video.src = source;
  else {
    video.srcObject = source;
    void video.play().catch(() => {});
  }
  try {
    await nextFrame(video);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, limit / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { png: await canvasPng(canvas), ratio: canvas.width / canvas.height };
  } finally {
    video.pause();
    video.srcObject = null;
    video.removeAttribute('src');
    video.load();
  }
}

export async function captureScreenshot() {
  if (!navigator.mediaDevices?.getDisplayMedia)
    throw new Error('Screen capture is unavailable in this browser. Choose Screenshot from File instead.');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const { png } = await videoFrame(stream, 3840);
    return new File([png], 'Screenshot.png', { type: 'image/png' });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export async function mediaPoster(type: 'video' | 'audio', url: string) {
  if (type === 'video') {
    try {
      return await videoFrame(url, 1024);
    } catch {
      // PowerPoint can read some MP4 codecs which the browser cannot decode for a poster.
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = type === 'video' ? 360 : 125;
  const context = canvas.getContext('2d')!;
  context.fillStyle = type === 'video' ? '#171526' : '#eee8ff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = type === 'video' ? '#fff' : '#6345bd';
  context.font = '600 48px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(type === 'video' ? '▶' : '♫', canvas.width / 2, canvas.height / 2);
  return { png: await canvasPng(canvas), ratio: canvas.width / canvas.height };
}

export async function recordedWav(recording: Blob) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await recording.arrayBuffer());
    const frames = buffer.length;
    const channels = Math.min(buffer.numberOfChannels, 2);
    const bytes = frames * channels * 2;
    const wav = new DataView(new ArrayBuffer(44 + bytes));
    const four = (at: number, value: string) =>
      Array.from(value).forEach((c, i) => wav.setUint8(at + i, c.charCodeAt(0)));
    four(0, 'RIFF');
    wav.setUint32(4, 36 + bytes, true);
    four(8, 'WAVE');
    four(12, 'fmt ');
    wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true);
    wav.setUint16(22, channels, true);
    wav.setUint32(24, buffer.sampleRate, true);
    wav.setUint32(28, buffer.sampleRate * channels * 2, true);
    wav.setUint16(32, channels * 2, true);
    wav.setUint16(34, 16, true);
    four(36, 'data');
    wav.setUint32(40, bytes, true);
    for (let c = 0; c < channels; c++) {
      const samples = buffer.getChannelData(c);
      for (let i = 0; i < frames; i++)
        wav.setInt16(
          44 + (i * channels + c) * 2,
          Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767),
          true,
        );
    }
    return new File([wav.buffer], 'Recording.wav', { type: 'audio/wav' });
  } finally {
    await context.close();
  }
}
