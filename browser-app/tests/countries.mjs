import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName } from 'pdf-lib';

export async function verifyCountryPresets(page) {
  assert.deepEqual(await page.locator('#format option').evaluateAll((options) => options.map(({ value }) => value)),
    ['at', 'be', 'cn', 'hr', 'dk', 'fr', 'de', 'gr', 'ie', 'lv', 'nl', 'us']);
  for (const code of ['at', 'be', 'cn', 'hr', 'dk', 'fr', 'de', 'gr', 'ie', 'lv', 'nl']) {
    await page.locator('#format').selectOption(code);
    assert.equal(await page.locator('#format').inputValue(), code);
    assert.equal(await page.getByRole('button', { name: /Download .* print PDF/ }).isDisabled(), true,
      'Every country change must invalidate the previous review and markers');
    assert.ok(await page.locator('.controls a[href^="https://"]').count() > 0);
  }
  await page.locator('#format').selectOption('fr');
  assert.equal(await page.locator('#document option[value="visa"]').isDisabled(), true);
  assert.match(await page.locator('.controls').innerText(), /White backgrounds are forbidden/);
  await page.locator('#format').selectOption('hr');
  assert.equal(await page.locator('#document').inputValue(), 'visa');
  assert.equal(await page.locator('#document option[value="passport"]').isDisabled(), true);

  async function marker(name, x, y) {
    await page.getByRole('button', { name: `Set ${name}` }).click();
    const canvas = page.locator('canvas.photo-preview');
    const position = await canvas.evaluate((element, point) => ({
      x: element.clientLeft + point.x * element.clientWidth / element.width,
      y: element.clientTop + point.y * element.clientHeight / element.height,
    }), { x, y });
    await canvas.click({ position });
  }
  async function review() {
    await page.getByLabel('I confirm this photo shows exactly one person', { exact: false }).check();
    await page.getByLabel('I visually checked the full unobstructed face', { exact: false }).check();
  }
  async function mobileLayout() {
    const original = page.viewportSize();
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, 'New country profiles must not cause horizontal overflow');
      const canvas = await page.locator('canvas.photo-preview').boundingBox();
      assert.ok(canvas.height <= viewport.height * .61, 'New preview proportions must fit mobile navigation');
    }
    await page.setViewportSize(original);
  }
  async function exportCheck(code, document, width, height, dpi, copies) {
    await page.locator('#paper').selectOption('photo10x15');
    const pdfButton = page.getByRole('button', { name: 'Download 10 × 15 cm print PDF' });
    assert.equal(await pdfButton.isEnabled(), true, await page.locator('.review').innerText());
    let waiting = page.waitForEvent('download');
    await pdfButton.click();
    const download = await waiting;
    assert.equal(download.suggestedFilename(), `${code}-${document}-photo-${width}x${height}mm-10x15cm.pdf`);
    const pdf = await PDFDocument.load(await readFile(await download.path()));
    assert.ok(Math.abs(pdf.getPage(0).getWidth() - 100 * 72 / 25.4) < .001);
    assert.ok(Math.abs(pdf.getPage(0).getHeight() - 150 * 72 / 25.4) < .001);
    const objects = pdf.context.enumerateIndirectObjects();
    const imageSizes = objects
      .filter(([, object]) => object.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image')
      .map(([, object]) => [object.dict.get(PDFName.of('Width')).asNumber(), object.dict.get(PDFName.of('Height')).asNumber()]);
    assert.deepEqual(imageSizes, [[Math.round((width + 2) * dpi / 25.4), Math.round((height + 2) * dpi / 25.4)]]);
    const content = objects.filter(([, object]) => object.contents &&
      object.dict?.get(PDFName.of('Filter'))?.toString() === '/FlateDecode')
      .map(([, object]) => inflateSync(object.contents).toString('latin1')).join('\n');
    assert.equal((content.match(/\/Image-[^\s/]+\s+Do/g) || []).length, copies);
    const text = [...content.matchAll(/<([0-9a-f]+)>\s*Tj/gi)]
      .map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1')).join('\n');
    assert.ok(text.includes(`${width} x ${height} mm`), text);
    assert.ok(text.includes(document.toUpperCase()), text);
    assert.ok(text.includes('50 mm'), text);
    waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download ${dpi} DPI JPG` }).click();
    const jpgDownload = await waiting;
    assert.equal(jpgDownload.suggestedFilename(), `${code}-${document}-photo-${width}x${height}mm.jpg`);
    const jpg = await readFile(await jpgDownload.path());
    assert.equal(jpg[13], 1);
    assert.equal(jpg.readUInt16BE(14), dpi);
    assert.equal(jpg.readUInt16BE(16), dpi);
    const dimensions = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
      const result = [bitmap.width, bitmap.height];
      bitmap.close();
      return result;
    }, [...jpg]);
    assert.deepEqual(dimensions, [Math.round(width * dpi / 25.4), Math.round(height * dpi / 25.4)]);
  }

  await page.locator('#format').selectOption('nl');
  await page.locator('#age').selectOption('child');
  assert.match(await page.locator('.controls').innerText(), /19–30 mm/);
  await page.locator('#age').selectOption('adult');
  await page.locator('#zoom').fill('125');
  await marker('top of head (crown)', 175, 85);
  await marker('chin', 175, 365);
  await review();
  assert.match(await page.locator('.next-steps').innerText(), /horizontal measurement/);
  await marker('left measurement point', 85, 225);
  await marker('right measurement point', 295, 225);
  assert.match(await page.locator('.review').innerText(), /Marked width/);
  await marker('right measurement point', 265, 225);
  await exportCheck('nl', 'passport', 35, 45, 400, 2);

  await page.locator('#format').selectOption('cn');
  await page.locator('#zoom').fill('125');
  await marker('top of head (crown)', 165, 20);
  await marker('chin', 165, 325);
  await marker('left measurement point', 72.5, 180);
  await marker('right measurement point', 257.5, 180);
  await review();
  assert.match(await page.locator('.review').innerText(), /Top margin/);
  await marker('top of head (crown)', 165, 40);
  await marker('chin', 165, 345);
  await mobileLayout();
  await exportCheck('cn', 'passport', 33, 48, 300, 2);
  await page.locator('#document').selectOption('visa');
  assert.equal(await page.getByRole('button', { name: 'Download 10 × 15 cm print PDF' }).isDisabled(), true);
  assert.equal(await page.getByText('Top-of-head to top edge:', { exact: false }).count(), 1);
  await page.locator('#zoom').fill('125');
  await marker('top of head (crown)', 165, 40);
  await marker('chin', 165, 345);
  await marker('left measurement point', 72.5, 240);
  await marker('right measurement point', 257.5, 240);
  await review();
  await exportCheck('cn', 'visa', 33, 48, 300, 2);

  await page.locator('#format').selectOption('gr');
  assert.equal(await page.locator('#document').inputValue(), 'passport');
  assert.match(await page.getByRole('region', { name: 'Submission policy' }).innerText(), /myPhoto/);
  const large = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4000;
    canvas.height = 6000;
    const context = canvas.getContext('2d');
    context.fillStyle = '#dddddd';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .9).split(',')[1];
  });
  await page.locator('#photo').setInputFiles({ name: 'large.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(large, 'base64') });
  await page.getByText('No face was detected.', { exact: false }).waitFor({ timeout: 60000 });
  await page.locator('#zoom').fill('125');
  await marker('top of forehead', 200, 120);
  await marker('chin', 200, 450);
  await review();
  await mobileLayout();
  await exportCheck('gr', 'passport', 40, 60, 1200, 1);
}
