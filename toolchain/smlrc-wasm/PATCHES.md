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

なし。SmallerC と同梱 ucpp の C ソースは変更せずビルドしている。
`build.sh` は完全なgit cloneだけを受理し、HEADが上記revisionと一致すること、
tracked・staged・untrackedを含めworktreeがcleanであることをビルド前に検証する。

ソースの改行やファイル末尾はcloneしたupstreamのバイト列をそのまま使い、
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
