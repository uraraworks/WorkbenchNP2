# SmallerC WebAssembly ビルドメモ

## upstream

- リポジトリ: `alexfru/SmallerC`
- revision: `1865d79ce7a5ad3f8a9515a571437cee084b8b1d`
- ライセンス一次情報: upstream の `license.txt`

`license.txt` 本文は、ソース再配布とバイナリ再配布の2条件、および無保証・
責任制限からなる BSD 2-Clause License である。
ただし `smlrpp` の同梱 ucpp は `v0100/ucpp/LICENSE` が一次情報であり、
上記2条件に非推奨条項を加えたBSD系3条件である。両ライセンスを成果物に置く。

## upstream パッチ

SmallerC は2件、NASMは0件。

- `patches/0001-pc98dev-c-line-comments.patch`
  - `v0100/smlrc.c`の`GetToken()`で行・ファイルを保存し、`ParseStatement()`から
    `; @pc98dev-c-line`コメントとして出力する処理を追加する。
  - 各文の開始で行をpublishし、文の終了では行0を出して対応範囲を閉じる。
    prologue/epilogueや制御文後の補助ジャンプを直前のC行へ誤帰属させないためである。
  - NASMの`%line`は生成バイトを変えない一方、listingの物理ASM行と構造化エラー行を
    変更することを実測したため使わない。通常コメントは両方を維持する。

- `patches/0002-raise-ident-and-syntax-table-limits.patch`
  - `v0100/smlrc.c`の`MAX_IDENT_TABLE_LEN`（識別子名の内部テーブル総バイト数）と
    `SYNTAX_STACK_MAX`（型・宣言のシンボルスタック段数）を、upstreamデフォルトの
    5632バイト／3072段から16384バイト／6144段へ引き上げる。
  - 背景（`FMSound/docs/pmd-driver-port-feasibility.md`参照）: 98fmplayerの
    PMDドライバ再実装`fmdriver_pmd.c`（6114行）を`-huge`で単体コンパイルすると、
    upstreamデフォルトでは`Identifier table exhausted`（識別子テーブル枯渇）で
    停止する。ヘッダのみでは枯渇せず本体が原因であることは切り分け済み。
  - 値は闇雲に大きくせず、ホスト版`smlrc`を`-DMAX_IDENT_TABLE_LEN=N`
    `-DSYNTAX_STACK_MAX=N`で再ビルドしながら同じ`fmdriver_pmd.c`を二分探索して
    決めた。識別子テーブルは11648（失敗）〜11776（成功）が境界、シンボルスタックは
    （識別子テーブルを先に十分な値にした状態で）4896（失敗）〜4912（成功）が境界。
    採用値はそれぞれ実測下限の約1.4倍・約1.25倍（識別子テーブルはupstream比約2.9倍、
    シンボルスタックは同2倍）。
  - `MAX_GLOBALS_TABLE_LEN`（`cgx86.c:43`、`MAX_IDENT_TABLE_LEN`と同値で定義）も
    連動して同じ値まで上がる。追加のパッチは不要（同じマクロを再利用しているため）。
  - メモリ増分: `IdentTable[]`と`GlobalsTable[]`（各char[]、+10752バイト）、
    `SyntaxStack0[]`（unsigned char[]、+3072バイト）、`SyntaxStack1[]`（int[]、
    +12288バイト）の合計で約26KB。wasm版はヒープ自動拡張が有効なため無視できる
    増分。ホスト版（DOSツールとしては使わない開発用バイナリ）でも同様に無視できる。
  - この2定数を引き上げても、6114行の`fmdriver_pmd.c`が`-huge`で最後まで
    コンパイルできることをホスト版`smlrc`とwasm版`smlrc.js`の両方で確認済み
    （詳細は`FMSound/docs/pmd-driver-port-feasibility.md`）。ただし実測したのは
    「単体コンパイルが通り、コード/データサイズが実測できる」ことまでで、
    リンク・実機動作は本パッチの検証対象外。

`build.sh` は完全なgit cloneだけを受理し、HEADが上記revisionと一致すること、
tracked・staged・untrackedを含めworktreeがcleanであることをパッチ適用前に検証する。
検証済みupstreamを一時ツリーへコピーした後、`git apply --check`を通して上記1件を適用し、
ホスト版とwasm版の両方を同じパッチ適用済みソースからビルドする。

パッチ以外では、ソースの改行やファイル末尾はcloneしたupstreamのバイト列をそのまま使い、
正規化も空行追加も行わない。以前のGitHub読取APIによる24ファイル部分コピーは、
取得時に改行を正規化して末尾空行差分を作っていたため削除した。
検証器へ期待revisionを全ゼロで渡す破壊テストが、revision mismatchの終了1に
なることも確認している。

## ビルド調整

`smlrpp` は出力ファイルを終了前に閉じないため、`EXIT_RUNTIME=0` の wasm では
libc の `fflush` を export し、JS 側が `callMain` 後に `_fflush(0)` を呼ぶ。
これは upstream ソースへのパッチではない。

`smlrc` は2回目の `main` で状態が初期化されず失敗することを実測した。
`smlrpp` は同一インスタンスで2回成功するが、APIは両段とも呼出しごとに
新しい wasm インスタンスを生成し、段ごとの扱いを統一する。

`smlrl`は同一入力2回だけなら一致するが、異なる2オブジェクトを同一インスタンスで
順にリンクすると2回目がfresh instance出力と一致しない。従って毎回新規生成が必須である。

DOS標準ライブラリはupstream `v0100/srclib/lcds.txt`から再生成する。ビルド時に
pin済みNASM 2.16.03のホスト版も一時ツリーで作り、ホストに別版NASMがあっても使わない。

## csrc/ (ブラウザ実行時にfetchするヘッダの同梱コピー)

`ide/browser-toolchain.mjs`はCのビルド時に29本のヘッダ(`include/`20本 + `srclib/`9本)を
実行時fetchする。fetch元は`toolchain/smallerc-src/`ではなく`toolchain/smlrc-wasm/csrc/`にした。
`smallerc-src/`は`.gitignore`対象(`build.sh`がcloneする十数MBのupstreamツリー)なので、
そこを直接指すとリポジトリに実体が無いまま参照する形になり、GitHub Pages配信では
静的ファイルが存在せずHTTP 404になる(ローカル検証はディスクから配信するため気づけなかった)。

`csrc/`はupstream `v0100/{include,srclib}/`から該当29ファイルをバイト単位でそのまま
コピーしたものをgit追跡する。再生成手順:

```bash
cd toolchain/smlrc-wasm
INCLUDE='assert.h ctype.h errno.h fcntl.h float.h inttypes.h iso646.h limits.h locale.h math.h setjmp.h signal.h stdarg.h stddef.h stdint.h stdio.h stdlib.h string.h time.h unistd.h'
SRCLIB='dimports.h ictype.h idos.h idpmi.h ifp.h istdio.h itime.h iwin32.h mm.h'
for f in $INCLUDE; do cp "../smallerc-src/v0100/include/$f" "csrc/include/$f"; done
for f in $SRCLIB;  do cp "../smallerc-src/v0100/srclib/$f"  "csrc/srclib/$f";  done
```

コピーが再生成後にupstreamからずれていないかは`node verify-csrc-bundle.mjs`で検査する
(upstreamツリーがローカルに無い環境ではINFOでスキップする。CIやcloneしただけの環境が
これに該当し、byte比較は「upstreamをcloneして再ビルドする開発者」向けのセーフティネット
という位置付けである)。29本という本数自体は`ide/verify-workbench.mjs`側が
`browser-toolchain.mjs`の`HEADER_NAMES`/`INCLUDE_HEADERS`と突き合わせて検査する。
