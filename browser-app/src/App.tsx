import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react';
import type { FaceDetector } from '@mediapipe/tasks-vision';
import {
  type AgeGroup, type Anchors, type Frame, type Point,
  PHOTO_SIZES, PX_PER_MM, US_EYES, eyeHeightMm, frameProblems, getPreview,
  headHeightMm, headRange, initialFrame, manualFrame, markedWidthMm, previewToSource, sourceToPreview,
} from './geometry';
import { download, photoJpeg, previewDraw, printPdf } from './export';
import { type PaperSize, PAPERS, SHEETS } from './layout';
import { COUNTRIES, getCountry, getProfile, rangeText, type DocumentType } from './requirements';

type Detection = 'idle' | 'loading' | 'one' | 'none' | 'multiple' | 'error';
type Marker = 'crown' | 'chin' | 'eyes' | 'left' | 'right';
type FaceSuggestion = {
  box: { originX: number; originY: number; width: number; height: number };
  eyes?: Point;
};
let detectorPromise: Promise<FaceDetector> | null = null;

function fallbackAnchors(frame: Frame): Anchors {
  const preview = getPreview(frame.format);
  return {
    crown: previewToSource({ x: preview.width / 2, y: frame.format === 'de' ? 75 : preview.height * 0.18 }, frame),
    chin: previewToSource({ x: preview.width / 2, y: frame.format === 'de' ? 375 : preview.height * 0.78 }, frame),
    eyes: frame.format === 'us'
      ? previewToSource({ x: preview.width / 2, y: preview.height - US_EYES.target * PX_PER_MM }, frame)
      : null,
    left: frame.requirements?.width
      ? previewToSource({ x: preview.width / 2 - frame.requirements.width.target * PX_PER_MM / 2, y: preview.height / 2 }, frame)
      : null,
    right: frame.requirements?.width
      ? previewToSource({ x: preview.width / 2 + frame.requirements.width.target * PX_PER_MM / 2, y: preview.height / 2 }, frame)
      : null,
  };
}

async function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const base = import.meta.env.BASE_URL;
      const files = await FilesetResolver.forVisionTasks(`${base}wasm`);
      return FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${base}models/blaze_face_short_range.tflite` },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      });
    })().catch((error: unknown) => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

function renderMarker(ctx: CanvasRenderingContext2D, point: Point, label: string, color: string): void {
  ctx.beginPath();
  ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'white';
  ctx.stroke();
  ctx.font = 'bold 13px system-ui';
  ctx.fillStyle = color;
  ctx.fillText(label, point.x + 12, point.y - 9);
}

export default function App() {
  const [selection, setSelection] = useState<{ country: ReturnType<typeof getCountry>; document: DocumentType }>({
    country: getCountry('de'), document: 'passport',
  });
  const [age, setAge] = useState<AgeGroup>('adult');
  const [paper, setPaper] = useState<PaperSize>('letter');
  const [detected, setDetected] = useState<FaceSuggestion | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [anchors, setAnchors] = useState<Anchors>({ crown: null, chin: null });
  const [confirmed, setConfirmed] = useState({ crown: false, chin: false, eyes: false, left: false, right: false });
  const [activeMarker, setActiveMarker] = useState<Marker | null>(null);
  const [detection, setDetection] = useState<Detection>('idle');
  const [error, setError] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [onePerson, setOnePerson] = useState(false);
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ pointerId: number; point: Point } | null>(null);
  const request = useRef(0);
  const { country, document: documentType } = selection;
  const profile = getProfile(country, documentType);
  const format = profile.format;
  const preview = getPreview(format);
  const photo = PHOTO_SIZES[format];
  const range = headRange(format, age, profile.framing);
  const copies = SHEETS[format][paper].positions.length;
  const paperDefinition = PAPERS[paper];
  const markers: Marker[] = [
    'crown', 'chin', ...(format === 'us' ? ['eyes'] as const : []),
    ...(profile.framing.width ? ['left', 'right'] as const : []),
  ];
  const markerLabel = (marker: Marker) => marker === 'crown' ? format === 'gr' ? 'top of forehead' : 'top of head (crown)' :
    marker === 'eyes' ? 'eye line' : marker === 'left' ? 'left measurement point' :
      marker === 'right' ? 'right measurement point' : 'chin';
  const trimLabel = format === 'us' ? '2 × 2 in' : `${photo.width} × ${photo.height} mm`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !frame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = getPreview(frame.format);
    previewDraw(ctx, image, frame);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(1, 1, size.width - 2, size.height - 2);
    ctx.beginPath();
    ctx.moveTo(size.width / 2, 0);
    ctx.lineTo(size.width / 2, size.height);
    ctx.stroke();
    ctx.restore();
    if (anchors.crown) renderMarker(ctx, sourceToPreview(anchors.crown, frame), frame.format === 'gr' ? 'Top of forehead' : 'Top of head', '#0057b8');
    if (anchors.chin) renderMarker(ctx, sourceToPreview(anchors.chin, frame), 'Chin', '#ae3400');
    if (frame.format === 'us' && anchors.eyes) renderMarker(ctx, sourceToPreview(anchors.eyes, frame), 'Eyes', '#5e2381');
    if (anchors.left) renderMarker(ctx, sourceToPreview(anchors.left, frame), 'Left', '#5e2381');
    if (anchors.right) renderMarker(ctx, sourceToPreview(anchors.right, frame), 'Right', '#5e2381');
  }, [image, frame, anchors]);

  const problems = frame && image ? frameProblems(frame, anchors, age, image) : [];
  const height = frame ? headHeightMm(anchors, frame) : null;
  const exportBlockers: string[] = [];
  if (!image || !frame) exportBlockers.push('Choose a JPG portrait.');
  if (detection === 'loading') exportBlockers.push('Wait for local face detection to finish.');
  if (detection === 'multiple') exportBlockers.push('Retake with only the applicant in the photo.');
  if (detection === 'error') exportBlockers.push('Resolve the photo or face-detection error shown above.');
  if (detection === 'none' && !onePerson) exportBlockers.push('Confirm that the photo shows exactly one person.');
  if (image && frame && (detection === 'one' || detection === 'none')) {
    if (!confirmed.crown) exportBlockers.push('Confirm the top-of-head marker.');
    if (!confirmed.chin) exportBlockers.push('Confirm the chin marker.');
    if (format === 'us' && !confirmed.eyes) exportBlockers.push('Confirm the eye-line marker.');
    if (profile.framing.width && (!confirmed.left || !confirmed.right)) exportBlockers.push('Confirm both horizontal measurement markers.');
    if (!reviewed) exportBlockers.push('Complete the visual quality check.');
    if (problems.length > 0) exportBlockers.push('Fix the crop and measurement warnings above.');
  }
  if (exporting) exportBlockers.push('Wait for the export to finish.');
  const canExport = exportBlockers.length === 0 && Boolean(image && frame && (detection === 'one' || detection === 'none'));

  function changeSelection(code: string, document: DocumentType) {
    const nextCountry = getCountry(code);
    const nextDocument = nextCountry.profiles[document] ? document :
      nextCountry.profiles.passport ? 'passport' : 'visa';
    const nextProfile = getProfile(nextCountry, nextDocument);
    const next = nextProfile.format;
    drag.current = null;
    setSelection({ country: nextCountry, document: nextDocument });
    setAge('adult');
    setConfirmed({ crown: false, chin: false, eyes: false, left: false, right: false });
    setActiveMarker(null);
    setReviewed(false);
    if (detection === 'one') setError('');
    if (detection === 'none') setError('No face was detected. Confirm one person and place all required markers manually.');
    if (!image) return;
    if (detection === 'one' && detected) {
      const suggested = initialFrame(detected.box, 'adult', next, detected.eyes, nextProfile.framing, nextProfile.dpi);
      setFrame(suggested.frame);
      setAnchors(suggested.anchors);
      setBaseScale(suggested.frame.scale);
    } else {
      const fallback = manualFrame(image.naturalWidth, image.naturalHeight, next, nextProfile.framing, nextProfile.dpi);
      setFrame(fallback);
      setAnchors(fallbackAnchors(fallback));
      setBaseScale(fallback.scale);
    }
  }

  async function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const id = ++request.current;
    drag.current = null;
    setError('');
    setImage(null);
    setFrame(null);
    setAnchors({ crown: null, chin: null, eyes: null });
    setConfirmed({ crown: false, chin: false, eyes: false, left: false, right: false });
    setDetected(null);
    setReviewed(false);
    setOnePerson(false);
    setActiveMarker(null);
    setDetection('loading');
    if (!/\.jpe?g$/i.test(file.name)) {
      setDetection('error');
      setError('Only JPG/JPEG files are supported. Choose an original portrait JPG.');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const signature = new Uint8Array(await file.slice(0, 3).arrayBuffer());
      if (signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) {
        throw new Error('This file is not a valid JPEG.');
      }
      const loaded = new Image();
      loaded.src = url;
      await loaded.decode();
      if (id !== request.current) return;
      const fallback = manualFrame(loaded.naturalWidth, loaded.naturalHeight, format, profile.framing, profile.dpi);
      setImage(loaded);
      setFrame(fallback);
      setBaseScale(fallback.scale);
      setAnchors(fallbackAnchors(fallback));
      try {
        const detector = await getDetector();
        const detections = detector.detect(loaded).detections;
        if (id !== request.current) return;
        if (detections.length > 1) {
          setDetection('multiple');
          setError('Several faces were detected. Use a new portrait with only the applicant; export is blocked.');
        } else if (detections.length === 0) {
          setDetection('none');
          setError(`No face was detected. If this really shows one person, position and confirm all ${markers.length} required markers manually, then confirm the single-person check below.`);
        } else {
          const box = detections[0].boundingBox;
          if (!box) throw new Error('The face detector returned no bounding box.');
          const keypoints = detections[0].keypoints;
          const eyes = keypoints.length >= 2 ? {
            x: (keypoints[0].x + keypoints[1].x) * loaded.naturalWidth / 2,
            y: (keypoints[0].y + keypoints[1].y) * loaded.naturalHeight / 2,
          } : undefined;
          setDetected({ box, eyes });
          const suggested = initialFrame(box, age, format, eyes, profile.framing, profile.dpi);
          setFrame(suggested.frame);
          setBaseScale(suggested.frame.scale);
          setAnchors(suggested.anchors);
          setDetection('one');
        }
      } catch (cause) {
        if (id !== request.current) return;
        setDetection('error');
        setError(`Local face detection could not start: ${cause instanceof Error ? cause.message : String(cause)}. Check that the local model and WASM assets are installed, then reload.`);
      }
    } catch (cause) {
      if (id !== request.current) return;
      setDetection('error');
      setError(cause instanceof Error ? cause.message : 'Unable to read this JPG.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function confirmMarker(marker: Marker, point?: Point) {
    if (point) setAnchors((previous) => ({ ...previous, [marker]: point }));
    setConfirmed((previous) => ({ ...previous, [marker]: true }));
    setActiveMarker(markers.find((next) => next !== marker && !confirmed[next]) ?? null);
  }

  function canvasPosition(event: { clientX: number; clientY: number }): Point {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left - canvas.clientLeft) * preview.width / canvas.clientWidth,
      y: (event.clientY - bounds.top - canvas.clientTop) * preview.height / canvas.clientHeight,
    };
  }

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!frame || activeMarker || !event.isPrimary || event.button !== 0 || drag.current) return;
    drag.current = { pointerId: event.pointerId, point: canvasPosition(event) };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!frame || !drag.current || drag.current.pointerId !== event.pointerId || activeMarker) return;
    const next = canvasPosition(event);
    const dx = next.x - drag.current.point.x;
    const dy = next.y - drag.current.point.y;
    drag.current.point = next;
    setFrame((previous) => previous && {
      ...previous,
      center: previewToSource({ x: preview.width / 2 - dx, y: preview.height / 2 - dy }, previous),
    });
  }

  function endPointer(event: PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function clickPreview(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!frame || !activeMarker || event.button !== 0) return;
    const point = canvasPosition(event);
    if (point.x < 0 || point.y < 0 || point.x > preview.width || point.y > preview.height) return;
    confirmMarker(activeMarker, previewToSource(point, frame));
  }

  function keyboardPreview(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!frame) return;
    if (event.key === 'Enter' && activeMarker && anchors[activeMarker]) {
      confirmMarker(activeMarker);
      event.preventDefault();
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step },
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    if (activeMarker && anchors[activeMarker]) {
      const p = sourceToPreview(anchors[activeMarker]!, frame);
      const next = previewToSource({ x: p.x + move.x, y: p.y + move.y }, frame);
      setAnchors((previous) => ({ ...previous, [activeMarker]: next }));
      setConfirmed((previous) => ({ ...previous, [activeMarker]: false }));
    } else {
      setFrame((previous) => previous && {
        ...previous,
        center: previewToSource({
          x: preview.width / 2 - move.x, y: preview.height / 2 - move.y,
        }, previous),
      });
    }
  }

  async function exportFile(kind: 'pdf' | 'jpg') {
    if (!canExport || !image || !frame) return;
    setExporting(true);
    setError('');
    try {
      const blob = kind === 'pdf'
        ? await printPdf(image, frame, paper, `${country.name.toUpperCase()} ${documentType.toUpperCase()} PHOTO`)
        : await photoJpeg(image, frame);
      download(blob, `${country.code}-${documentType}-photo-${format === 'us' ? '2x2in' : `${photo.width}x${photo.height}mm`}${kind === 'pdf' ? `-${PAPERS[paper].filename}` : ''}.${kind}`);
    } catch (cause) {
      setError(`Export failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <span className="eyebrow">PRIVATE · ON THIS DEVICE</span>
        <h1>{country.name} {documentType} photos</h1>
        <p>Frame a JPG for a {trimLabel} {documentType} photo. Detection, editing, and export run in your browser; the image is not uploaded.</p>
      </header>

      <section className="notice" aria-label="Submission policy">
        <strong>Check your authority’s submission rules first.</strong> {profile.submission} Visa submission requirements depend on the consulate and application type. This tool cannot certify eligibility.
      </section>

      <div className="workspace">
        <section className="panel controls" aria-label="Photo setup">
          <h2>1. Choose your portrait</h2>
          <label className="field" htmlFor="format">Passport or visa country</label>
          <select id="format" value={country.code} disabled={detection === 'loading' || exporting}
            onChange={(event) => changeSelection(event.target.value, documentType)}>
            {COUNTRIES.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}{entry.eu ? ' · EU' : ''}</option>)}
          </select>
          <p className="helper">For a passport, choose the issuing country. For a visa, choose the destination country, not your citizenship.</p>
          <label className="field" htmlFor="document">Document type</label>
          <select id="document" value={documentType} disabled={detection === 'loading' || exporting}
            onChange={(event) => changeSelection(country.code, event.target.value === 'visa' ? 'visa' : 'passport')}>
            <option value="passport" disabled={!country.profiles.passport}>Passport{!country.profiles.passport ? ' · not verified' : ''}</option>
            <option value="visa" disabled={!country.profiles.visa}>Visa{!country.profiles.visa ? ' · not verified' : ''}</option>
          </select>
          <p className="helper">Only countries and document types with clear official guidance are offered. EU requirements are country-specific, not interchangeable.</p>
          {(!country.profiles.passport || !country.profiles.visa) && <p className="helper" role="status">{country.name}: only {documentType} requirements have been verified; the other document type is unavailable.</p>}
          <label className="field" htmlFor="photo">Original JPG portrait (stays local)</label>
          <input id="photo" type="file" accept=".jpg,.jpeg,image/jpeg" onChange={openFile} />
          <label className="field" htmlFor="age">Applicant</label>
          <select id="age" value={age} onChange={(event) => { setAge(event.target.value as AgeGroup); setReviewed(false); }}>
            {Object.entries(profile.ages).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          <p className="helper">{country.eu ? 'EU · ' : ''}Chin to {profile.headLandmark}: {rangeText(range)}. {format === 'us' && 'Eye line: 1⅛–1⅜ in (28.575–34.925 mm) above the bottom.'}</p>
          {profile.ageNotes && <p className="helper">{profile.ageNotes[age]}</p>}
          <p className="helper">Use a sharp, evenly lit frontal color photo with natural skin tones, a neutral expression, closed mouth and visible open eyes unless a documented age-specific exception below applies. No retouching, other people or objects. Retake for blur, shadows, occlusion or a turned face; software cannot fix these reliably.</p>
          <p className="helper">{profile.background} {profile.quality}</p>
          {profile.widthLandmarks && <p className="helper">Horizontal measurement: mark the {profile.widthLandmarks}; {rangeText(profile.framing.width!)}.</p>}
          {profile.framing.topGap && <p className="helper">Top-of-head to top edge: {rangeText(profile.framing.topGap)}. Chin to bottom edge: {rangeText(profile.framing.bottomGap!)}.</p>}
          <p className="helper">{profile.sources.map((entry, index) => <span key={entry.url}>{index > 0 && ' · '}<a href={entry.url} target="_blank" rel="noreferrer">{entry.name}</a></span>)}</p>
          {format === 'us' && <p className="helper">U.S. print layout needs the full 2 × 2 in square plus 1 mm of photo outside every edge (52.8 × 52.8 mm of source coverage). A tightly cropped original may need retaking to keep the correct head size and full bleed.</p>}
        </section>

        <section className={`panel preview-panel preview-${format}`} aria-label="Crop preview">
          <div className="preview-header"><h2>Photo preview</h2><span>{trimLabel} trim</span></div>
          {image && frame ? (
            <canvas ref={canvasRef} width={preview.width} height={preview.height}
              tabIndex={0} role="img"
              aria-label={`Passport or visa photo crop. ${activeMarker ? `Move ${markerLabel(activeMarker)} with arrows and confirm with Enter.` : 'Drag or use arrow keys to pan.'}`}
              aria-describedby="preview-instructions"
              onClick={clickPreview} onPointerDown={pointerDown} onPointerMove={pointerMove}
              onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}
              onKeyDown={keyboardPreview} className={`photo-preview ${activeMarker ? 'marking' : ''}`} />
          ) : <div className="empty-preview">Your private portrait preview appears here.</div>}
          {image && frame && (
            <div className="framing">
              <h2>2. Frame and mark the head</h2>
              <div className="marker-buttons">
                <button type="button" className={activeMarker === null ? 'selected' : 'secondary'}
                  aria-pressed={activeMarker === null}
                  onClick={() => { drag.current = null; setActiveMarker(null); }}>Pan photo</button>
                {markers.map((marker) => (
                  <button
                    key={marker}
                    type="button"
                    className={activeMarker === marker ? 'selected' : 'secondary'}
                    aria-pressed={activeMarker === marker}
                    onClick={() => { drag.current = null; setActiveMarker(marker); setConfirmed((previous) => ({ ...previous, [marker]: false })); }}
                  >
                    {confirmed[marker] ? '✓ ' : ''}Set {markerLabel(marker)}
                  </button>
                ))}
              </div>
              <p id="preview-instructions" className="helper" aria-live="polite">{activeMarker
                ? `Tap or click the ${activeMarker === 'crown' ? profile.headLandmark : markerLabel(activeMarker)} in the preview.`
                : 'Drag the preview with one finger or a mouse to pan. Use the sliders to zoom and rotate. Scroll the page outside the photo.'}</p>
              <label className="field" htmlFor="zoom">Zoom · {Math.round((frame.scale / baseScale) * 100)}%</label>
              <input id="zoom" type="range" min="35" max="250" step="1"
                value={Math.round((frame.scale / baseScale) * 100)}
                onChange={(event) => setFrame({ ...frame, scale: baseScale * Number(event.target.value) / 100 })} />
              <label className="field" htmlFor="rotation">Rotate image · {frame.angle}° (−180° to +180°)</label>
              <input id="rotation" type="range" min="-180" max="180" step="1" value={frame.angle}
                onChange={(event) => setFrame({ ...frame, angle: Number(event.target.value) })} />
              <p className="helper">Mark the {profile.headLandmark} and the bottom of the chin without facial hair. {format === 'us' && 'For the eye line, tap midway between both eyes (eyelids if an infant’s eyes are closed).'} For keyboard use, focus the preview, adjust with arrow keys (Shift = 10 pixels), and press Enter to confirm.</p>
              <p className="helper">Rotation can straighten a sideways camera image; it cannot fix a face that was not photographed straight on.</p>
              <p className="measurement" aria-live="polite">
                Chin to {format === 'gr' ? 'top of forehead' : 'top of head'}: <strong>{height === null ? 'not marked' : `${height.toFixed(1)} mm`}</strong>
                <small>Target: {rangeText(range)} within the {photo.width} × {photo.height} mm trim.</small>
                {profile.framing.width && <small>Marked width: {frame && markedWidthMm(anchors, frame) !== null ? `${markedWidthMm(anchors, frame)!.toFixed(1)} mm` : 'not marked'} (target {rangeText(profile.framing.width)}).</small>}
                {format === 'us' && <small>Eye line from bottom: {frame && eyeHeightMm(anchors, frame) !== null ? `${eyeHeightMm(anchors, frame)!.toFixed(1)} mm` : 'not marked'} (target {US_EYES.min}–{US_EYES.max} mm).</small>}
              </p>
            </div>
          )}
          <p className="helper">Dashed border = exact trimmed edge. All markers are guides, not part of the exported photo. Export adds 1 mm of photo <em>outside</em> each trim edge.</p>
        </section>
      </div>

      <section className="panel review" aria-label="Review and export">
        <h2>3. Inspect and export</h2>
        {detection === 'loading' && <p role="status">Loading local face detection…</p>}
        {detection === 'one' && <p role="status">One face detected. Initial placement is approximate; confirm all required markers yourself.</p>}
        {error && <p className="alert" role="alert">{error}</p>}
        {image && detection === 'none' && <label className="check"><input type="checkbox" checked={onePerson} onChange={(e) => setOnePerson(e.target.checked)} />I confirm this photo shows exactly one person and no other person or object.</label>}
        {image && <label className="check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />{format === 'us'
          ? 'I checked the photo was taken within six months, has a plain white/off-white background, even light, natural color, neutral expression with applicable infant exceptions, sharp full frontal face, no filters or facial retouching, no glasses or headwear unless properly excepted, no other person, and eyes open except for an infant. I understand this is not official approval.'
          : `I visually checked the full unobstructed face, suitable age-specific eye visibility, frontal pose, even lighting, plain background, sharpness, and no other person or object. I checked the ${country.name} ${documentType} instructions above, including any measurements not automatically checked. I understand this is not an official approval.`}</label>}
        {image && problems.length > 0 && <div className="alert" role="status"><strong>Fix before export:</strong><ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
        {exportBlockers.length > 0 && <div className="next-steps" role="status"><strong>To enable download:</strong><ul>{exportBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
        <label className="field" htmlFor="paper">Print paper</label>
        <select id="paper" value={paper} onChange={(event) => setPaper(event.target.value as PaperSize)}>
          {(Object.keys(PAPERS) as PaperSize[]).map((key) => <option key={key} value={key}>
            {PAPERS[key].description}{PAPERS[key].photoPaper && format === 'us' ? ' · landscape' : ''} · {SHEETS[format][key].positions.length} photos
          </option>)}
        </select>
        <div className="actions">
          <button type="button" disabled={!canExport} onClick={() => void exportFile('pdf')}>
            Download {paperDefinition.label} print PDF
          </button>
          <button type="button" className="secondary" disabled={!canExport} onClick={() => void exportFile('jpg')}>Download {profile.dpi} DPI JPG</button>
        </div>
        <p className="helper">The PDF is authoritative for physical sizing: {copies} photos with a true {trimLabel} inner trim, 1 mm outside bleed, cut marks, and a 50 mm ruler. Select <strong>{paperDefinition.description}{paperDefinition.photoPaper && format === 'us' ? ' in landscape' : ''} and actual size / 100%</strong>, never “fit to page”; measure the ruler before cutting. On photo paper, turn off borderless enlargement and automatic scaling or cropping. Use the paper type required by your authority. JPG pixel sizes are rounded to whole pixels and its {profile.dpi} DPI metadata is only a hint to print software. Online submission is not validated.</p>
      </section>
      <footer>All processing stays in this browser. Only app and bundled model files are downloaded from this site; your photo is never uploaded. No accounts, external APIs, or model CDNs. Verify current official rules for your application location.</footer>
    </main>
  );
}
