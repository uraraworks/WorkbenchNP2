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

## ビルド調整

`smlrpp` は出力ファイルを終了前に閉じないため、`EXIT_RUNTIME=0` の wasm では
libc の `fflush` を export し、JS 側が `callMain` 後に `_fflush(0)` を呼ぶ。
これは upstream ソースへのパッチではない。

`smlrc` は2回目の `main` で状態が初期化されず失敗することを実測した。
`smlrpp` は同一インスタンスで2回成功するが、APIは両段とも呼出しごとに
新しい wasm インスタンスを生成し、段ごとの扱いを統一する。
