# SmallerC wasm

Step 4では SmallerC revision `1865d79ce7a5ad3f8a9515a571437cee084b8b1d` の
`smlrpp` と `smlrc` を、upstream Cソース無改変で emscripten ビルドする。
upstream `license.txt` 本文は BSD 2-Clause である。
同梱ucppは `v0100/ucpp/LICENSE` のBSD系3条件なので、`smlrpp` の配布には
`LICENSE.SmallerC` と `LICENSE.ucpp` の両方を添付する。

```bash
toolchain/smlrc-wasm/build.sh
node toolchain/smlrc-wasm/verify.mjs
```

`build.sh` は upstream がなければ `toolchain/smallerc-src/` へ clone し、
固定revisionをcheckoutする。`.git`のない部分コピー、revision不一致、
local変更やuntrackedファイルのあるツリーはビルドしない。
同ディレクトリとホスト版実行物はgit管理しない。
wasm成果物と2つのライセンスファイルは配布物から分離しない。

`toolchain/compile.mjs` は入力バイト列を `smlrpp → smlrc -seg16` に渡して
NASM assemblyを返す。両段とも毎回新規wasmインスタンスを生成する。
`smlrc` は同一インスタンスの2回目で失敗することを検証済み。
`smlrpp` は2回同一出力だが、段ごとのライフサイクルを統一している。

今回はリンクとDOS実行ファイル生成を行わない。small modelの浮動小数点、
標準ライブラリ、`smlrl`、生成assemblyのソース行デバッグ対応は未検証である。
