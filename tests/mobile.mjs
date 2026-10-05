import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
];

export async function verifyMobile(browser, url, jpeg) {
  const context = await browser.newContext({
    viewport: viewports[0], isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  try {
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      const local = request.url().startsWith(url) || request.url().startsWith(`blob:${new URL(url).origin}/`);
      if (!local || request.method() !== 'GET') {
        external.push(`${request.method()} ${request.url()}`);
      }
    });
    await page.goto(url);
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    assert.match(viewportMeta, /width=device-width/);
    assert.doesNotMatch(viewportMeta, /user-scalable=no|maximum-scale=1(?:\D|$)/);

    async function verifyLayout() {
      const layout = await page.evaluate(() => {
        const setup = document.querySelector('.controls').getBoundingClientRect();
        const preview = document.querySelector('.preview-panel').getBoundingClientRect();
        const targetSelector = 'button, select, input[type="file"], input[type="range"], label.check';
        return {
          width: window.innerWidth,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          stacked: preview.top >= setup.bottom,
          smallTargets: [...document.querySelectorAll(targetSelector)]
            .filter((element) => element.getBoundingClientRect().height < 44)
            .map((element) => element.id || element.textContent),
          smallInputs: [...document.querySelectorAll('select, input[type="file"]')]
            .filter((element) => parseFloat(getComputedStyle(element).fontSize) < 16)
            .map((element) => element.id),
        };
      });
      assert.equal(layout.width, page.viewportSize().width);
      assert.equal(layout.overflow, false, `Horizontal overflow at ${layout.width}px`);
      assert.equal(layout.stacked, true, `Mobile panels should stack at ${layout.width}px`);
      assert.deepEqual(layout.smallTargets, [], 'Touch targets must be at least 44px high');
      assert.deepEqual(layout.smallInputs, [], 'Inputs should not trigger iOS focus zoom');
    }

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await verifyLayout();
    }
    await page.setViewportSize(viewports[0]);
    await page.locator('#photo').setInputFiles({
      name: 'mobile.jpg', mimeType: 'image/jpeg', buffer: jpeg,
    });
    await page.getByText('No face was detected.', { exact: false }).waitFor({ timeout: 60000 });
    const canvas = page.locator('canvas.photo-preview');

    async function tapMarker(name, x, y) {
      await page.getByRole('button', { name }).tap();
      await canvas.scrollIntoViewIfNeeded();
      const point = await canvas.evaluate((element, point) => {
        const bounds = element.getBoundingClientRect();
        return {
          x: bounds.left + element.clientLeft + point.x * element.clientWidth / element.width,
          y: bounds.top + element.clientTop + point.y * element.clientHeight / element.height,
        };
      }, { x, y });
      await page.touchscreen.tap(point.x, point.y);
    }

    for (const format of ['de', 'us']) {
      if (format === 'us') await page.locator('#format').selectOption('us');
      await page.locator('#zoom').fill('125');
      await tapMarker('Set top of head (crown)', format === 'de' ? 175 : 254, format === 'de' ? 55 : 90);
      await tapMarker('Set chin', format === 'de' ? 175 : 254, format === 'de' ? 395 : 390);
      if (format === 'us') await tapMarker('Set eye line', 254, 190.5);
      const measurement = await page.locator('.measurement strong').innerText();
      assert.ok(Math.abs(parseFloat(measurement) - (format === 'de' ? 34 : 30)) <= .2,
        `Touch markers should map to the scaled canvas: ${measurement}`);
      await page.getByLabel('I confirm this photo shows exactly one person', { exact: false }).check();
      await page.getByLabel(format === 'de' ? 'I visually checked' : 'I checked the photo was taken', { exact: false }).check();

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await verifyLayout();
        const size = await canvas.boundingBox();
        assert.ok(size.height <= viewport.height * .61, 'Photo should leave room for navigation in landscape');
        assert.equal(await page.locator('.measurement strong').innerText(), measurement,
          'Rotating the device must not change crop measurements');
      }
      await page.setViewportSize(viewports[0]);
      for (const { paper, name, width, height } of [
        { paper: 'letter', name: 'Download US Letter print PDF', width: 612, height: 792 },
        { paper: 'a4', name: 'Download DIN A4 print PDF', width: 210 * 72 / 25.4, height: 297 * 72 / 25.4 },
        { paper: 'photo10x15', name: 'Download 10 × 15 cm print PDF', width: (format === 'us' ? 150 : 100) * 72 / 25.4, height: (format === 'us' ? 100 : 150) * 72 / 25.4 },
        { paper: 'photo4x6', name: 'Download 4 × 6 in print PDF', width: format === 'us' ? 432 : 288, height: format === 'us' ? 288 : 432 },
        { paper: null, name: 'Download 300 DPI JPG' },
      ]) {
        if (paper) await page.locator('#paper').selectOption(paper);
        await verifyLayout();
        const button = page.getByRole('button', { name });
        assert.equal(await button.isEnabled(), true, await page.locator('.review').innerText());
        const waiting = page.waitForEvent('download');
        await button.tap();
        const download = await waiting;
        assert.equal(await download.failure(), null);
        const bytes = await readFile(await download.path());
        if (name.endsWith('PDF')) {
          const pdf = await PDFDocument.load(bytes);
          assert.equal(pdf.getPageCount(), 1);
          assert.ok(Math.abs(pdf.getPage(0).getWidth() - width) < .001);
          assert.ok(Math.abs(pdf.getPage(0).getHeight() - height) < .001);
        } else {
          assert.equal(bytes.subarray(6, 11).toString('ascii'), 'JFIF\0');
          assert.deepEqual([...bytes.subarray(13, 18)], [1, 1, 44, 1, 44]);
        }
      }
    }

    await page.getByRole('button', { name: 'Set chin' }).tap();
    await page.getByRole('button', { name: 'Pan photo' }).tap();
    assert.equal(await page.getByRole('button', { name: 'Pan photo' }).getAttribute('aria-pressed'), 'true');
    await canvas.scrollIntoViewIfNeeded();
    await canvas.evaluate((element) => element.addEventListener('pointerdown', (event) => {
      element.dataset[event.isPrimary ? 'primaryPointer' : 'secondaryPointer'] = String(event.pointerId);
    }));
    const bounds = await canvas.boundingBox();
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 };
    const client = await context.newCDPSession(page);
    const snapshot = () => canvas.evaluate((element) => element.toDataURL());
    const before = await snapshot();
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    const moved = { ...start, x: start.x + 10, y: start.y + 10 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved] });
    await page.waitForFunction((before) => document.querySelector('canvas.photo-preview').toDataURL() !== before, before);
    const after = await snapshot();
    assert.ok(after !== before, 'A one-finger drag should move the crop');
    const secondary = { ...start, id: 2, x: start.x + 40 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moved, secondary] });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [moved, { ...secondary, y: secondary.y + 20 }],
    });
    assert.ok(await snapshot() === after, 'A second finger must not take over the drag');
    await canvas.dispatchEvent('pointerup', {
      pointerId: Number(await canvas.getAttribute('data-secondary-pointer')), isPrimary: false, pointerType: 'touch',
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ ...moved, x: moved.x + 10 }, secondary],
    });
    await page.waitForFunction((before) => document.querySelector('canvas.photo-preview').toDataURL() !== before, after);
    assert.ok(await snapshot() !== after, 'A secondary pointerup must not stop the primary drag');
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const cancelled = await snapshot();
    const pointerId = Number(await canvas.getAttribute('data-primary-pointer'));
    await canvas.dispatchEvent('pointermove', {
      pointerId, isPrimary: true, pointerType: 'touch', clientX: start.x + 70, clientY: start.y + 70,
    });
    assert.ok(await snapshot() === cancelled, 'Cancelled drags must stop moving the crop');
    const scroll = await page.evaluate(() => window.scrollY);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 5, y: 480, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 5, y: 280, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction((before) => window.scrollY > before + 30, scroll);

    const slider = page.locator('#zoom');
    await slider.scrollIntoViewIfNeeded();
    const track = await slider.boundingBox();
    await page.touchscreen.tap(track.x + track.width * .8, track.y + track.height / 2);
    assert.notEqual(await slider.inputValue(), '125', 'Zoom must respond to touch');
    await slider.fill('125');
    await page.getByRole('button', { name: 'Set top of head (crown)' }).tap();
    await canvas.focus();
    await canvas.press('ArrowDown');
    await canvas.press('Enter');
    assert.match(await page.getByRole('button', { name: 'Set top of head (crown)' }).innerText(), /✓/);
    assert.deepEqual(errors, [], 'Mobile editing must not have unhandled browser errors');
    assert.deepEqual(external, [], 'Mobile editing must keep photos and processing local');
  } finally {
    await context.close();
  }
}
