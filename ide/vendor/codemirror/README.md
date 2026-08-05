# CodeMirror 6 vendor bundle

`codemirror.js`はCodeMirror 6のブラウザ用ES module bundleで、CDNへ依存しない。
直接・間接依存17件の版は`build.sh`で全て固定している。ビルド専用のesbuild 0.21.5は
bundleへ含まれない。再生成にはNode.js/npmとネットワーク接続を使う。

```bash
ide/vendor/codemirror/build.sh
```

`LICENSE.CodeMirror`はnpm packageに同梱された一次情報の`LICENSE`本文を17件分、
package名・版とともに連結したもの。全件MITである。`collect-licenses.mjs`は版の一致と
MIT本文を検査してから生成する。配布時は`codemirror.js`と同ファイルを分離しない。
