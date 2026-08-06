export const SAMPLE_FILES = [
  { path: 'samples/hello.asm', url: '../samples/hello.asm' },
  { path: 'samples/second-run.asm', url: '../samples/second-run.asm' },
  { path: 'samples/hello-c.c', url: '../samples/hello-c.c' },
  { path: 'samples/minimal.c', url: '../samples/minimal.c' },
  { path: 'samples/legacy/kensyuu/STRLEN.C', url: '../samples/legacy/kensyuu/STRLEN.C' },
];

export async function loadSample(sample) {
  const response = await fetch(sample.url);
  if (!response.ok) throw new Error(`${sample.path}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('shift_jis').decode(bytes); }
}
