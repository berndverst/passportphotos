import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  BLEED_MM, DPI, type Frame, PHOTO_SIZES, PX_PER_MM, getPreview, pxAtDpi,
} from './geometry';
import { withJpegDpi } from './jpeg';
import { type PaperSize, PAPERS, SHEETS, printLayout, pt } from './layout';

function renderPhoto(image: HTMLImageElement, frame: Frame, bleedMm: number): HTMLCanvasElement {
  const photo = PHOTO_SIZES[frame.format];
  const canvas = document.createElement('canvas');
  canvas.width = pxAtDpi(photo.width + 2 * bleedMm);
  canvas.height = pxAtDpi(photo.height + 2 * bleedMm);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is not available in this browser.');
  const ratio = DPI / 25.4 / PX_PER_MM;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(ratio, ratio);
  ctx.rotate((frame.angle * Math.PI) / 180);
  ctx.scale(frame.scale, frame.scale);
  ctx.drawImage(image, -frame.center.x, -frame.center.y);
  return canvas;
}

async function jpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((output) => output ? resolve(output) : reject(new Error('JPEG encoding failed.')), 'image/jpeg', 0.95);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function photoJpeg(image: HTMLImageElement, frame: Frame): Promise<Blob> {
  const bytes = withJpegDpi(await jpegBytes(renderPhoto(image, frame, 0)));
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
}

export async function printPdf(image: HTMLImageElement, frame: Frame, paper: PaperSize): Promise<Blob> {
  const bytes = await jpegBytes(renderPhoto(image, frame, BLEED_MM));
  const doc = await PDFDocument.create();
  const sheet = SHEETS[frame.format][paper];
  const paperDefinition = PAPERS[paper];
  const page = doc.addPage([pt(sheet.width), pt(sheet.height)]);
  const photo = await doc.embedJpg(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const black = rgb(0.12, 0.16, 0.22);
  if (!paperDefinition.photoPaper) {
    page.drawText(`${frame.format === 'us' ? 'U.S.' : 'GERMAN'} PASSPORT PHOTO - PRINT PROOF`, {
      x: pt(31), y: pt(sheet.height - 16.4), size: 12, font, color: black,
    });
    page.drawText(`Print on ${paperDefinition.pdfLabel} at actual size / 100%. Do not fit to page.`, {
      x: pt(31), y: pt(sheet.height - 26.4), size: 9, font, color: black,
    });
  } else if (frame.format === 'de') {
    page.drawText(`GERMAN PASSPORT PHOTO - ${paperDefinition.pdfLabel}`, {
      x: pt(8), y: pt(sheet.height - 13.4), size: 10, font, color: black,
    });
    page.drawText('Print at 100%. Disable borderless enlargement and auto-fit.', {
      x: pt(8), y: pt(sheet.height - 19.4), size: 8, font, color: black,
    });
  } else {
    page.drawText(`U.S. PASSPORT | ${paperDefinition.pdfLabel} LANDSCAPE | PRINT AT 100%`, {
      x: pt(8), y: pt(sheet.height - 8.6), size: 9, font, color: black,
    });
  }
  for (const position of sheet.positions) {
    const layout = printLayout(position.x, position.y, frame.format);
    page.drawImage(photo, {
      x: pt(layout.image.x), y: pt(layout.image.y),
      width: pt(layout.image.width), height: pt(layout.image.height),
    });
    for (const mark of layout.marks) {
      page.drawLine({
        start: { x: pt(mark.x1), y: pt(mark.y1) },
        end: { x: pt(mark.x2), y: pt(mark.y2) },
        color: black, thickness: pt(0.18),
      });
    }
  }
  const size = PHOTO_SIZES[frame.format];
  if (!paperDefinition.photoPaper) {
    page.drawText(`Cut at the aligned marks: each inner photo is exactly ${size.width} x ${size.height} mm.`, {
      x: pt(31), y: pt(65), size: 9, font, color: black,
    });
    page.drawText('Check the 50 mm line with a ruler before cutting. Marks and 1 mm bleed are OUTSIDE the photo.', {
      x: pt(31), y: pt(57), size: 8, font, color: black,
    });
  } else if (frame.format === 'de') {
    page.drawText('Cut at marks: each inner photo is 35 x 45 mm.', {
      x: pt(8), y: pt(58), size: 8, font, color: black,
    });
    page.drawText('1 mm bleed outside trim. Check the 50 mm line.', {
      x: pt(8), y: pt(52), size: 8, font, color: black,
    });
  } else {
    page.drawText('Cut at marks: each inner photo is 2 x 2 in.', {
      x: pt(8), y: pt(23), size: 7, font, color: black,
    });
  }
  const rulerY = !paperDefinition.photoPaper ? 40 : frame.format === 'us' ? 15 : 31;
  const rulerX = (sheet.width - 50) / 2;
  page.drawLine({ start: { x: pt(rulerX), y: pt(rulerY) }, end: { x: pt(rulerX + 50), y: pt(rulerY) }, thickness: pt(0.3), color: black });
  for (const x of [rulerX, rulerX + 50]) {
    page.drawLine({ start: { x: pt(x), y: pt(rulerY - 2) }, end: { x: pt(x), y: pt(rulerY + 2) }, thickness: pt(0.3), color: black });
  }
  page.drawText('50 mm', { x: pt(rulerX + 19), y: pt(rulerY + 3), size: 9, font, color: black });
  if (!paperDefinition.photoPaper) {
    page.drawText('Acceptance and submission method depend on the authority; printed photos may not be accepted.', {
      x: pt(31), y: pt(25), size: 8, font, color: black,
    });
  } else if (frame.format === 'de') {
    page.drawText('Check your authority; home prints may not be accepted.', {
      x: pt(8), y: pt(13), size: 7, font, color: black,
    });
  } else {
    page.drawText('Disable borderless/auto-fit. Measure the 50 mm line.', {
      x: pt(8), y: pt(6), size: 7, font, color: black,
    });
  }
  const pdf = await doc.save();
  return new Blob([new Uint8Array(pdf)], { type: 'application/pdf' });
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  try {
    a.click();
  } finally {
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export function previewDraw(ctx: CanvasRenderingContext2D, image: HTMLImageElement, frame: Frame): void {
  const preview = getPreview(frame.format);
  ctx.clearRect(0, 0, preview.width, preview.height);
  ctx.save();
  ctx.translate(preview.width / 2, preview.height / 2);
  ctx.rotate((frame.angle * Math.PI) / 180);
  ctx.scale(frame.scale, frame.scale);
  ctx.drawImage(image, -frame.center.x, -frame.center.y);
  ctx.restore();
}
