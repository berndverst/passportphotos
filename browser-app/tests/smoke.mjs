import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { PDFDocument, PDFName } from 'pdf-lib';
import { verifyMobile } from './mobile.mjs';

const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const mount = '/passport-photo/';
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
};
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    const path = new URL(request.url, 'http://localhost').pathname;
    const relative = decodeURIComponent(path.startsWith(mount) ? path.slice(mount.length) : path.slice(1));
    const file = resolve(dist, relative || 'index.html');
    if (!file.startsWith(resolve(dist) + sep)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      response.writeHead(404).end();
    } else {
      console.error('Static test server failed:', error);
      response.writeHead(500).end();
    }
  }
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ executablePath: edge, headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const violations = [];
  const requests = [];
  const pageErrors = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (!request.url().startsWith(`${origin}${mount}`) || request.method() !== 'GET') {
      violations.push(`${request.method()} ${request.url()}`);
      await route.abort('blockedbyclient');
      return;
    }
    requests.push(request.url());
    await route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${origin}${mount}`);
  assert.match(await page.title(), /Passport photo/);
  assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),
    /connect-src 'self'/);
  await page.locator('#photo').setInputFiles({
    name: 'wrong.png', mimeType: 'image/png', buffer: Buffer.from('not a jpg'),
  });
  await page.getByText('Only JPG/JPEG files are supported.', { exact: false }).waitFor();

  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 2400;
    const context = canvas.getContext('2d');
    context.fillStyle = '#dddddd';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .9).split(',')[1];
  });
  await page.locator('#photo').setInputFiles({
    name: 'test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(data, 'base64'),
  });
  await page.getByText('No face was detected.', { exact: false }).waitFor({ timeout: 60000 });
  const loadedRequests = requests.length;
  await context.setOffline(true);
  assert.equal(await page.getByRole('button', { name: 'Download US Letter print PDF' }).isDisabled(), true);
  await page.locator('#zoom').fill('125');
  for (const angle of ['-180', '-90', '90', '180', '0']) {
    await page.locator('#rotation').fill(angle);
    assert.equal(await page.locator('#rotation').inputValue(), angle);
  }
  await page.getByRole('button', { name: 'Set top of head (crown)' }).click();
  await page.locator('canvas.photo-preview').click({ position: { x: 175, y: 55 } });
  await page.getByRole('button', { name: 'Set chin' }).click();
  await page.locator('canvas.photo-preview').click({ position: { x: 175, y: 395 } });
  await page.getByLabel('I confirm this photo shows exactly one person', { exact: false }).check();
  await page.getByLabel('I visually checked the full unobstructed face', { exact: false }).check();
  assert.equal(await page.getByRole('button', { name: 'Download US Letter print PDF' }).isEnabled(), true,
    await page.locator('.review').innerText());

  async function verifyDownloads(format) {
    for (const { value, name, width, height, copies } of [
      { value: 'letter', name: 'US Letter', width: 612, height: 792, copies: 4 },
      { value: 'photo4x6', name: '4 × 6 in', width: format === 'us' ? 432 : 288, height: format === 'us' ? 288 : 432, copies: 2 },
    ]) {
      await page.locator('#paper').selectOption(value);
      const pdfWait = page.waitForEvent('download');
      await page.getByRole('button', { name: `Download ${name} print PDF` }).click();
      const pdfDownload = await pdfWait;
      const pdf = await PDFDocument.load(await readFile(await pdfDownload.path()));
      assert.equal(pdf.getPageCount(), 1);
      assert.ok(Math.abs(pdf.getPage(0).getWidth() - width) < .001);
      assert.ok(Math.abs(pdf.getPage(0).getHeight() - height) < .001);
      const objects = pdf.context.enumerateIndirectObjects();
      const imageWidths = objects
        .filter(([, object]) => object.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image')
        .map(([, object]) => [object.dict.get(PDFName.of('Width')).asNumber(),
          object.dict.get(PDFName.of('Height')).asNumber()]);
      assert.deepEqual(imageWidths, format === 'us' ? [[624, 624]] : [[437, 555]]);
      const content = objects
        .filter(([, object]) => object.contents &&
          object.dict?.get(PDFName.of('Filter'))?.toString() === '/FlateDecode')
        .map(([, object]) => inflateSync(object.contents).toString('latin1')).join('\n');
      assert.equal((content.match(/\/Image-[^\s/]+\s+Do/g) || []).length, copies,
        `Expected ${copies} photographs on ${format} ${name}`);
    }

    const jpgWait = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download 300 DPI JPG' }).click();
    const jpgDownload = await jpgWait;
    const jpg = await readFile(await jpgDownload.path());
    assert.equal(jpg.subarray(6, 11).toString('ascii'), 'JFIF\0');
    assert.deepEqual(Array.from(jpg.subarray(13, 18)), [1, 1, 44, 1, 44]);
    const bitmap = await page.evaluate(async (bytes) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
      const result = [image.width, image.height];
      image.close();
      return result;
    }, [...jpg]);
    assert.deepEqual(bitmap, format === 'us' ? [600, 600] : [413, 531]);
  }

  await verifyDownloads('de');
  await page.locator('#format').selectOption('us');
  assert.equal(await page.locator('#paper').inputValue(), 'photo4x6');
  assert.equal(await page.getByRole('button', { name: 'Download 4 × 6 in print PDF' }).isDisabled(), true,
    'Switching country requires new measurements and quality review');
  await page.locator('#age').selectOption('infant');
  assert.match(await page.locator('.controls').innerText(), /eyes may be partly or fully closed/);
  await page.locator('#age').selectOption('adult');
  await page.locator('#zoom').fill('35');
  assert.match(await page.locator('.review').innerText(), /trimmed photo extends beyond the source JPG/);
  assert.match(await page.locator('.review').innerText(), /zoom in to use less of the image/);
  assert.match(await page.locator('.next-steps').innerText(), /Fix the crop and measurement warnings above/);
  await page.locator('#zoom').fill('125');
  assert.equal(await page.getByText('The trimmed photo extends beyond the source JPG', { exact: false }).count(), 0);
  await page.getByRole('button', { name: 'Set top of head (crown)' }).click();
  await page.locator('canvas.photo-preview').click({ position: { x: 175, y: 62 } });
  await page.getByRole('button', { name: 'Set chin' }).click();
  await page.locator('canvas.photo-preview').click({ position: { x: 175, y: 272 } });
  await page.getByRole('button', { name: 'Set eye line' }).click();
  await page.locator('canvas.photo-preview').click({ position: { x: 175, y: 130 } });
  await page.getByLabel('I visually checked the full unobstructed face', { exact: false }).count()
    .then((count) => assert.equal(count, 0));
  await page.getByLabel('I checked the photo was taken within six months', { exact: false }).check();
  assert.equal(await page.getByRole('button', { name: 'Download 4 × 6 in print PDF' }).isEnabled(), true,
    await page.locator('.review').innerText());
  await verifyDownloads('us');
  for (const path of ['models/blaze_face_short_range.tflite', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm']) {
    assert.ok(requests.includes(`${origin}${mount}${path}`), `Expected bundled asset: ${path}`);
  }
  assert.equal(requests.length, loadedRequests, 'Editing and exporting must not need further network requests');
  assert.deepEqual(violations, [], 'The editor must not upload, call APIs, or escape its GitHub Pages subpath');
  assert.deepEqual(pageErrors, [], 'The production app must not have unhandled browser errors');

  await context.close();
  const rootContext = await browser.newContext();
  await rootContext.route('**/*', async (route) => {
    const request = route.request();
    if (!request.url().startsWith(`${origin}/`) || request.method() !== 'GET') {
      violations.push(`${request.method()} ${request.url()}`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  const rootPage = await rootContext.newPage();
  rootPage.on('pageerror', (error) => pageErrors.push(error.message));
  await rootPage.goto(`${origin}/`);
  await rootPage.locator('#photo').setInputFiles({
    name: 'root-test.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(data, 'base64'),
  });
  await rootPage.getByText('No face was detected.', { exact: false }).waitFor({ timeout: 60000 });
  assert.deepEqual(violations, [], 'Root hosting must also use only same-site GET requests');
  assert.deepEqual(pageErrors, [], 'Root hosting must not have unhandled browser errors');
  await verifyMobile(browser, `${origin}${mount}`, Buffer.from(data, 'base64'));
  console.log('Static production smoke passed at root and GitHub Pages subpath: local WASM detection, offline German/U.S. PDF and JPG exports, no uploads or external requests.');
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
