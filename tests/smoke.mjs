import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { PDFDocument, PDFName } from 'pdf-lib';
import { createServer } from 'vite';
import { verifyMobile } from './mobile.mjs';

const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({ executablePath: edge, headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  const external = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(`http://127.0.0.1:${port}/`) &&
        !request.url().startsWith(`blob:http://127.0.0.1:${port}/`)) external.push(request.url());
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  assert.match(await page.title(), /Passport photo/);
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
  assert.deepEqual(external, [], 'The editor should only request local resources');
  await verifyMobile(browser, `http://127.0.0.1:${port}/`, Buffer.from(data, 'base64'));
  console.log('Browser smoke passed: German and U.S. framing, four Letter/two 4x6 photos, JPEG dimensions and DPI.');
} finally {
  await browser?.close();
  await server.close();
}
