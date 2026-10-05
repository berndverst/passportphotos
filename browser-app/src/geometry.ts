export type Point = { x: number; y: number };
export type PhotoFormat = 'de' | 'us';
export type Frame = { center: Point; scale: number; angle: number; format: PhotoFormat };
export type AgeGroup = 'adult' | 'child' | 'infant';
export type Anchors = { crown: Point | null; chin: Point | null; eyes?: Point | null };

export const PHOTO_SIZES = {
  de: { width: 35, height: 45 },
  us: { width: 50.8, height: 50.8 },
} as const;
export const PHOTO_MM = PHOTO_SIZES.de;
export const BLEED_MM = 1;
export const DPI = 300;
export const PX_PER_MM = 10;
export const getPreview = (format: PhotoFormat) => ({
  width: PHOTO_SIZES[format].width * PX_PER_MM,
  height: PHOTO_SIZES[format].height * PX_PER_MM,
});
export const PREVIEW = getPreview('de');
export const US_HEAD = { min: 25.4, max: 34.925, target: 30 } as const;
export const US_EYES = { min: 28.575, max: 34.925, target: 31.75 } as const;

export const pxAtDpi = (mm: number) => Math.round((mm * DPI) / 25.4);
export const mmToPt = (mm: number) => (mm * 72) / 25.4;

export const groups: Record<AgeGroup, { name: string; min: number; max: number; target: number; note: string }> = {
  adult: {
    name: 'Adult / over 10',
    min: 32,
    max: 36,
    target: 34,
    note: 'Aim for 32–36 mm from chin to the natural top of the head (crown). Face straight ahead, centered, eyes visible.',
  },
  child: {
    name: 'Child 7–10',
    min: 22.5,
    max: 36,
    target: 31,
    note: 'For children 10 and under, 50–80% head height is allowed, with minor deviations. Aim for a clear frontal photo.',
  },
  infant: {
    name: 'Child 0–6',
    min: 22.5,
    max: 36,
    target: 30,
    note: 'For age 6 and under, further allowances apply to head position, expression and eye visibility. Eyes do not have to be open; a frontal photo without another person or object is still needed.',
  },
};

export function headRange(format: PhotoFormat, group: AgeGroup) {
  return format === 'us' ? US_HEAD : groups[group];
}

export function sourceToPreview(point: Point, frame: Frame): Point {
  const preview = getPreview(frame.format);
  const dx = (point.x - frame.center.x) * frame.scale;
  const dy = (point.y - frame.center.y) * frame.scale;
  const a = (frame.angle * Math.PI) / 180;
  return {
    x: preview.width / 2 + dx * Math.cos(a) - dy * Math.sin(a),
    y: preview.height / 2 + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

export function previewToSource(point: Point, frame: Frame): Point {
  const preview = getPreview(frame.format);
  const dx = point.x - preview.width / 2;
  const dy = point.y - preview.height / 2;
  const a = (-frame.angle * Math.PI) / 180;
  return {
    x: frame.center.x + (dx * Math.cos(a) - dy * Math.sin(a)) / frame.scale,
    y: frame.center.y + (dx * Math.sin(a) + dy * Math.cos(a)) / frame.scale,
  };
}

export function headHeightMm(anchors: Anchors, frame: Frame): number | null {
  if (!anchors.crown || !anchors.chin) return null;
  return (sourceToPreview(anchors.chin, frame).y - sourceToPreview(anchors.crown, frame).y) / PX_PER_MM;
}

export function eyeHeightMm(anchors: Anchors, frame: Frame): number | null {
  if (!anchors.eyes) return null;
  return (getPreview(frame.format).height - sourceToPreview(anchors.eyes, frame).y) / PX_PER_MM;
}

export function initialFrame(
  box: { originX: number; originY: number; width: number; height: number },
  group: AgeGroup,
  format: PhotoFormat = 'de',
  eyes?: Point,
): { frame: Frame; anchors: Anchors } {
  // A face box does not identify the anatomical top of the head: these are only starting estimates.
  const crown = { x: box.originX + box.width / 2, y: box.originY - box.height * 0.1 };
  const chin = { x: crown.x, y: box.originY + box.height };
  const scale = (headRange(format, group).target * PX_PER_MM) / (chin.y - crown.y);
  const guessedEyes = eyes ?? { x: crown.x, y: box.originY + box.height * 0.4 };
  const preview = getPreview(format);
  const centerY = format === 'us'
    ? guessedEyes.y - ((preview.height - US_EYES.target * PX_PER_MM) - preview.height / 2) / scale
    : (crown.y + chin.y) / 2;
  return {
    frame: { center: { x: crown.x, y: centerY }, scale, angle: 0, format },
    anchors: { crown, chin, eyes: format === 'us' ? guessedEyes : null },
  };
}

export function manualFrame(width: number, height: number, format: PhotoFormat = 'de'): Frame {
  const preview = getPreview(format);
  return {
    center: { x: width / 2, y: height / 2 },
    scale: 1.15 * Math.max(preview.width / width, preview.height / height),
    angle: 0,
    format,
  };
}

export function frameProblems(
  frame: Frame,
  anchors: Anchors,
  group: AgeGroup,
  image: { width: number; height: number },
): string[] {
  const problems: string[] = [];
  const format = frame.format;
  const preview = getPreview(format);
  const photo = PHOTO_SIZES[format];
  if (!Number.isFinite(frame.scale) || frame.scale <= 0 || !Number.isFinite(frame.angle)) {
    return ['Invalid crop transform. Reopen the photo.'];
  }
  if (!anchors.crown || !anchors.chin) {
    problems.push('Mark both the top of the head and the chin on the preview.');
  } else {
    const height = headHeightMm(anchors, frame)!;
    const range = headRange(format, group);
    if (height < range.min - 1e-6 || height > range.max + 1e-6) {
      problems.push(`Chin-to-top-of-head height is ${height.toFixed(1)} mm; adjust zoom to ${range.min}–${range.max} mm.`);
    }
    const crown = sourceToPreview(anchors.crown, frame);
    const chin = sourceToPreview(anchors.chin, frame);
    if (Math.abs((crown.x + chin.x) / 2 - preview.width / 2) > 50) {
      problems.push('Center the head horizontally in the photo.');
    }
    if (crown.y < 0 || chin.y > preview.height) {
      problems.push(`Keep the full head and chin inside the ${photo.width} × ${photo.height} mm trim.`);
    }
  }
  if (format === 'us') {
    if (!anchors.eyes) {
      problems.push('Mark the midpoint between the eyes (or eyelids for infants).');
    } else {
      const eyeHeight = eyeHeightMm(anchors, frame)!;
      if (eyeHeight < US_EYES.min - 1e-6 || eyeHeight > US_EYES.max + 1e-6) {
        problems.push(`Eye line is ${eyeHeight.toFixed(1)} mm from the bottom; pan vertically to ${US_EYES.min}–${US_EYES.max} mm.`);
      }
      const eyeY = sourceToPreview(anchors.eyes, frame).y;
      if (anchors.crown && anchors.chin &&
          (eyeY <= sourceToPreview(anchors.crown, frame).y || eyeY >= sourceToPreview(anchors.chin, frame).y)) {
        problems.push('The eye line must sit between the top of the head and chin.');
      }
      if (anchors.crown && anchors.chin) {
        const crown = sourceToPreview(anchors.crown, frame);
        const chin = sourceToPreview(anchors.chin, frame);
        if (Math.abs(sourceToPreview(anchors.eyes, frame).x - (crown.x + chin.x) / 2) > 80) {
          problems.push('Mark the eye line near the center of the face.');
        }
      }
    }
  }
  const outsideSource = (margin: number) => [
    { x: -margin, y: -margin },
    { x: preview.width + margin, y: -margin },
    { x: -margin, y: preview.height + margin },
    { x: preview.width + margin, y: preview.height + margin },
  ].some((corner) => {
    const source = previewToSource(corner, frame);
    return source.x < 0 || source.y < 0 || source.x > image.width || source.y > image.height;
  });
  if (outsideSource(0)) {
    problems.push('The trimmed photo extends beyond the source JPG. Recenter or zoom in to use less of the image; if the required head and eye sizes then cannot fit, retake with more room around the head.');
  } else if (outsideSource(BLEED_MM * PX_PER_MM)) {
    problems.push('The trim fits, but its 1 mm outer print bleed extends beyond the source JPG. Recenter or zoom in slightly; if this makes the head too large, retake with more room around the head.');
  }
  if (image.width < pxAtDpi(photo.width) || image.height < pxAtDpi(photo.height) ||
      preview.width / frame.scale < pxAtDpi(photo.width) ||
      preview.height / frame.scale < pxAtDpi(photo.height)) {
    problems.push(`Not enough native source pixels for 300 DPI at ${photo.width} × ${photo.height} mm; choose a higher-resolution photo or zoom out.`);
  }
  return problems;
}
