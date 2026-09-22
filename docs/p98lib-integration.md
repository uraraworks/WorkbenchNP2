# p98libサンプルのIDE組み込み

[p98lib](https://github.com/uraraworks/p98lib)（PC-98向けのCゲームライブラリ。MIT、
Copyright (c) 2026 URARA-works）のサンプル3本（`hello.c` / `walk.c` / `walk2.c`）を、
`ide/index.html`のサンプル一覧から開いてそのままビルド・実行できるようにした際の、
実装の技術的な経緯をまとめる。

## なぜ既存のビルド経路では足りなかったか

`ide/browser-toolchain.mjs`の`buildSource()`は、これまでCソースを1本受け取り、
small model・単一ファイルという前提で`compileWithFactories()`へそのまま渡すだけだった。
p98libはhuge model固定（`include/p98.h`のコメント参照）で、かつユーザーのコードとは別に
`src/p98.c`・`src/p98_asm.asm`という2つのソースをコンパイル・アセンブルしてリンクへ
足す必要がある。IDEは「1ファイル＝1プログラム」という実験的な公開方針（README参照）を
崩さずに、この複数入力のリンクをユーザーから隠す必要があった。

## 3段のビルド手順

`ide/browser-toolchain.mjs`の`buildWithP98lib()`が、[p98lib/tools/build.mjs](https://github.com/uraraworks/p98lib)
のNode版と同じ3段の手順を、ブラウザ側のwasm factory経由で行う。

1. `vendor/p98lib/src/p98.c`を`compileToObjectWithFactories()`で単独コンパイルし、
   リンクしないELFオブジェクトにする（`model: 'huge'`、`includeFiles`にC標準ヘッダ29本＋
   `p98.h`＋`mag_assets.h`を渡す）。
2. `vendor/p98lib/src/p98_asm.asm`を`assembleWithFactory()`（NASM、`format: 'elf'`）で
   単独アセンブルし、ELFオブジェクトにする。
3. ユーザーの`.c`を`compileWithFactories()`でコンパイルし、1.と2.の出力を
   `extraLinkInputs: [{ name: 'p98lib.o', bytes: ... }, { name: 'p98asm.o', bytes: ... }]`
   としてリンク段へ渡す。`model: 'huge'`、`library`はsmall用の`lcds.a`ではなく
   huge用の`toolchain/smlrc-wasm/lcdh.a`を使う。

1.または2.が失敗した場合、そのエラーは「ユーザーが書いたコードの行番号」ではないため、
`stage`を`'p98lib'`（p98.cのコンパイルエラー）／`'nasm(p98lib)'`（p98_asm.asmの
アセンブルエラー、またはp98.cコンパイル中のNASM段のエラー）に区別して返す。IDE側の
エラー表示はこの`stage`を見て、通常の行番号付き表示とは別に扱う。

## p98lib経路かどうかの判定（ヒューリスティックであることの限界）

IDEはユーザーの`.c`ソースの文字列しか見えないため、`buildSource()`はソースが
`P98LIB_INCLUDE_PATTERN`（`/^\s*#\s*include\s*"p98\.h"/m`、行頭の空白は許容）に
マッチするかどうかだけで、p98lib経路（huge model＋2つの追加リンク入力）へ進むか、
従来のsmall model・単一ファイル経路へ進むかを決める。

この判定には限界がある。見ているのは`#include "p98.h"`という**文字列**であって、
実際のプリプロセッサ的な意味ではない。

- **誤検出（false positive）**: コメント中に同じ文字列を書いても反応する。この場合は
  huge model + 不要なリンク入力でビルドされるだけなので、安全側に倒れる（実害はない）。
- **見逃し（false negative）**: p98libを使いたいのにこの行を書き忘れた（あるいは
  条件付きコンパイルなどでこの行が実際には見えない）場合、small model経路へ落ちて、
  p98lib関数の呼び出しがリンクエラーになる。IDE側はこの状況を「p98lib未使用」としか
  判定できないため、専用のエラーメッセージは出ない。

## ベンダリングと双方向依存の非対称性

p98libのソースは`vendor/p98lib/`へバイト単位でコピー同梱している。WorkbenchNP2は
GitHub Pagesで配信されるため、別リポジトリへの相対パス参照は公開後に404になる
（`toolchain/verify-published-assets.mjs`冒頭のコメントに、Cヘッダ29本で実際に踏んだ
経緯が残っている）。IDEが`fetchBytes('../vendor/p98lib/...')`で実行時fetchする以上、
これらはWorkbenchNP2のgit追跡下に置き、公開される集合に含める必要がある。

依存は双方向だが役割は非対称である。

- **p98lib → WorkbenchNP2**: p98lib側の`tools/build.mjs`は`../WorkbenchNP2`を相対パスで
  そのままimportする。これは「ツールチェーン本家への参照」であり、コピーではない
  （ツールチェーン・wasmをp98lib側へコピーしない方針）。
- **WorkbenchNP2 → p98lib**（`vendor/p98lib/`）: 配信のためのバイト単位コピー。
  ツールチェーンではなく素材の複製。

鮮度は`vendor/p98lib/MANIFEST.json`（コピー元commitのハッシュ＋各ファイルのsha256）で
担保する。詳細は[vendor/p98lib/README.md](../vendor/p98lib/README.md)を参照。

## 検証スクリプト3本の分担

| スクリプト | 見ているもの | 見ていないもの |
|---|---|---|
| `tools/verify-p98lib-vendor.mjs` | `vendor/p98lib/`の各ファイルのsha256が`MANIFEST.json`と一致するか。`../p98lib`が隣にあれば追加で本家とのバイト一致・commit一致も見る | ビルドできるかどうかは一切見ない。純粋に同梱コピーの鮮度だけ |
| `ide/verify-p98lib-build.mjs` | `vendor/p98lib/`のバイトを使い、3サンプルがNode側の`compile-core.mjs`／`assemble.mjs`（Node用wasm factory）でhuge modelビルドできるか | `ide/browser-toolchain.mjs`のブラウザ経路そのもの（fetch先・ブラウザ用wasm factory・IDEのUI結線・`#include "p98.h"`判定の実配線）は検査しない。手順とバイトが同じだけで、実行系がNodeとブラウザで異なる |
| `ide/verify-p98lib-browser.mjs` | 上記`ide/verify-p98lib-build.mjs`が見ていないブラウザ経路そのもの。配信（fetch先が404にならないか）・実際のIDE UIからのビルド・`#include`判定の実配線・故障注入・small経路（p98libを使わない従来のCサンプル）が壊れていないことの非回帰 | （このドキュメント作成時点で作成中のため、詳細は同スクリプトのコメントを参照） |

`ide/verify-p98lib-build.mjs`は「同じ手順・同じバイトをNode側で再現しているだけ」で
あることを冒頭コメントで明言しており、ブラウザ経路の正しさの担保は
`ide/verify-p98lib-browser.mjs`に委ねている。配信パスの404については、より一般的な
`toolchain/verify-published-assets.mjs`が別途担保する。

## p98lib側が更新されたときの追随手順

`vendor/p98lib/README.md`に定義されている手順に従う。

1. `git -C ../p98lib rev-parse HEAD`でp98lib側の最新commitハッシュを確認する。
2. 変更されたファイルを`vendor/p98lib/`へ上書きコピーする。
3. `MANIFEST.json`の`commit`と該当ファイルのsha256を更新する
   （sha256は`shasum -a 256 <file>`で計算できる）。
4. `node tools/verify-p98lib-vendor.mjs`を実行してPASSすることを確認する
   （`../p98lib`が隣のディレクトリにあれば本家との一致まで検査される）。

追随後は`node ide/verify-p98lib-build.mjs`と`node ide/verify-p98lib-browser.mjs`も
実行し、ビルド経路自体が壊れていないことを確認する。
