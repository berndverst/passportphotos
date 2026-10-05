# Passport photo · local editor

A browser-based JPG crop and print tool for **German 35 × 45 mm** and **U.S. 2 × 2 in (50.8 × 50.8 mm)** passport photos. Photos and face detection stay on your device: the face model and MediaPipe WebAssembly runtime are bundled locally, with no photo-upload endpoint. The app does not replace an official photographer, certify eligibility, or repair occlusion, extra people/objects, blur, harsh shadows, lighting, or pose.

## Hosted site and deployment

The hosted browser-only edition is published at **https://passportphotos.bernd.dev/**. Its sources and bundled model/runtime assets are in `browser-app`; the root-level `.github/workflows/deploy-pages.yml` runs its unit tests, builds `browser-app/dist`, and deploys that directory through GitHub Actions on every push to `main`. No separate `gh-pages` branch or server backend is needed. To preview the hosted edition locally, run `npm ci`, `npm run build`, and `npm run preview` from `browser-app`.

In **Settings > Pages**, the deployment source must be **GitHub Actions** and the custom domain must be `passportphotos.bernd.dev`. `browser-app/public/CNAME` is copied into the deployed build; for Actions-based Pages deployments, the domain must also be configured in the repository's Pages settings.

Configure this record at the DNS host for `bernd.dev`:

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `passportphotos` | `berndverst.github.io` |

The target is the GitHub account's Pages hostname, not a repository URL or a value containing `/passportphotos`. On Cloudflare, use **DNS only** (not proxied) for domain verification and HTTPS certificate provisioning. After DNS propagates and GitHub provisions the certificate, enable **Enforce HTTPS** in the repository's Pages settings. The `.dev` domain requires HTTPS in browsers, so the custom URL will not be usable until its certificate is ready.

See [`browser-app/README.md`](browser-app/README.md) for the hosted edition's privacy, static-hosting, and production smoke-test details.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). For an offline production build run `npm run build`, then serve the `dist` folder locally (for example `npx vite preview --host 127.0.0.1` if Vite is already installed). `npm test` runs unit tests; `npm run test:smoke` runs a browser export test using Microsoft Edge at its normal Windows install path (or `EDGE_PATH` to override it). **Do not open `index.html` as a `file://` URL**: browsers need a local HTTP origin to load the WASM and model assets. Once dependencies are installed and built, editing/exporting does not require internet access. For a new checkout, the pre-bundled `public/models` and `public/wasm` files must be present.

## Workflow and printing

### Mobile browsers

The editor adapts to phone and tablet screens in portrait or landscape. Framing controls sit with the preview, buttons and sliders have touch-sized targets, and the page still allows browser zoom. Select a JPG from your device, tap a marker button and then its location in the photo, or choose **Pan photo** and drag with one finger. Use the sliders for zoom and rotation; scroll outside the photo to move down the page. Pinch-to-zoom the crop is not supported.

Photos must be JPG/JPEG, not HEIC: export or convert a phone photo to JPEG before selecting it. Downloads are generated locally; if your mobile browser opens a PDF rather than saving it, use its save/share menu. Mobile printer dialogs must still use the exact paper size and 100% scale described below. `npm run test:smoke` also covers emulated mobile portrait/landscape layouts, touch markers, panning, scrolling, and German/U.S. downloads in Chromium; it is not a substitute for testing physical iOS/Android devices.

1. Choose Germany or United States, the applicant age, and an original JPG showing one person. Local detection proposes an **approximate** crop only when exactly one face is detected; it cannot determine the true top of the head. If no face is detected, deliberately confirm there is only one person and place all required markers manually. More than one detected face blocks export. Switching country resets the framing and quality confirmations.
2. Pan, zoom, and rotate the camera image through **−180° to +180°**; rotation does not fix a non-frontal face. Select each marker and click the preview, or focus the preview and adjust with arrow keys (Shift for 10-pixel steps) and Enter. **Germany:** confirm top of head/crown (including normal hair, not stray strands or headwear) and chin. Adults target 32–36 mm; children 10 and under target 50–80% of photo height (22.5–36 mm), with additional allowances for ages 0–6. **United States:** confirm the *anatomical* top of the head (**not the hair or hairline**), chin without beard, and a point halfway between the eyes (or eyelids for an infant). Head-to-chin must be **1–1⅜ in (25.4–34.925 mm)** and eye line **1⅛–1⅜ in (28.575–34.925 mm)** above the bottom. U.S. infants under one may have eyes partly or fully closed; this exception is not for older children. The app blocks measurements outside range, too few native pixels for 300 DPI, out-of-bounds crop or bleed, and ambiguous face detection.
3. Inspect quality yourself and choose **US Letter (8.5 × 11 in)** for four photos or **4 × 6 in photo paper** for two. For **U.S. photos, the 4 × 6 PDF is landscape** with two photos side by side; German 4 × 6 is portrait. Both formats have exact inner trim (35 × 45 mm German; 2 × 2 in U.S.), 1 mm photographic bleed **outside** each edge, cut marks aligned with the inner trim (outside the bleed), and a 50 mm scale line. Select the matching paper size and print at **actual size / 100%**, never fit-to-page. For 4 × 6 printers, disable borderless enlargement and automatic scaling/cropping. Verify the scale line with a ruler before cutting; if it does not measure 50 mm, do not use that print. The separate JPG is 413 × 531 pixels for Germany or 600 × 600 pixels for the U.S., with 300 DPI JFIF metadata. **The PDF is authoritative for physical print dimensions.**

If the editor reports an out-of-bounds crop or bleed, the uploaded JPG does not cover the whole requested area. **Recenter or zoom in slightly** (zooming out reveals more missing image). U.S. prints need 52.8 × 52.8 mm of source coverage including outside bleed, compared with a 50.8 × 50.8 mm trimmed photo. If zooming in makes the head too large or prevents correct eye height, use a new portrait with more space around the person; the app will not invent missing background. Download buttons also require the marked points, quality review, and any single-person confirmation; the editor lists every remaining blocker.

Before using a print or file for an application, ask the receiving authority about its current submission method. Domestic German passport applications generally require secure digital photo capture; home-printed or self-generated images may not be accepted. See the [German Federal Ministry of the Interior photo examples](https://www.germany.info/resource/blob/906790/6e3eee9fd4d86e16aaefe0e92d809332/dd-sample-photos-data.pdf) for visual guidance.

For a U.S. print application, use photo-quality paper and a recent color photo (within six months) with natural expression, frontal full face, plain white/off-white background, even lighting, and no filters or facial retouching. Eyeglasses require documented medical necessity; head coverings require applicable religious or medical exceptions. Infants have allowances for closed eyes and some head tilt; no parent or other person may be in the photo. Review the [U.S. Department of State passport photo guidance](https://travel.state.gov/en/passports/apply/help/photos.html) and [official policy (8 FAM 402.1)](https://fam.state.gov/FAM/08FAM/08FAM040201.html) for up-to-date exceptions. Online application photo upload requirements differ; the standalone printable JPG is **not** automatically suitable for online submission.

The on-device face model is Google's MediaPipe BlazeFace short-range float16 model, downloaded from `storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/`. MediaPipe vision WASM assets are copied from the `@mediapipe/tasks-vision` package into `public/wasm`. All of these files are shipped locally so normal use makes no model CDN request.
