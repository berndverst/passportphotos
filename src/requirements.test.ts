import { describe, expect, it } from 'vitest';
import {
  type Anchors, type Frame, PHOTO_SIZES, frameProblems, getPreview,
  headRange, markedWidthMm, previewToSource, pxAtDpi,
} from './geometry';
import { COUNTRIES, getCountry, getProfile, rangeText, type DocumentType } from './requirements';
import { PAPERS, SHEETS, printLayout } from './layout';
import { withJpegDpi } from './jpeg';

function markedProfile(code: string, document: DocumentType = 'passport') {
  const profile = getProfile(getCountry(code), document);
  const frame: Frame = {
    format: profile.format, center: { x: 4000, y: 5000 }, scale: 0.1, angle: 0,
    requirements: profile.framing, dpi: profile.dpi,
  };
  const preview = getPreview(frame.format);
  const head = profile.framing.head.adult.target;
  const top = profile.framing.topGap?.target ?? (PHOTO_SIZES[frame.format].height - head) / 2;
  const width = profile.framing.width?.target;
  const anchors: Anchors = {
    crown: previewToSource({ x: preview.width / 2, y: top * 10 }, frame),
    chin: previewToSource({ x: preview.width / 2, y: (top + head) * 10 }, frame),
    left: width === undefined ? null : previewToSource({ x: preview.width / 2 - width * 5, y: preview.height / 2 }, frame),
    right: width === undefined ? null : previewToSource({ x: preview.width / 2 + width * 5, y: preview.height / 2 }, frame),
  };
  return { profile, frame, anchors };
}

describe('verified country and document profiles', () => {
  it('offers only the researched EU countries, mainland China, and the U.S.', () => {
    expect(COUNTRIES.map(({ code }) => code)).toEqual(['at', 'be', 'cn', 'hr', 'dk', 'fr', 'de', 'gr', 'ie', 'lv', 'nl', 'us']);
    expect(new Set(COUNTRIES.map(({ code }) => code)).size).toBe(COUNTRIES.length);
    expect(COUNTRIES.filter(({ eu }) => eu)).toHaveLength(10);
    expect(() => getCountry('fi')).toThrow('No verified');
    expect(() => getCountry('xx')).toThrow('No verified');
    expect(() => getProfile(getCountry('fr'), 'visa')).toThrow('No verified visa');
    for (const country of COUNTRIES) {
      expect(Object.keys(country.profiles).length).toBeGreaterThan(0);
      for (const profile of Object.values(country.profiles)) {
        expect(profile.sources.length).toBeGreaterThan(0);
        expect(profile.sources.every(({ url }) => url.startsWith('https://'))).toBe(true);
      }
    }
  });

  it('keeps Dutch ranges, width, and DPI distinct from German framing', () => {
    const dutch = getProfile(getCountry('nl'), 'passport');
    expect(headRange(dutch.format, 'adult', dutch.framing)).toEqual({ min: 26, max: 30, target: 28 });
    expect(headRange(dutch.format, 'child', dutch.framing)).toEqual({ min: 19, max: 30, target: 24.5 });
    expect(dutch.framing.width).toEqual({ min: 16, max: 20, target: 18 });
    expect(dutch.dpi).toBe(400);
    expect(getProfile(getCountry('de'), 'passport').framing.head.adult.min).toBe(32);
    expect(getProfile(getCountry('fr'), 'passport').background).toContain('White backgrounds are forbidden');
  });

  it('does not invent a lower head-height limit for Austria or Croatia', () => {
    expect(getProfile(getCountry('at'), 'passport').framing.head.adult.min).toBeUndefined();
    expect(getProfile(getCountry('hr'), 'visa').framing.head.adult.min).toBeUndefined();
    expect(rangeText({ max: 36 })).toBe('at most 36 mm');
    expect(rangeText({ min: 8 })).toBe('at least 8 mm');
  });

  it('uses China’s shared core dimensions with documented passport margins', () => {
    const passport = getProfile(getCountry('cn'), 'passport');
    const visa = getProfile(getCountry('cn'), 'visa');
    expect(PHOTO_SIZES[passport.format]).toEqual({ width: 33, height: 48 });
    expect(visa.format).toBe(passport.format);
    expect(passport.framing.head).toEqual(visa.framing.head);
    expect(passport.framing.width).toEqual({ min: 15, max: 22, target: 18.5 });
    expect(passport.framing.topGap).toEqual({ min: 3, max: 5, target: 4 });
    expect(passport.framing.bottomGap?.min).toBe(7);
    expect(visa.framing).toEqual(passport.framing);
  });
});

describe('country-specific geometric checks', () => {
  const image = { width: 8000, height: 10000 };
  it.each([['nl', 'passport'], ['cn', 'passport'], ['cn', 'visa'], ['gr', 'passport'], ['at', 'passport'], ['hr', 'visa']] as const)(
    'accepts the marked target for %s %s', (code, document) => {
      const { frame, anchors } = markedProfile(code, document);
      expect(frameProblems(frame, anchors, 'adult', image)).toEqual([]);
    },
  );
  it('requires the width markers and rejects just-outside Dutch width and head ranges', () => {
    const { frame, anchors } = markedProfile('nl');
    expect(markedWidthMm(anchors, frame)).toBeCloseTo(18);
    expect(frameProblems(frame, { ...anchors, right: null }, 'adult', image).join()).toContain('horizontal measurement');
    for (const width of [15.9, 20.1]) {
      const wrong = { ...anchors, right: previewToSource({ x: 85 + width * 10, y: 225 }, frame) };
      expect(frameProblems(frame, wrong, 'adult', image).join()).toContain('Marked width');
    }
    for (const height of [25.9, 30.1]) {
      const wrong = { ...anchors, chin: previewToSource({ x: 175, y: 85 + height * 10 }, frame) };
      expect(frameProblems(frame, wrong, 'adult', image).join()).toContain('height');
    }
  });
  it('accepts exact Chinese margin boundaries and rejects just-outside top margins', () => {
    const { frame, anchors } = markedProfile('cn');
    for (const top of [3, 5]) {
      const positioned = { ...anchors,
        crown: previewToSource({ x: 165, y: top * 10 }, frame),
        chin: previewToSource({ x: 165, y: (top + 30.5) * 10 }, frame),
      };
      expect(frameProblems(frame, positioned, 'adult', image)).toEqual([]);
    }
    for (const top of [2.9, 5.1]) {
      expect(frameProblems(frame, { ...anchors, crown: previewToSource({ x: 165, y: top * 10 }, frame) }, 'adult', image).join())
        .toContain('Top margin');
    }
  });
  it('uses genuine source resolution and JPEG density for 400 and 1200 DPI presets', () => {
    expect(pxAtDpi(35, 400)).toBe(551);
    expect(pxAtDpi(45, 400)).toBe(709);
    expect(pxAtDpi(40, 1200)).toBe(1890);
    expect(pxAtDpi(60, 1200)).toBe(2835);
    const { frame, anchors } = markedProfile('gr');
    expect(frameProblems({ ...frame, scale: 0.3 }, anchors, 'adult', image).join()).toContain('1200 DPI');
    for (const dpi of [400, 1200]) {
      const bytes = withJpegDpi(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), dpi);
      expect((bytes[14] << 8) | bytes[15]).toBe(dpi);
      expect((bytes[16] << 8) | bytes[17]).toBe(dpi);
    }
  });
});

describe('additional country print layouts', () => {
  it.each(['cn', 'gr'] as const)('keeps %s trim, bleed, and cut marks within every sheet', (format) => {
    for (const paper of Object.keys(PAPERS) as (keyof typeof PAPERS)[]) {
      const sheet = SHEETS[format][paper];
      for (const position of sheet.positions) {
        const { image, trim, marks } = printLayout(position.x, position.y, format);
        expect(trim.width).toBe(PHOTO_SIZES[format].width);
        expect(trim.height).toBe(PHOTO_SIZES[format].height);
        expect(image.x).toBeGreaterThan(0);
        expect(image.y).toBeGreaterThan(0);
        expect(image.x + image.width).toBeLessThan(sheet.width);
        expect(image.y + image.height).toBeLessThan(sheet.height);
        for (const mark of marks) {
          expect(Math.min(mark.x1, mark.x2)).toBeGreaterThanOrEqual(0);
          expect(Math.max(mark.x1, mark.x2)).toBeLessThanOrEqual(sheet.width);
          expect(Math.min(mark.y1, mark.y2)).toBeGreaterThanOrEqual(0);
          expect(Math.max(mark.y1, mark.y2)).toBeLessThanOrEqual(sheet.height);
        }
      }
    }
    expect(SHEETS[format].photo10x15.positions).toHaveLength(format === 'gr' ? 1 : 2);
  });
});
