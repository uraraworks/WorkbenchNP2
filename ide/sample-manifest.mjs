export const SAMPLE_FILES = [
  { path: 'samples/hello.asm', url: '../samples/hello.asm' },
  { path: 'samples/hello-c.c', url: '../samples/hello-c.c' },
  // p98lib(別リポジトリ。vendor/p98lib/README.md参照)のサンプル3本。ビルド経路は
  // ide/browser-toolchain.mjs の buildWithP98lib()が #include "p98.h" の有無で
  // 自動選択する。walk2.c は samples/mag_assets.h に暗黙で依存するが(ビルド時に
  // includeFilesへ自動で足される)、一覧には出さない — 一覧に出すとhello.c/walk.c/
  // walk2.cのような「単独で開いてビルドできるプログラム」の並びに紛れて見えてしまうため。
  { path: 'p98lib/hello.c', url: '../vendor/p98lib/samples/hello.c' },
  { path: 'p98lib/walk.c', url: '../vendor/p98lib/samples/walk.c' },
  { path: 'p98lib/walk2.c', url: '../vendor/p98lib/samples/walk2.c' },
];

export async function loadSample(sample) {
  const response = await fetch(sample.url);
  if (!response.ok) throw new Error(`${sample.path}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
