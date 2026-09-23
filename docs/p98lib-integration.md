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
| `ide/verify-p98lib-browser.mjs` | 上記`ide/verify-p98lib-build.mjs`が見ていないブラウザ経路そのもの。配信（fetch先が404にならないか）・実際のIDE UIからのビルド・`#include`判定の実配線・故障注入・small経路（p98libを使わない従来のCサンプル）が壊れていないことの非回帰 | 生成したMZ EXEが実機/WebNP2上で実際に正しく動作するか（画面描画・VSYNC等）は一切見ていない。ビルドがokでMZヘッダで始まることだけを見ている |
| `ide/verify-p98lib-repeat-run.mjs` | 実IDE（`ide/index.html`）を起動し、`p98lib/hello.c`を**同一DOSセッション内で2回連続実行**して、両方の実行でcanvas上に色5の矩形（200×80=16000px）が実際に出るかどうか。下記「パレット退避廃止と『検査の穴』」節参照 | ビルドが通るかどうかは見ていない（`ide/verify-p98lib-browser.mjs`の担当）。3回目以降の実行や、hello.c以外のサンプルでの再発は見ていない |

`ide/verify-p98lib-build.mjs`は「同じ手順・同じバイトをNode側で再現しているだけ」で
あることを冒頭コメントで明言しており、ブラウザ経路の正しさの担保は
`ide/verify-p98lib-browser.mjs`に委ねている。配信パスの404については、より一般的な
`toolchain/verify-published-assets.mjs`が別途担保する。
実際にプログラムを走らせて画面を見る担保は`ide/verify-p98lib-repeat-run.mjs`が持つ。

## パレット退避廃止と「検査の穴」（2026-09-23）

p98libの`p98_init()`/`p98_quit()`は、かつて画面用パレット16色をポート
（0xA8で番号を選び、0xA8/0xAA/0xAC/0xAEで読み書き）から読み出して退避し、
終了時に書き戻す実装だった。ところが実測の結果、**NP2kai上ではこの読み出しが
選んだ番号を無視して常に同じ値を返す**ことが分かった（p98lib側
`docs/design.md`「パレット」節・`docs/verify-log.md`参照）。この読み出しが
壊れているため、退避した16色が実質1色に潰れ、`p98_quit()`での書き戻しで
**画面のパレット全16色が同じ値に潰れ、以後何を描いても一色にしか見えなくなる**
不具合があった。p98lib側コミット`7006316`で、読み出しに一切頼らず、実測で
確認した既定パレット値をp98_init()/p98_quit()の両方で明示的に書き込む方式へ
変更し修正済み（vendor取り込みはこのリポジトリの`vendor/p98lib/`更新履歴参照）。

### なぜp98lib単体の検証では見つからなかったか

p98lib側の検証（`tools/verify.mjs`）やサンプル（`samples/`）は、基本的に
「1プログラムを1回起動して結果を見る」形をしていた。この不具合は
**同じセッション内でp98libのプログラムを2回連続で実行して初めて**症状が出る
（1回目の`p98_quit()`で既にパレットが壊れた値へ潰れてしまうため、2回目の
実行では何を描いても色が正しく出ない）。1回しか起動しない検証・サンプルの
構成では、この種の不具合は原理的に見逃す。

**この不具合がIDE（WorkbenchNP2）で初めて露見したのは偶然ではない。**
IDEは「ビルド→実行→編集→再実行」を1つのFreeDOSセッションの中で繰り返す
使い方をする。つまり「同じセッションで同じ・別のプログラムを何度も実行する」
がIDEの通常の使い方そのものであり、p98lib側の「1プログラム=1回起動」しか
見ていない検証・サンプルの構成では、IDEでの使われ方に固有の不具合を
そもそも捕まえられない。**IDE側（このリポジトリ）に、IDEの使い方に即した
「同一セッション内で2回連続実行する」検査を持つ必要がある。**

### 追加した回帰検査: `ide/verify-p98lib-repeat-run.mjs`

上記の穴を埋めるため、実IDEを起動し、`p98lib/hello.c`
（`p98_fill_rect(100, 50, 200, 80, 5)`で色5の200×80=16000pxの矩形を描く）を
同一DOSセッション内で2回連続実行し、**1回目・2回目の両方で**矩形が実際に
canvas上に出ることを検査する。

- **VRAMではなくcanvasのピクセルを見る**: パレット破壊はVRAMの中身
  （どのパレット番号で塗ったか）には一切現れず、「その番号が画面上で
  どんな色として表示されるか」（DAC側の状態）にしか現れない。VRAMバイトを
  見る検査ではこの不具合は原理的に検出できない。
- **WebGLのフレーム外読み出し対策**: canvasはWebGL（SDL2/emscripten）で
  描画されており、`preserveDrawingBuffer`が無いためフレーム外で読むと
  空になりうる。そこで`requestAnimationFrame`のコールバック内で
  2Dオフスクリーンcanvasへ`drawImage()`してから`getImageData()`する。
- **陽性対照**: 1回目の実行で矩形（16000px、色`#007573`）が検出できることを
  先にassertする。1回目すら検出できない計器で2回目を測っても無意味なため。
- **故障注入**: 修正前の実装（ポートから読み出して退避する版）を
  `p98lib/tests/p98_broken_palette_readback.c`から直接読み込み（`../p98lib`が
  隣にある前提。vendor経由ではなく本家を直接使う）、puppeteerの
  リクエストインターセプトで`vendor/p98lib/src/p98.c`の代わりにこれを
  返すページを別途用意して同じ手順を踏む。実測では、壊れた実装でも
  **1回目は矩形が正しく出る**（1回目の`p98_quit()`で初めてパレットが
  潰れるため）が、**2回目は最後まで矩形が出ない**（画面全体が単色
  `#625441`のまま）。この検査はその通りの結果になることを確認しており、
  もし故障注入版で2回目も検出されてしまった場合はこの検査自体が
  不具合を捉えられていないことを意味するため、その場合はFAILする
  （SKIPにはしない）。

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
