import type { Point } from './types';

type Drawing = {
  addStroke: (stroke: Stroke) => void;
  getPrediction: () => Promise<{ text: string }[]>;
};
type Stroke = { addPoint: (point: Point) => void };
type Recognizer = {
  startDrawing: (hints: { recognitionType: 'text' }) => Drawing;
  finish: () => void;
};
type HandwritingSupport = {
  createHandwritingRecognizer?: (constraint: { languages: string[] }) => Promise<Recognizer>;
};
const recognitionNavigator = () => navigator as Navigator & HandwritingSupport;
const handwritingWindow = () => window as Window & { HandwritingStroke?: new () => Stroke };

export function hasInkRecognition() {
  return !!recognitionNavigator().createHandwritingRecognizer && !!handwritingWindow().HandwritingStroke;
}

export async function recognizeInk(strokes: Point[][]) {
  const browser = recognitionNavigator();
  const Stroke = handwritingWindow().HandwritingStroke;
  if (!browser.createHandwritingRecognizer || !Stroke)
    throw new Error('Handwriting recognition is unavailable in this browser.');
  const language = navigator.language.split('-')[0] || 'en';
  let recognizer: Recognizer;
  try {
    recognizer = await browser.createHandwritingRecognizer({ languages: [language] });
  } catch (error) {
    if (language === 'en') throw error;
    recognizer = await browser.createHandwritingRecognizer({ languages: ['en'] });
  }
  try {
    const drawing = recognizer.startDrawing({ recognitionType: 'text' });
    for (const points of strokes) {
      const stroke = new Stroke();
      points.forEach((point) => stroke.addPoint(point));
      drawing.addStroke(stroke);
    }
    const guesses = await drawing.getPrediction();
    const text = guesses[0]?.text?.trim();
    if (!text) throw new Error('No handwriting was recognized. Try writing the letters separately.');
    return text;
  } finally {
    recognizer.finish();
  }
}
