# NASM 2.16.03 WebAssembly ビルドメモ

## upstream パッチ

なし。NASM の C ソースは無変更でビルドしている。

## ビルドシステムの調整

`nasm-2.16.03` Git tag には生成済みの `configure` と
`config/config.h.in` が含まれず、ホストにも `automake` / `aclocal` がない。
そこで `build.sh` はソースを一時ディレクトリへコピーし、リポジトリ内の
`autoconf/m4/*.m4` をすべて include する `autoconf/aclocal.m4` を生成する。
続いて `autoheader -B autoconf`、`autoconf -B autoconf` を実行してから
`emconfigure ./configure` を実行する。

configure の結果は手作業で編集・上書きしていない。NASM configure が既定で
追加するデバッグ情報フラグを成果物から除くため、make には `CFLAGS=-O2` を
指定する。Emscripten のランタイム／ファイルシステム設定は、最終 `emcc`
リンク時にのみ指定する。
