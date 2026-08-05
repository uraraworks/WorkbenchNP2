const GVRAM_REGIONS = [
  0x0a8000, 0x0b0000, 0x0b8000, 0x0e0000,
  0x1a8000, 0x1b0000, 0x1b8000, 0x1e0000,
];

const hexDigest = async (bytes) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  (byte) => byte.toString(16).padStart(2, '0'),
).join('');

/** E-3と変換版起動検証で共有するTVRAM/GVRAM/canvas採取器。 */
export function createSakaVisualSnapshot(engine, debug, canvas) {
  async function gvramState() {
    const combined = new Uint8Array(GVRAM_REGIONS.length * 0x8000);
    const regions = [];
    let nonzero = 0;
    for (let index = 0; index < GVRAM_REGIONS.length; index++) {
      const address = GVRAM_REGIONS[index];
      const bytes = debug.readMemory(address, 0x8000);
      combined.set(bytes, index * 0x8000);
      const regionNonzero = bytes.reduce((count, byte) => count + (byte !== 0 ? 1 : 0), 0);
      nonzero += regionNonzero;
      regions.push({ address, nonzero: regionNonzero, sha256: await hexDigest(bytes) });
    }
    return { sha256: await hexDigest(combined), nonzero, regions };
  }

  async function canvasState() {
    await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    let pixels;
    if (gl) {
      pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } else {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas pixel readout is unavailable');
      pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    let colored = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset] !== 0 || pixels[offset + 1] !== 0 || pixels[offset + 2] !== 0) colored++;
    }
    return { sha256: await hexDigest(pixels), colored, width: canvas.width, height: canvas.height };
  }

  return async () => ({
    screen: engine.getScreenText().text,
    gvram: await gvramState(),
    canvas: await canvasState(),
  });
}
