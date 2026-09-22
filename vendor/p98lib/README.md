# vendor/p98lib について

ここは別リポジトリ [p98lib](https://github.com/uraraworks/p98lib) のソースの
バイト単位コピーです。本家はあくまで p98lib 側であり、ここは配信のための複製に
すぎません。

## なぜコピーしているのか

WorkbenchNP2（本リポジトリ）は GitHub Pages で配信される。GitHub Pages は
リポジトリ単位で公開されるため、別リポジトリへの相対パス参照
（例: `../../p98lib/...`）は開発機のチェックアウト上でしか解決できず、
公開後は 404 になる。これは実際に踏んだ前例があり、
`toolchain/verify-published-assets.mjs` の冒頭コメントに経緯が残っている
（C ヘッダ29本が404でCビルドが丸ごと動かなかった等）。IDE が p98lib のヘッダ・
ソース・サンプルを実行時 fetch する以上、それらは WorkbenchNP2 の git 追跡下に
コピーを置き、公開される集合に含めておく必要がある。

## 依存は双方向、ただし非対称

- **p98lib → WorkbenchNP2**: p98lib 側の `tools/build.mjs` は逆に
  `../WorkbenchNP2` を相対パスでそのまま import する（ツールチェーン本体・wasm
  を p98lib 側へコピーしない方針。理由は p98lib 側のコメント参照）。
  こちらは「ツールチェーンの本家参照」であり、コピーではない。
- **WorkbenchNP2 → p98lib（ここ）**: 配信のためのバイト単位コピー。
  ツールチェーンではなく、あくまで「素材」の複製。

つまり同じ「隣にチェックアウトされている前提」の依存関係でも、役割が逆になっている。

## 鮮度の担保

- `MANIFEST.json` に、コピー元コミットのハッシュと各ファイルの sha256 を記録する。
- `tools/verify-p98lib-vendor.mjs` が以下を検査する:
  - 常に: `vendor/p98lib/` の各ファイルの sha256 が `MANIFEST.json` と一致するか
    （p98lib のチェックアウトが無くても走る）
  - `../p98lib` が隣に存在する場合のみ追加で: 本家とバイト一致するか、
    かつ `MANIFEST.json` の commit が本家の HEAD と一致するか

## 更新手順

p98lib 側でファイルが変わったら:

1. p98lib 側のコミットハッシュを確認する: `git -C ../p98lib rev-parse HEAD`
2. 変更されたファイルをここへ上書きコピーする
3. `MANIFEST.json` の `commit` と該当ファイルの sha256 を更新する
   （`shasum -a 256 <file>` で計算できる）
4. `node tools/verify-p98lib-vendor.mjs` を実行し、PASS することを確認する
   （`../p98lib` が隣にあれば本家との一致も検査される）
