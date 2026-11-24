import {
  animationEffects,
  animationGroups,
  type AnimationClass,
  type SlideAnimation,
} from '../src/animations';
import { eraseInk, inkFrame, inkToShape, penDefaults } from '../src/ink';
import { demoGlb, disposeModel, loadModel } from '../src/model';
import { createProject, duplicateSlide, insertBlankSlide, makeAsset, newObject } from '../src/pptx';
import { defaultTransitionOption, transitionChoices } from '../src/transitions';
import { geometries, uid, type ListStyle, type Point, type SlideObject } from '../src/types';

const navy = '#19213b';
const purple = '#6147b5';
const teal = '#148276';
const mauve = '#eee8fa';
const cream = '#fff3d9';
const white = '#ffffff';
const gray = '#4c5570';
const inkColors = ['#6147b5', '#148276', '#cc6948', '#407ab5'];

function paintFrame(canvas: HTMLCanvasElement, frame = 0) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  ctx.fillStyle = navy;
  ctx.fillRect(0, 0, width, height);
  const colors = ['#eb7658', '#f4c94a', '#54ba9c', '#ac96ea'];
  const labels = ['TOP LEFT', 'TOP RIGHT', 'BOTTOM LEFT', 'BOTTOM RIGHT'];
  for (let i = 0; i < colors.length; i++) {
    const x = ((i % 2) * width) / 2;
    const y = (Math.floor(i / 2) * height) / 2;
    ctx.fillStyle = colors[i];
    ctx.fillRect(x + 4, y + 4, width / 2 - 8, height / 2 - 8);
    ctx.fillStyle = navy;
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + width / 4, y + height / 4 + 6);
  }
  if (frame) {
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.arc(18 + ((frame % 36) / 35) * (width - 36), height / 2, 15, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function imageAndVideo() {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 270;
  paintFrame(canvas);
  const png = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
  const mimeType = ['video/mp4;codecs=avc1.42001f', 'video/mp4;codecs=avc1', 'video/mp4'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  if (!mimeType) throw new Error('This browser cannot encode the MP4 playback fixture.');
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 350_000 });
  const chunks: Blob[] = [];
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = ({ data }) => chunks.push(data);
    recorder.onerror = () => reject(new Error('Could not record the video fixture.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }));
  });
  recorder.start();
  let frame = 0;
  const timer = setInterval(() => paintFrame(canvas, ++frame), 1000 / 24);
  await new Promise<void>((resolve) => setTimeout(resolve, 1700));
  clearInterval(timer);
  recorder.stop();
  try {
    return { png, video: await done };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function testTone() {
  const sampleRate = 22_050;
  const samples = 15_000;
  const bytes = new Uint8Array(44 + samples * 2);
  const numbers = new DataView(bytes.buffer);
  for (const [at, label] of [
    [0, 'RIFF'],
    [8, 'WAVEfmt '],
    [36, 'data'],
  ] as const)
    bytes.set(new TextEncoder().encode(label), at);
  for (const [at, value] of [
    [4, bytes.length - 8],
    [16, 16],
    [24, sampleRate],
    [28, sampleRate * 2],
    [40, samples * 2],
  ])
    numbers.setUint32(at, value, true);
  for (const [at, value] of [
    [20, 1],
    [22, 1],
    [32, 2],
    [34, 16],
  ])
    numbers.setUint16(at, value, true);
  for (let i = 0; i < samples; i++) {
    const frequency = i < samples / 2 ? 440 : 660;
    const envelope = Math.min(1, i / 550, (samples - i) / 550);
    numbers.setInt16(
      44 + i * 2,
      Math.round(6500 * envelope * Math.sin((i * Math.PI * 2 * frequency) / sampleRate)),
      true,
    );
  }
  return bytes;
}

export async function prepareCompatibilityDeck() {
  const project = await createProject();
  let deck = project.deck;
  deck.name = 'Forma PowerPoint Compatibility';
  const manifest: { title: string; transition: string; main: string[]; trigger?: string }[] = [];
  const object = (
    kind: SlideObject['kind'],
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    extra: Partial<SlideObject> = {},
  ): SlideObject => ({
    ...newObject(kind, deck),
    name,
    x,
    y,
    w,
    h,
    ...extra,
  });
  const text = (
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    extra: Partial<SlideObject> = {},
  ) =>
    object('text', value.split('\n')[0], x, y, w, h, {
      text: value,
      fontFamily: 'Arial',
      color: navy,
      fontSize: 24,
      ...extra,
    });
  const shape = (
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    extra: Partial<SlideObject> = {},
  ) => object('shape', name, x, y, w, h, { fill, ...extra });
  function add(
    title: string,
    instruction: string,
    content: SlideObject[] = [],
    extra: Partial<(typeof deck.slides)[number]> = {},
  ) {
    if (manifest.length) deck = insertBlankSlide(deck, deck.slides.length - 1);
    const number = manifest.length + 1;
    const slide = deck.slides.at(-1)!;
    const dark = extra.background === navy;
    Object.assign(slide, {
      background: dark ? navy : '#faf8ff',
      backgroundDirty: true,
      dirty: true,
      objects: [
        shape('Header accent', 46, 38, 44, 5, dark ? '#aa98ef' : purple),
        text(title, 45, 49, 1150, 71, { bold: true, fontSize: 45, color: dark ? white : navy }),
        text(instruction, 48, 125, 1175, 61, { fontSize: 21, color: dark ? '#ded6ff' : gray }),
        text('FORMA   /   COMPATIBILITY', 48, 661, 450, 32, {
          fontSize: 14,
          bold: true,
          color: dark ? '#ded6ff' : purple,
        }),
        text(String(number).padStart(2, '0'), 1150, 659, 79, 36, {
          fontSize: 15,
          color: dark ? white : navy,
          alignment: 'right',
        }),
        ...content,
      ],
      ...extra,
    });
    manifest.push({
      title,
      transition: slide.transition,
      main: (slide.animations ?? []).filter((effect) => !effect.trigger).map((effect) => effect.effect),
      ...(slide.animations?.some((effect) => effect.trigger) ? { trigger: 'Object click' } : {}),
    });
    return slide;
  }

  add(
    'Forma compatibility suite',
    'Open in PowerPoint. Use Normal view to inspect editable objects and Slide Show to check motion, links, and media.',
    [
      shape('Checklist panel', 47, 197, 1185, 386, mauve, { geometry: 'roundRect' }),
      text(
        '01    Text, shapes, ink, pictures, tables, and charts\n02    Links, comments, media, timing, and 3D Morph\n03    Animation presets, including motion paths\n04    Transition gallery, one effect per slide',
        75,
        249,
        1119,
        275,
        { fontSize: 30, lineSpacing: 1.4 },
      ),
    ],
    { background: navy },
  );

  add(
    '01 / Typography and layout',
    'The comparison line stays on one line. Inspect the list, columns, mixed runs, and vertical anchoring.',
    [
      text('Did this text got preserved?', 74, 196, 1130, 95, {
        fontSize: 54,
        alignment: 'center',
        textAnchor: 'bottom',
        fontFamily: 'Aptos Display',
      }),
      text('By Tester', 74, 302, 1130, 52, { alignment: 'center', fontSize: 27 }),
      ...(['disc', 'circle', 'square', 'decimal', 'alpha', 'roman'] satisfies ListStyle[]).map(
        (listStyle, i) =>
          text('First\nSecond', 70 + i * 196, 381, 184, 94, {
            listStyle,
            fontSize: 19,
            fill: mauve,
            textInsets: [8, 10, 8, 10],
          }),
      ),
      text('Large   Bold   Underlined', 74, 500, 487, 60, {
        fontSize: 23,
        bold: true,
        underline: true,
        fontSizeRanges: [{ start: 0, end: 5, size: 34 }],
      }),
      text('Column one\nSecond item\nThird item\nColumn two\nFifth item\nSixth item', 635, 493, 535, 132, {
        columns: 2,
        fontSize: 18,
      }),
      text('x²  +  y²  =  r²    ·    π    Ω    ∑', 74, 571, 535, 50, {
        fontSize: 21,
        italic: true,
        color: purple,
      }),
    ],
  );

  add(
    '02 / Shape gallery',
    'Select the shapes and move their handles. The diagonal line, outline, rotation, and overlap should survive.',
    [
      ...geometries
        .map((geometry, i) => {
          const x = 70 + (i % 5) * 238;
          const y = 211 + Math.floor(i / 5) * 138;
          return [
            shape(geometry, x + 22, y, 122, 73, geometry === 'line' ? 'transparent' : mauve, {
              geometry,
              outline: { color: inkColors[i % 4], width: 3, dash: i === 0 ? 'dash' : 'solid' },
              ...(geometry === 'line' && { flipV: true }),
              ...(geometry === 'roundRect' && { adjustments: { adj: 22500 } }),
            }),
            text(geometry, x - 10, y + 82, 183, 33, { fontSize: 17, alignment: 'center' }),
          ];
        })
        .flat(),
      shape('Back layer', 802, 500, 94, 69, teal, { rotation: -16 }),
      shape('Front layer', 861, 524, 101, 77, '#edb96a', { rotation: 13 }),
      text('Rotated layers', 785, 607, 197, 31, { fontSize: 17, alignment: 'center' }),
    ],
  );

  const path = (x: number, y: number, width: number, height: number) =>
    Array.from({ length: 30 }, (_, i) => ({ x: x + (i * width) / 29, y: y + Math.sin(i / 3.8) * height }));
  const ink = (name: string, points: Point[], style: typeof penDefaults.pen) =>
    shape(name, 0, 0, 1, 1, 'transparent', inkFrame(points, style));
  const redLine = path(675, 271, 459, 19);
  const clips = eraseInk(redLine, [{ x: 900, y: 267 }], 31, false) ?? [];
  const handwritten = ink(
    'Rectangle sketch',
    [
      { x: 683, y: 427 },
      { x: 1097, y: 427 },
      { x: 1097, y: 562 },
      { x: 683, y: 562 },
      { x: 683, y: 427 },
    ],
    { color: purple, width: 4 },
  );
  add(
    '03 / Draw and editable freeforms',
    'Look for a translucent highlight and a visible gap in the red ink. Try selecting each piece in PowerPoint.',
    [
      text('Pen and pencil', 70, 216, 490, 48, { bold: true }),
      ink('Pen sample', path(75, 295, 462, 21), penDefaults.pen),
      ink('Pencil sample', path(75, 369, 462, 17), penDefaults.pencil),
      text('Highlight over editable text', 70, 485, 525, 61, { fontSize: 29, bold: true }),
      ink(
        'Translucent highlighter',
        [
          { x: 78, y: 516 },
          { x: 449, y: 516 },
        ],
        { ...penDefaults.highlighter, width: 32 },
      ),
      text('Point eraser result', 670, 216, 473, 48, { bold: true }),
      ...clips.map((part, i) => ink('Erased red ink ' + (i + 1), part, { color: '#db3d58', width: 12 })),
      text('Ink converted to a rectangle', 670, 368, 473, 47, { bold: true }),
      { ...handwritten, ...inkToShape({ ...handwritten, stroke: handwritten.stroke! }) },
    ],
  );

  const { png, video } = await imageAndVideo();
  project.assets.pattern = makeAsset(new Uint8Array(await png.arrayBuffer()), 'image/png');
  project.assets.video = makeAsset(new Uint8Array(await video.arrayBuffer()), 'video/mp4');
  project.assets.tone = makeAsset(testTone(), 'audio/wav');
  add(
    '04 / Pictures, crop, and rotation',
    'Compare the original to the crops. The picture at the right is cropped, flipped, and rotated.',
    [
      object('image', 'Original picture', 70, 235, 500, 281, {
        asset: 'pattern',
        altText: 'Four colored quadrants',
      }),
      object('image', 'Bottom-left crop', 626, 216, 197, 135, { asset: 'pattern', crop: [0, 0.5, 0.5, 0] }),
      object('image', 'Top-right crop', 626, 410, 197, 135, { asset: 'pattern', crop: [0.5, 0, 0, 0.5] }),
      object('image', 'Flipped and rotated crop', 916, 291, 249, 168, {
        asset: 'pattern',
        rotation: -16,
        flipH: true,
        crop: [0.1, 0.16, 0.18, 0.12],
      }),
      text('Uncropped picture', 70, 540, 500, 47, { fontSize: 20 }),
      text('Bottom-left quadrant', 611, 355, 240, 40, { fontSize: 18 }),
      text('Top-right quadrant', 611, 551, 240, 40, { fontSize: 18 }),
    ],
  );

  add(
    '05 / Table and a linked diagram',
    'Edit a table cell in Normal view. In Slide Show, click the purple card to jump to the opening slide.',
    [
      object('table', 'Quarterly table', 62, 221, 600, 264, {
        table: {
          cells: [
            ['City', 'Q1', 'Q2', 'Q3'],
            ['Toronto', '18', '23', '29'],
            ['Montréal', '15', '19', '26'],
            ['Vancouver', '20', '24', '30'],
          ],
          header: true,
          widths: [2, 1, 1, 1],
          heights: [1, 1.2, 1, 1],
          fills: [
            ['#6147b5', '#6147b5', '#6147b5', '#6147b5'],
            [white, white, white, '#f0e9ff'],
            [white, '#e5faf4', white, white],
            [white, white, white, white],
          ],
        },
      }),
      shape('Diagram goal', 739, 225, 420, 82, mauve, { geometry: 'roundRect' }),
      text('Prepare a test', 761, 241, 375, 50, { alignment: 'center', bold: true }),
      shape('Diagram arrow', 926, 323, 41, 44, teal, { geometry: 'downArrow' }),
      shape('Link to opening slide', 739, 387, 420, 99, purple, {
        geometry: 'roundRect',
        link: { type: 'slide', part: deck.slides[0].part },
      }),
      text('Return to opening slide', 765, 411, 366, 50, {
        alignment: 'center',
        color: white,
        link: { type: 'action', jump: 'firstslide' },
      }),
    ],
    {
      comments: [
        {
          id: uid(),
          author: 'Forma QA',
          text: 'Verify that the table cell and slide action remain editable.',
          date: '2026-11-23T12:00:00Z',
        },
      ],
    },
  );

  add(
    '06 / Editable charts',
    'Use Chart Design → Edit Data to inspect the embedded data for each chart.',
    (['column', 'bar', 'line', 'pie'] as const).flatMap((type, i) => {
      const x = 60 + (i % 2) * 598,
        y = 193 + Math.floor(i / 2) * 224;
      return [
        text(type[0].toUpperCase() + type.slice(1), x, y, 520, 38, { fontSize: 20, bold: true }),
        object('chart', type + ' chart', x, y + 31, 542, 177, {
          chart: {
            type,
            points: [
              { label: 'North', value: 14 },
              { label: 'East', value: 27 },
              { label: 'West', value: 21 },
              { label: 'South', value: 11 },
            ],
          },
        }),
      ];
    }),
  );

  add(
    '07 / Embedded video and audio',
    'In Slide Show, play the MP4 to see the dot move. Play the WAV to hear two short tones.',
    [
      object('media', 'Animated MP4 quadrants', 65, 216, 610, 343, {
        media: 'video',
        asset: 'video',
        preview: 'pattern',
      }),
      object('media', 'Two-tone WAV', 794, 240, 304, 171, {
        media: 'audio',
        asset: 'tone',
        preview: 'pattern',
      }),
      text('MP4 video', 65, 568, 610, 45, { fontSize: 21, bold: true }),
      text('WAV audio', 795, 427, 348, 45, { fontSize: 21, bold: true }),
    ],
  );

  const trigger = shape('Trigger button', 885, 244, 282, 104, purple, { geometry: 'roundRect' });
  const a = shape('On Click target', 97, 247, 140, 75, purple);
  const b = shape('With Previous target', 97, 358, 140, 75, teal);
  const c = shape('After Previous target', 97, 469, 140, 75, '#d87e44');
  const d = shape('Object-click target', 937, 416, 185, 100, teal, { geometry: 'star5' });
  add(
    '08 / Animation timing and triggers',
    'Click once to play the three timing examples. Click the purple button to reveal the green star.',
    [
      a,
      b,
      c,
      d,
      trigger,
      text('Click this button', 913, 354, 216, 42, { color: purple, alignment: 'center' }),
      text('On Click · 0.25 s delay, 0.70 s duration', 269, 258, 552, 57),
      text('With Previous · 0.10 s delay, 0.70 s duration', 269, 366, 558, 57),
      text('After Previous · 0.10 s delay, repeat twice', 269, 480, 558, 67),
    ],
    {
      animations: [
        { id: uid(), target: a.id, effect: 'entr:10', start: 'click', delay: 0.25, duration: 0.7 },
        {
          id: uid(),
          target: b.id,
          effect: 'entr:2',
          start: 'with',
          direction: 'left',
          delay: 0.1,
          duration: 0.7,
        },
        {
          id: uid(),
          target: c.id,
          effect: 'emph:8',
          start: 'after',
          delay: 0.1,
          duration: 0.6,
          repeat: 2,
          rewind: true,
        },
        {
          id: uid(),
          target: d.id,
          effect: 'entr:10',
          trigger: trigger.id,
          start: 'click',
          delay: 0.05,
          duration: 0.4,
        },
      ],
    },
  );

  project.assets.knot = makeAsset(await demoGlb(), 'model/gltf-binary');
  const loaded = await loadModel(project.assets.knot);
  const knot = object('model', '!!Forma 3D knot', 115, 211, 381, 381, {
    asset: 'knot',
    pose: [0, 0, 0],
    modelCenter: loaded.center,
    modelSize: loaded.size,
  });
  disposeModel(loaded.scene);
  add(
    '09 / Native 3D Morph',
    'Advance once. The 3D knot should move right, grow, and turn as the orange square enters the slide.',
    [knot, shape('!!Orange square', -151, 378, 120, 120, '#e78b4b', { rotation: 12 })],
  );
  deck = duplicateSlide(deck, deck.slides.length - 1, true);
  const copy = deck.slides.at(-1)!;
  copy.duration = 1.65;
  const model = copy.objects.find(({ kind }) => kind === 'model')!;
  Object.assign(model, { x: 730, y: 192, w: 353, h: 353, modelZoom: 120, pose: [28, -55, 25] });
  Object.assign(
    copy.objects.find(({ name }) => name === '!!Orange square')!,
    { x: 272, rotation: -20 },
  );
  manifest.push({ title: '09 / Native 3D Morph — destination', transition: 'morph', main: [] });

  for (const [option, title] of [
    ['byWord', 'Words'],
    ['byChar', 'Characters'],
  ] as const) {
    add(
      '10 / Morph by ' + title.toLowerCase() + ' — source',
      'Advance once to see the next version of the sentence.',
      [
        text('Forma moves words across a slide', 95, 284, 1090, 112, {
          fontSize: 49,
          bold: true,
          alignment: 'center',
          name: '!!Text ' + title,
        }),
      ],
    );
    add(
      '10 / Morph by ' + title.toLowerCase(),
      'The text should rearrange under the selected Morph option.',
      [
        text('Words move across a Forma slide', 95, 357, 1090, 112, {
          fontSize: 49,
          bold: true,
          alignment: 'center',
          name: '!!Text ' + title,
        }),
      ],
      { transition: 'morph', transitionDirty: true, transitionOption: option, duration: 1.4 },
    );
  }

  add(
    '11 / Hidden-slide marker',
    'This slide should be visible in the editor and skipped in Slide Show.',
    [
      text(
        'If you reached this automatically, the hidden-slide flag needs investigation.',
        75,
        281,
        1110,
        115,
        { fontSize: 34, alignment: 'center' },
      ),
    ],
    { hidden: true, background: navy },
  );
  add(
    '12 / Automatic advance',
    'In Slide Show this slide waits three seconds, then advances automatically.',
    [text('3 seconds', 75, 285, 1110, 129, { fontSize: 70, bold: true, color: purple, alignment: 'center' })],
    { transition: 'fade', transitionDirty: true, duration: 0.6, advanceOnClick: false, advanceAfter: 3 },
  );

  for (const group of Object.keys(animationGroups) as AnimationClass[]) {
    const effects = animationEffects.filter((effect) => effect.group === group);
    for (let offset = 0; offset < effects.length; offset += 12) {
      const animations: SlideAnimation[] = [];
      const items = effects.slice(offset, offset + 12).flatMap((effect, i) => {
        const x = 60 + (i % 4) * 300,
          y = 196 + Math.floor(i / 4) * 146;
        const target = text('Forma', x + 63, y + 42, 125, 55, {
          alignment: 'center',
          bold: true,
          color: white,
          fill: inkColors[i % 4],
          name: 'Effect target / ' + effect.label,
        });
        animations.push({
          id: uid(),
          target: target.id,
          effect: effect.id,
          start: i ? 'after' : 'click',
          delay: i ? 0.12 : 0,
          duration: effect.style === 'instant' ? 0.001 : group === 'path' ? 0.8 : 0.53,
          ...(effect.id === 'path:0' && {
            path: [
              { x: 0, y: 0 },
              { x: 0.045, y: -0.035 },
              { x: 0.08, y: 0.035 },
            ],
          }),
        });
        return [
          shape('Effect card', x, y, 270, 130, mauve, { geometry: 'roundRect' }),
          text(effect.label, x + 8, y + 96, 254, 37, { alignment: 'center', fontSize: 17 }),
          target,
        ];
      });
      add(
        `Animations / ${animationGroups[group]} ${offset + 1}–${offset + animations.length}`,
        'Click once to play the named presets in reading order. Each effect targets its Forma tile.',
        items,
        { animations },
      );
    }
  }

  const gallery = transitionChoices.filter(([kind]) => kind !== 'morph');
  for (const [i, [transition, label]] of gallery.entries()) {
    const dark = i % 2 === 1;
    add(
      'Transitions / ' + label,
      `Transition ${i + 1} of ${gallery.length}. Advance onto this slide to see ${label}.`,
      [
        shape('Contrast panel', 69, 200, 1143, 401, dark ? '#40335f' : mauve, { geometry: 'roundRect' }),
        shape('Transition marker 1', dark ? 840 : 138, 259, 190, 195, dark ? '#e8ad66' : purple, {
          geometry: 'ellipse',
        }),
        shape('Transition marker 2', dark ? 490 : 495, 337, 220, 175, dark ? '#a18cde' : teal, {
          geometry: 'chevron',
        }),
        shape('Transition marker 3', dark ? 160 : 866, 294, 207, 146, dark ? '#47ab9b' : '#e8ad66', {
          geometry: 'roundRect',
          rotation: dark ? -15 : 15,
        }),
      ],
      {
        transition,
        transitionDirty: true,
        transitionOption: defaultTransitionOption(transition),
        duration: 0.95,
        background: dark ? navy : '#faf8ff',
      },
    );
  }

  project.deck = deck;
  return { project, manifest };
}
