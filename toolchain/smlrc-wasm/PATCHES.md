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

SmallerC は1件、NASMは0件。

- `patches/0001-pc98dev-c-line-comments.patch`
  - `v0100/smlrc.c`の`GetToken()`で行・ファイルを保存し、`ParseStatement()`から
    `; @pc98dev-c-line`コメントとして出力する処理を追加する。
  - 各文の開始で行をpublishし、文の終了では行0を出して対応範囲を閉じる。
    prologue/epilogueや制御文後の補助ジャンプを直前のC行へ誤帰属させないためである。
  - NASMの`%line`は生成バイトを変えない一方、listingの物理ASM行と構造化エラー行を
    変更することを実測したため使わない。通常コメントは両方を維持する。

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
