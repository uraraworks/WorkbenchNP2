# SmallerC wasm

Step 4では SmallerC revision `1865d79ce7a5ad3f8a9515a571437cee084b8b1d` の
`smlrpp`、`smlrc`、`smlrl`を、upstream Cソース無改変で emscripten ビルドする。
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

`toolchain/compile.mjs` は入力バイト列を
`smlrpp → smlrc -seg16 → NASM 2.16.03 -f elf → smlrl -small`へ渡し、
16-bit DOS small-model MZ EXEを返す。`smlrcc`による子プロセス起動は使わない。
入力末尾から連続するDOS EOF `0x1A`は共通入力層で除き、件数を結果へ返す。
途中の`0x1A`は除去せず、そのまま下流ツールへ渡す。
各ビルドは段ごとに新規wasmインスタンスを生成する。
`smlrc` は同一インスタンスの2回目で失敗することを検証済み。
`smlrpp`は再利用可。`smlrl`は同一入力2回だけなら一致するが、異なる2入力を
同じインスタンスで順にリンクすると2回目がfresh instanceの出力と一致しない。
従って`smlrc`と`smlrl`は毎回新規インスタンス必須である。

メモリモデルはsmall、出力はMZ EXEとする。tiny COMはコード・データ・スタックが
同一64KiBに収まり標準ライブラリ利用時の拡張余地が小さい。smallは16bitのまま
コードとデータ/スタックを分離でき、既存4B01hローダもMZ EXEに対応済みである。
huge/DPMI経路は使わない。smallの浮動小数点非対応は固定小数点で回避する。

`build.sh`はSmallerCだけでなくNASMのpin/cleanも先に検証し、NASM 2.16.03の
ホスト版を一時ツリーで生成する。upstream `srclib/lcds.txt`を入力一覧として、
`-doss -c`、`v0100/include`、`v0100/srclib`によりsmall/tiny共用`lcds.a`を再生成する。
upstreamツリー自体は変更しない。`verify.mjs`はsmlrpp/smlrc/smlrlのホスト/wasm一致、
4段の反復一致、リンク出力の故障注入を検査する。

ブラウザ実行は`ide/verify-ide.mjs`の既存FreeDOS/WebNP2経路を流用し、FAT12 FD上の
`HELLOC.EXE`を実行してTVRAMの`Hello from C on PC-98!`を確認する。生成assemblyから
Cソース行へのデバッグマップは今回の範囲外で未検証である。

実在コードでの最初の検証は[1997年研修コードとSmallerC](kensyuu-smallerc.md)を参照する。
