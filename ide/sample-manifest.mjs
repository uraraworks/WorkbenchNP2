export const SAMPLE_FILES = [
  { path: 'samples/hello.asm', url: '../samples/hello.asm' },
  { path: 'samples/hello-c.c', url: '../samples/hello-c.c' },
];

export async function loadSample(sample) {
  const response = await fetch(sample.url);
  if (!response.ok) throw new Error(`${sample.path}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
