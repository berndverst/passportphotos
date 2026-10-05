import { BLEED_MM, mmToPt, PHOTO_SIZES, type PhotoFormat } from './geometry';

export type Segment = { x1: number; y1: number; x2: number; y2: number };
export const PAPERS = {
  letter: {
    label: 'US Letter', description: 'US Letter (8.5 × 11 in)',
    pdfLabel: 'US Letter (8.5 x 11 in)', filename: 'letter', photoPaper: false,
  },
  a4: {
    label: 'DIN A4', description: 'DIN A4 (210 × 297 mm)',
    pdfLabel: 'DIN A4 (210 x 297 mm)', filename: 'a4', photoPaper: false,
  },
  photo10x15: {
    label: '10 × 15 cm', description: 'Photo paper (10 × 15 cm)',
    pdfLabel: '10 x 15 CM', filename: '10x15cm', photoPaper: true,
  },
  photo4x6: {
    label: '4 × 6 in', description: 'Photo paper (4 × 6 in)',
    pdfLabel: '4 x 6 IN', filename: '4x6', photoPaper: true,
  },
} as const;
export type PaperSize = keyof typeof PAPERS;

export const SHEETS = {
  de: {
    letter: {
      width: 215.9, height: 279.4,
      positions: [
        { x: 47, y: 164 }, { x: 126, y: 164 },
        { x: 47, y: 91 }, { x: 126, y: 91 },
      ],
    },
    a4: {
      width: 210, height: 297,
      positions: [
        { x: 44.05, y: 172.8 }, { x: 123.05, y: 172.8 },
        { x: 44.05, y: 99.8 }, { x: 123.05, y: 99.8 },
      ],
    },
    photo10x15: {
      width: 100, height: 150,
      positions: [{ x: 10, y: 71 }, { x: 55, y: 71 }],
    },
    photo4x6: {
      width: 101.6, height: 152.4,
      positions: [{ x: 10, y: 71 }, { x: 56.6, y: 71 }],
    },
  },
  us: {
    letter: {
      width: 215.9, height: 279.4,
      positions: [
        { x: 41, y: 155 }, { x: 124, y: 155 },
        { x: 41, y: 75 }, { x: 124, y: 75 },
      ],
    },
    a4: {
      width: 210, height: 297,
      positions: [
        { x: 38.05, y: 163.8 }, { x: 121.05, y: 163.8 },
        { x: 38.05, y: 83.8 }, { x: 121.05, y: 83.8 },
      ],
    },
    photo10x15: {
      width: 150, height: 100,
      positions: [{ x: 17.2, y: 31 }, { x: 82, y: 31 }],
    },
    photo4x6: {
      width: 152.4, height: 101.6,
      positions: [{ x: 18.4, y: 31 }, { x: 83.2, y: 31 }],
    },
  },
} as const;

export function printLayout(x: number, y: number, format: PhotoFormat = 'de') {
  const photo = PHOTO_SIZES[format];
  const image = {
    x: x - BLEED_MM,
    y: y - BLEED_MM,
    width: photo.width + 2 * BLEED_MM,
    height: photo.height + 2 * BLEED_MM,
  };
  const marks: Segment[] = [];
  for (const edgeX of [x, x + photo.width]) {
    for (const edgeY of [y, y + photo.height]) {
      const horizontalSide = edgeX === x ? -1 : 1;
      const verticalSide = edgeY === y ? -1 : 1;
      marks.push({
        x1: edgeX + horizontalSide * 1.4, y1: edgeY,
        x2: edgeX + horizontalSide * 5, y2: edgeY,
      });
      marks.push({
        x1: edgeX, y1: edgeY + verticalSide * 1.4,
        x2: edgeX, y2: edgeY + verticalSide * 5,
      });
    }
  }
  return { image, marks, trim: { x, y, width: photo.width, height: photo.height } };
}

export const pt = mmToPt;
