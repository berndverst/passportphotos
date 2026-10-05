import { describe, expect, it } from 'vitest';
import {
  type Frame, US_EYES, US_HEAD, eyeHeightMm, frameProblems,
  getPreview, groups, headHeightMm, initialFrame, mmToPt, PHOTO_MM, PHOTO_SIZES,
  PREVIEW, previewToSource, pxAtDpi, sourceToPreview,
} from './geometry';
import { SHEETS, printLayout } from './layout';
import { withJpegDpi } from './jpeg';

describe('photo geometry', () => {
  const source = { width: 2400, height: 3200 };
  const box = { originX: 900, originY: 1000, width: 600, height: 800 };

  it('uses a 35 x 45 mm trim and 1 mm photographic bleed outside the trim', () => {
    expect(PHOTO_MM).toEqual({ width: 35, height: 45 });
    expect(PREVIEW).toEqual({ width: 350, height: 450 });
    expect(pxAtDpi(35)).toBe(413);
    expect(pxAtDpi(45)).toBe(531);
    expect(pxAtDpi(37)).toBe(437);
    expect(pxAtDpi(47)).toBe(555);
    expect(mmToPt(35)).toBeCloseTo(99.2126, 3);
    const layout = printLayout(47, 91);
    expect(layout.trim).toEqual({ x: 47, y: 91, width: 35, height: 45 });
    expect(layout.image).toEqual({ x: 46, y: 90, width: 37, height: 47 });
  });

  it.each(['adult', 'child', 'infant'] as const)('suggests the correct %s framing target', (group) => {
    const suggested = initialFrame(box, group);
    expect(headHeightMm(suggested.anchors, suggested.frame)).toBeCloseTo(groups[group].target, 5);
    expect(frameProblems(suggested.frame, suggested.anchors, group, source)).toEqual([]);
  });

  it('preserves the same source point under pan, zoom and rotation transforms', () => {
    const point = { x: 970, y: 1170 };
    for (const angle of [-180, -90, -11, 90, 180]) {
      const frame: Frame = { center: { x: 950, y: 1250 }, scale: 0.72, angle, format: 'de' };
      const result = previewToSource(sourceToPreview(point, frame), frame);
      expect(result.x).toBeCloseTo(point.x, 8);
      expect(result.y).toBeCloseTo(point.y, 8);
    }
  });

  it.each([
    { angle: -90, crown: { x: 1700, y: 1600 }, chin: { x: 700, y: 1600 } },
    { angle: 90, crown: { x: 700, y: 1600 }, chin: { x: 1700, y: 1600 } },
    { angle: 180, crown: { x: 1200, y: 2100 }, chin: { x: 1200, y: 1100 } },
  ])('checks a correctly oriented $angle° crop without rejecting valid rotated markers', ({ angle, crown, chin }) => {
    const frame: Frame = { center: { x: 1200, y: 1600 }, scale: 0.34, angle, format: 'de' };
    expect(headHeightMm({ crown, chin }, frame)).toBeCloseTo(34, 8);
    expect(frameProblems(frame, { crown, chin }, 'adult', source)).toEqual([]);
  });

  it('blocks undersized sources, wrong head sizes, and crops that lack full bleed', () => {
    const suggested = initialFrame(box, 'adult');
    expect(frameProblems(suggested.frame, suggested.anchors, 'adult', { width: 400, height: 500 }))
      .toEqual(expect.arrayContaining([expect.stringContaining('trimmed photo extends beyond the source JPG')]));
    expect(frameProblems(suggested.frame, suggested.anchors, 'adult', { width: 400, height: 500 }))
      .toEqual(expect.arrayContaining([expect.stringContaining('Not enough native source pixels')]));
    expect(frameProblems({ ...suggested.frame, scale: 2 }, suggested.anchors, 'adult', source))
      .toEqual(expect.arrayContaining([expect.stringContaining('Not enough native source pixels')]));
    expect(frameProblems({ ...suggested.frame, scale: 0.2 }, suggested.anchors, 'adult', source))
      .toEqual(expect.arrayContaining([expect.stringContaining('Chin-to-top-of-head height')]));
  });
});

describe('crop boundary diagnostics', () => {
  const source = { width: 1000, height: 1200 };
  const anchors = { crown: { x: 339, y: 450 }, chin: { x: 339, y: 850 }, eyes: { x: 339, y: 550 } };
  const frame: Frame = { center: { x: 339, y: 600 }, scale: 0.75, angle: 0, format: 'us' };

  it('explains a bleed-only overrun without falsely saying the photo trim is out of bounds', () => {
    const problems = frameProblems(frame, anchors, 'adult', source);
    expect(problems).toEqual(expect.arrayContaining([expect.stringContaining('trim fits, but its 1 mm outer print bleed')]));
    expect(problems.some((problem) => problem.includes('trimmed photo extends beyond'))).toBe(false);
  });

  it('identifies a genuinely out-of-bounds trim', () => {
    const problems = frameProblems({ ...frame, center: { ...frame.center, x: 300 } }, anchors, 'adult', source);
    expect(problems).toEqual(expect.arrayContaining([expect.stringContaining('trimmed photo extends beyond')]));
  });

  it('can restore valid boundary geometry by zooming in a little without stretching the image', () => {
    const zoomed = { ...frame, scale: 0.8 };
    expect(frameProblems(zoomed, anchors, 'adult', source).some((problem) => problem.includes('source JPG'))).toBe(false);
  });
});

describe('U.S. 2 x 2 inch geometry', () => {
  const source = { width: 2400, height: 3200 };
  const box = { originX: 900, originY: 1000, width: 600, height: 800 };

  it('uses exactly 2 x 2 inches, 300 DPI pixels, and outside bleed', () => {
    expect(PHOTO_SIZES.us).toEqual({ width: 50.8, height: 50.8 });
    expect(getPreview('us')).toEqual({ width: 508, height: 508 });
    expect(pxAtDpi(50.8)).toBe(600);
    expect(pxAtDpi(52.8)).toBe(624);
    expect(printLayout(18.4, 31, 'us').image).toEqual({ x: 17.4, y: 30, width: 52.8, height: 52.8 });
  });

  it('suggests a 1–1⅜ inch head and 1⅛–1⅜ inch eye height, both measured from marked points', () => {
    const suggested = initialFrame(box, 'adult', 'us');
    expect(headHeightMm(suggested.anchors, suggested.frame)).toBeCloseTo(US_HEAD.target, 8);
    expect(eyeHeightMm(suggested.anchors, suggested.frame)).toBeCloseTo(US_EYES.target, 8);
    expect(frameProblems(suggested.frame, suggested.anchors, 'adult', source)).toEqual([]);
    expect(frameProblems(suggested.frame, suggested.anchors, 'infant', source)).toEqual([]);
  });

  it('blocks unmarked or misplaced eyes and wrong head size', () => {
    const { frame, anchors } = initialFrame(box, 'adult', 'us');
    expect(frameProblems(frame, { ...anchors, eyes: null }, 'adult', source))
      .toEqual(expect.arrayContaining([expect.stringContaining('Mark the midpoint between the eyes')]));
    const misplaced = { ...anchors, eyes: { x: anchors.eyes!.x, y: anchors.eyes!.y + 150 } };
    expect(frameProblems(frame, misplaced, 'adult', source))
      .toEqual(expect.arrayContaining([expect.stringContaining('Eye line is')]));
    expect(frameProblems({ ...frame, scale: frame.scale * 2 }, anchors, 'adult', source))
      .toEqual(expect.arrayContaining([expect.stringContaining('Chin-to-top-of-head height')]));
    expect(frameProblems(frame, anchors, 'adult', { width: 500, height: 500 }))
      .toEqual(expect.arrayContaining([expect.stringContaining('Not enough native source pixels')]));
    expect(frameProblems(frame, { ...anchors, eyes: { x: anchors.eyes!.x + 400, y: anchors.eyes!.y } }, 'adult', source))
      .toEqual(expect.arrayContaining([expect.stringContaining('near the center of the face')]));
  });

  it('accepts the exact head and eye range boundaries and rejects values just outside', () => {
    const frame: Frame = { center: { x: 1200, y: 1600 }, scale: 0.5, angle: 0, format: 'us' };
    const markers = (head: number, eyes: number) => ({
      crown: previewToSource({ x: 254, y: 80 }, frame),
      chin: previewToSource({ x: 254, y: 80 + head * 10 }, frame),
      eyes: previewToSource({ x: 254, y: 508 - eyes * 10 }, frame),
    });
    expect(frameProblems(frame, markers(US_HEAD.min, US_EYES.min), 'adult', source)).toEqual([]);
    expect(frameProblems(frame, markers(US_HEAD.max, US_EYES.max), 'adult', source)).toEqual([]);
    expect(frameProblems(frame, markers(US_HEAD.min - 0.1, US_EYES.min), 'adult', source))
      .toEqual(expect.arrayContaining([expect.stringContaining('Chin-to-top-of-head height')]));
    expect(frameProblems(frame, markers(US_HEAD.max + 0.1, US_EYES.max), 'adult', source))
      .toEqual(expect.arrayContaining([expect.stringContaining('Chin-to-top-of-head height')]));
    expect(frameProblems(frame, markers(US_HEAD.min, US_EYES.min - 0.1), 'adult', source))
      .toEqual(expect.arrayContaining([expect.stringContaining('Eye line is')]));
    expect(frameProblems(frame, markers(US_HEAD.max, US_EYES.max + 0.1), 'adult', source))
      .toEqual(expect.arrayContaining([expect.stringContaining('Eye line is')]));
  });

  it('maps points back to the original image with US rotation', () => {
    const frame: Frame = { center: { x: 1100, y: 1300 }, scale: 0.55, angle: 90, format: 'us' };
    const point = { x: 1090, y: 1440 };
    const roundtrip = previewToSource(sourceToPreview(point, frame), frame);
    expect(roundtrip.x).toBeCloseTo(point.x, 8);
    expect(roundtrip.y).toBeCloseTo(point.y, 8);
  });
});

describe('print positions and marks', () => {
  it.each([
    ['de', 'letter', 215.9, 279.4, 612, 792, 4],
    ['de', 'photo4x6', 101.6, 152.4, 288, 432, 2],
    ['us', 'letter', 215.9, 279.4, 612, 792, 4],
    ['us', 'photo4x6', 152.4, 101.6, 432, 288, 2],
  ] as const)('lays out %s %s at physical sheet size with the expected photo count', (format, key, width, height, pointsWide, pointsHigh, copies) => {
    const sheet = SHEETS[format][key];
    expect(sheet.width).toBe(width);
    expect(sheet.height).toBe(height);
    expect(sheet.positions).toHaveLength(copies);
    expect(mmToPt(sheet.width)).toBeCloseTo(pointsWide, 8);
    expect(mmToPt(sheet.height)).toBeCloseTo(pointsHigh, 8);
    const layouts = sheet.positions.map(({ x, y }) => printLayout(x, y, format));
    for (const { image, trim, marks } of layouts) {
      expect(marks).toHaveLength(8);
      expect(image.x).toBe(trim.x - 1);
      expect(image.y).toBe(trim.y - 1);
      expect(image.width).toBe(trim.width + 2);
      expect(image.height).toBe(trim.height + 2);
      for (const mark of marks) {
        expect(mark.x1 === mark.x2 || mark.y1 === mark.y2).toBe(true);
        if (mark.x1 === mark.x2) {
          expect([trim.x, trim.x + trim.width]).toContain(mark.x1);
          expect(mark.y1 < image.y || mark.y1 > image.y + image.height).toBe(true);
        } else {
          expect([trim.y, trim.y + trim.height]).toContain(mark.y1);
          expect(mark.x1 < image.x || mark.x1 > image.x + image.width).toBe(true);
        }
      }
      expect(image.x).toBeGreaterThan(0);
      expect(image.x + image.width).toBeLessThan(sheet.width);
      expect(image.y).toBeGreaterThan(0);
      expect(image.y + image.height).toBeLessThan(sheet.height);
      for (const mark of marks) {
        for (const x of [mark.x1, mark.x2]) {
          expect(x).toBeGreaterThanOrEqual(5);
          expect(x).toBeLessThanOrEqual(sheet.width - 5);
        }
        for (const y of [mark.y1, mark.y2]) {
          expect(y).toBeGreaterThanOrEqual(5);
          expect(y).toBeLessThanOrEqual(sheet.height - 5);
        }
      }
    }
    for (const [index, layout] of layouts.entries()) {
      for (const other of layouts.slice(index + 1)) {
        expect(layout.image.x + layout.image.width < other.image.x ||
          other.image.x + other.image.width < layout.image.x ||
          layout.image.y + layout.image.height < other.image.y ||
          other.image.y + other.image.height < layout.image.y).toBe(true);
        for (const mark of [...layout.marks, ...other.marks]) {
          for (const photo of [layout.image, other.image]) {
            const overlaps = Math.min(mark.x1, mark.x2) <= photo.x + photo.width &&
              Math.max(mark.x1, mark.x2) >= photo.x &&
              Math.min(mark.y1, mark.y2) <= photo.y + photo.height &&
              Math.max(mark.y1, mark.y2) >= photo.y;
            expect(overlaps).toBe(false);
          }
        }
      }
    }
  });
});

describe('standalone JPEG density metadata', () => {
  it('inserts a valid JFIF APP0 with 300 dots per inch', () => {
    const bytes = withJpegDpi(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    expect(Array.from(bytes.slice(0, 18))).toEqual([
      0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 1, 1, 44, 1, 44,
    ]);
    expect(Array.from(bytes.slice(-2))).toEqual([0xff, 0xd9]);
  });

  it('updates existing JFIF density rather than adding a second header', () => {
    const input = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9,
    ]);
    const patched = withJpegDpi(input);
    expect(patched).toHaveLength(input.length);
    expect(Array.from(patched.slice(13, 18))).toEqual([1, 1, 44, 1, 44]);
    expect(input[13]).toBe(0);
  });
});
