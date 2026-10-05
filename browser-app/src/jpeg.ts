export function withJpegDpi(bytes: Uint8Array, dpi = 300): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || dpi < 1 || dpi > 65535) {
    throw new Error('Invalid JPEG or DPI.');
  }
  const patch = (result: Uint8Array, offset: number) => {
    result[offset] = 1; // JFIF density units: dots per inch.
    result[offset + 1] = dpi >> 8;
    result[offset + 2] = dpi & 255;
    result[offset + 3] = dpi >> 8;
    result[offset + 4] = dpi & 255;
  };
  let pos = 2;
  while (pos + 4 <= bytes.length && bytes[pos] === 0xff) {
    const marker = bytes[pos + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (length < 2 || pos + 2 + length > bytes.length) {
      throw new Error('Malformed JPEG segment.');
    }
    if (marker === 0xe0 && length >= 16 &&
        String.fromCharCode(...bytes.subarray(pos + 4, pos + 9)) === 'JFIF\0') {
      const result = bytes.slice();
      patch(result, pos + 11);
      return result;
    }
    pos += length + 2;
  }
  const app0 = new Uint8Array([
    0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2,
    1, dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0, 0,
  ]);
  const result = new Uint8Array(bytes.length + app0.length);
  result.set(bytes.subarray(0, 2));
  result.set(app0, 2);
  result.set(bytes.subarray(2), 2 + app0.length);
  return result;
}
