# Passport & visa photos · browser-only edition

A standalone JPG crop and print tool for country-specific **passport and visa photos**, including verified EU document profiles, **mainland China 33 × 48 mm**, and **U.S. 2 × 2 in (50.8 × 50.8 mm)** photos, ready for **GitHub Pages**. Choose the passport's issuing country or the visa's destination country, not the applicant's citizenship. The browser loads static application, face-model, and WebAssembly files from the same site. Photo decoding, face detection, editing, JPEG generation, and PDF generation run entirely on your device: there is **no backend, upload endpoint, account, external API, or model CDN**. The production content security policy blocks connections to other origins. The app does not replace an official photographer, certify eligibility, or repair occlusion, extra people/objects, blur, harsh shadows, lighting, or pose.

This folder is independent of the original project. It includes its own sources, dependency lockfile, bundled model/runtime assets, tests, and deployment workflow. Changes here do not change the original.

## Verified country profiles

EU photo requirements are **not interchangeable**. Countries and document types without clear official crop guidance are omitted, rather than assigned Germany's rules. Each offered profile links to its official source in the app. Changing country or document type resets measurements and the quality review; if the selected document type is unavailable in the new country, the selector switches to that country's verified type and disables the unavailable option.

| Country | Offered documents | Trim | Head measurement | Output density |
| --- | --- | --- | --- | --- |
| Austria | Passport | 35 × 45 mm | About two thirds of photo; maximum 36 mm; pupil spacing ≥8 mm | 300 DPI |
| Belgium | Passport | 35 × 45 mm | Chin to crown 31–36 mm | 400 DPI |
| Croatia | Visa | 35 × 45 mm | About two thirds of photo; maximum 36 mm; pupil spacing ≥8 mm | 300 DPI |
| Denmark | Passport | 35 × 45 mm | Chin to top of hair 30–36 mm | 300 DPI |
| France | Passport | 35 × 45 mm | Chin to anatomical crown 32–36 mm; white background forbidden | 300 DPI |
| Germany | Passport, visa | 35 × 45 mm | Adult 32–36 mm; existing child allowances | 300 DPI |
| Greece | Passport (consular prints) | 40 × 60 mm | Chin to top of forehead 30–36 mm; shoulder-to-hair proportion checked visually | 1200 DPI |
| Ireland | Visa | 35 × 45 mm, within the official size range | Face 70–80% of photo height | 300 DPI |
| Latvia | Visa | 35 × 45 mm | Face 70–80% of photo height | 300 DPI |
| Netherlands | Passport | 35 × 45 mm | Age 11+: 26–30 mm; age ≤10: 19–30 mm; ear-root width 16–20 mm | 400 DPI |
| China (mainland) | Passport, visa | 33 × 48 mm | Height 28–33 mm; width 15–22 mm | 300 DPI |
| United States | Passport, visa | 2 × 2 in | Head 1–1⅜ in; eye line 1⅛–1⅜ in above bottom | 300 DPI |

China's passport and visa sources specify the **same size, head dimensions, and margins**: **33 × 48 mm**, head height **28–33 mm**, head width **15–22 mm**, a **3–5 mm top margin**, and **at least 7 mm below the chin**. The visa source's official diagram confirms the margin figures. These are enforced for both document types. Their paper and digital submission instructions differ. This tool cannot issue a Chinese certified-photo receipt. The relevant sources are the [Chinese Chicago consulate](https://chicago.china-consulate.gov.cn/lsfw/zj/hzlxz/202605/t20260501_11903971.htm) and [Chinese Visa Application Service Centre](https://www.visaforchina.cn/SYD3_EN/qianzhengyewu/jichuzhishi/changjianwenti/355135188537315328.html).

The app checks only the measured crop constraints, not the source photo's background, expression, eyewear, full quality, or every national exception. Review the displayed country-specific instructions yourself. Greek domestic passport applications require the government myPhoto service, which this tool cannot submit to; consular prints require professional photographic processing rather than household inkjet/laser printing.

## Deploy to GitHub Pages

In this repository, the root-level `.github/workflows/deploy-pages.yml` builds and deploys this folder on pushes to `main`. The custom domain is `passportphotos.bernd.dev`; `public/CNAME` is included in the build. Repository Pages settings must use **GitHub Actions** and the same custom domain. Point the DNS CNAME `passportphotos` at `berndverst.github.io` (Cloudflare: **DNS only**), then enable **Enforce HTTPS** once GitHub provisions the certificate.

To deploy this standalone edition in another repository:

1. Put the **contents of this folder at the root of a new GitHub repository**, including the hidden `.github` folder and all of `public`. Do not copy the original project's `node_modules` or `dist`.
2. In the repository's **Settings > Pages > Build and deployment**, select **GitHub Actions**.
3. Push to `main`, or run **Deploy browser app to GitHub Pages** manually from the Actions tab. If your default branch is not `main`, update the workflow's push branch first.

Remove or replace `public/CNAME` when deploying with a different hostname, and configure any custom domain in that repository's Pages settings as well.

The included `.github/workflows/deploy-pages.yml` installs build dependencies, runs unit tests, builds `dist`, and deploys **only those static files**. Node.js is needed for building, not for hosting or using the deployed app. Relative asset paths support both `https://OWNER.github.io/REPOSITORY/` and a root/custom-domain site without hardcoding a repository name. Use the site's trailing-slash URL; this is a single-page tool, not a client-side router.

For another static host, run `npm run build` and publish the **entire `dist` folder**, including `assets`, `models`, and `wasm`. Serve `.wasm` files as `application/wasm`. No server functions or rewrite rules are required.

## Privacy and network behavior

Opening the site downloads its HTML, CSS, and JavaScript. The first selected JPG triggers downloads of the site's bundled face model and WASM runtime. These are static GET requests, not processing/API calls; the JPG itself stays in browser memory, and exports are generated as local Blob downloads. There are no analytics, remote fonts, image uploads, or browser calls to a model CDN.

The app is **not an offline-installable PWA** and does not promise to reload without a network connection. Once the page and face model/runtime have loaded, processing and exports need no additional network service. Normal browser asset caching may reduce later downloads. Opening the built HTML directly with `file://` is not supported; GitHub Pages supplies the static HTTP/HTTPS origin needed by browser modules and WASM.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```powershell
npm ci
npm run dev
```

Run these commands from this folder. Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). To preview the deployed version, run `npm run build` and `npm run preview`. These local static servers are development tools, not required backends for the deployed app.

`npm test` runs unit tests. `npm run test:smoke` builds the production site and tests it with Microsoft Edge at its normal Windows install path (`EDGE_PATH` can point to another installed Chromium browser). The smoke test serves only `dist`, exercises a GitHub Pages-style repository subpath and root hosting, loads the real bundled detector, switches the browser offline before checking German/U.S. JPG/PDF exports, and rejects non-GET or out-of-site requests. It does not rely on Vite's development server.

## Workflow and printing

### Mobile browsers

The editor adapts to phone and tablet screens in portrait or landscape. Framing controls sit with the preview, buttons and sliders have touch-sized targets, and the page still allows browser zoom. Select a JPG from your device, tap a marker button and then its location in the photo, or choose **Pan photo** and drag with one finger. Use the sliders for zoom and rotation; scroll outside the photo to move down the page. Pinch-to-zoom the crop is not supported.

Photos must be JPG/JPEG, not HEIC: export or convert a phone photo to JPEG before selecting it. Downloads are generated locally; if your mobile browser opens a PDF rather than saving it, use its save/share menu. Mobile printer dialogs must still use the exact paper size and 100% scale described below. `npm run test:smoke` also covers emulated mobile portrait/landscape layouts, touch markers, panning, scrolling, and German/U.S. downloads in Chromium against the built static site; it is not a substitute for testing physical iOS/Android devices.

1. Choose a verified country and document type, the applicant age, and an original JPG showing one person. Local detection proposes an **approximate** crop only when exactly one face is detected; it cannot determine the true top of the head. If no face is detected, deliberately confirm there is only one person and place all required markers manually. More than one detected face blocks export. Switching country or document type resets the framing and quality confirmations.
2. Pan, zoom, and rotate the camera image through **−180° to +180°**; rotation does not fix a non-frontal face. Select each marker and click the preview, or focus the preview and adjust with arrow keys (Shift for 10-pixel steps) and Enter. Follow the selected profile's upper landmark: normal crown/hair for Germany, top of hair for Denmark, top of forehead for Greece, or anatomical crown where specified. Mark the chin without facial hair. When required, also confirm the horizontal points: pupil centers for Austria/Croatia, ear roots for the Netherlands, or head edges for China. U.S. photos additionally require the midpoint between the eyes or an infant's eyelids. The app checks the selected profile's ranges, margins, required native source resolution, full crop/bleed coverage, and face-count ambiguity; child exceptions are not copied between countries.
3. Inspect quality yourself and choose **US Letter (8.5 × 11 in)** or **DIN A4 (210 × 297 mm)** for four photos, or **10 × 15 cm** or **4 × 6 in photo paper** for two (**one** for Greece's larger photo). U.S. photo-paper PDFs are landscape; the other profiles use portrait paper. **10 × 15 cm is exactly 100 × 150 mm, not 4 × 6 in (101.6 × 152.4 mm)**; choose the option matching your actual paper. Every PDF uses the selected exact inner trim, 1 mm photographic bleed **outside** each edge, aligned cut marks outside the bleed, and a 50 mm scale line. Print at **actual size / 100%**, never fit-to-page, and disable borderless enlargement and automatic scaling/cropping. Verify the scale line with a ruler before cutting; if it is not 50 mm, do not use the print. JPG output uses the profile's required density: Germany 413 × 531 at 300 DPI, U.S. 600 × 600 at 300 DPI, China 390 × 567 at 300 DPI, Belgium/Netherlands 551 × 709 at 400 DPI, and Greece 1890 × 2835 at 1200 DPI. **The PDF is authoritative for physical print dimensions.** Use the authority's required paper and printing method, not household printing where it is prohibited.

If the editor reports an out-of-bounds crop or bleed, the uploaded JPG does not cover the whole requested area. **Recenter or zoom in slightly** (zooming out reveals more missing image). U.S. prints need 52.8 × 52.8 mm of source coverage including outside bleed, compared with a 50.8 × 50.8 mm trimmed photo. If zooming in makes the head too large or prevents correct eye height, use a new portrait with more space around the person; the app will not invent missing background. Download buttons also require the marked points, quality review, and any single-person confirmation; the editor lists every remaining blocker.

Before using a print or file for a passport or visa application, ask the receiving authority about its current submission method. Shared photo dimensions do not guarantee acceptance for every application type. Domestic German passport applications generally require secure digital photo capture; home-printed or self-generated images may not be accepted. German visa submission requirements depend on the consulate and application type. See the [German Federal Ministry of the Interior photo examples](https://www.germany.info/resource/blob/906790/6e3eee9fd4d86e16aaefe0e92d809332/dd-sample-photos-data.pdf) for visual guidance.

For a U.S. passport or visa print application, use photo-quality paper and a recent color photo (within six months) with a neutral expression, frontal full face, plain white/off-white background, even lighting, and no filters or facial retouching. Eyeglasses require documented medical necessity; head coverings require applicable religious or medical exceptions. Infants have allowances for closed eyes and some head tilt; no parent or other person may be in the photo. Review the [U.S. Department of State passport photo guidance](https://travel.state.gov/en/passports/apply/help/photos.html), [visa photo guidance](https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html), and [official passport policy (8 FAM 402.1)](https://fam.state.gov/FAM/08FAM/08FAM040201.html) for up-to-date requirements and exceptions. Online passport renewal and visa uploads have different file rules; the standalone printable JPG is **not** automatically suitable for either online submission.

The on-device face model is Google's MediaPipe BlazeFace short-range float16 model, downloaded from `storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/`. MediaPipe vision WASM assets are copied from the `@mediapipe/tasks-vision` package into `public/wasm`. All of these files are shipped locally so normal use makes no model CDN request.
