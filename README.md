# PC98Dev

ブラウザ完結の PC-98 開発環境（構築中）。
[WebNP2](../WebNP2) を実行基盤に、C / アセンブラで書いたコードを
その場でビルド・実行・デバッグできるようにするのが目標。

## 現状（2026-08-04）

**Step 2 まで到達。ビルドから実行までの縦一本が通っている。**

```
.asm ──[wasm NASM]──> .COM ──[FAT12 書き込み]──> .xdf ──[WebNP2]──> PC-98 で実行
```

実際に `hello.asm` と、1996年の `TEST.ASM` を NASM 記法へ変換したものが
FreeDOS(98) 上で動作することを確認済み。

## 構成

```
toolchain/
  nasm-src/          NASM 2.16.03 ソース（upstream 無改変）
  nasm-wasm/         emscripten ビルド成果物
    nasm.js/.wasm      wasm 版 NASM
    build.sh           再現用ビルドスクリプト
    PATCHES.md         ビルド調整の記録（C ソースへのパッチは 0 件）
    verify.mjs         ホスト版 NASM との出力バイト一致検証
  assemble.mjs       アセンブル API（エラーを行番号付きで構造化して返す）
  makefd.mjs         PC-98 2HD 1232KB FAT12 イメージを新規生成
  fdadd.mjs          既存 FAT12 イメージへファイル追加（BPB 自動判別）
  build-com.mjs      CLI: .asm → .COM → 新規 FD
  build-boot-fd.mjs  CLI: .asm → .COM → 起動可能 FD（FreeDOS ベース）
  verify*.mjs        各種検証スクリプト
samples/             テスト用 .asm
docs/
  masm-to-nasm.md    MASM→NASM 変換規則（自動変換ツールの仕様書を兼ねる）
```

## 使い方

推奨は **成果物だけの FD を作って FDD2 に挿す**方式。FreeDOS の起動ディスクを
一切触らないので安全で、`B:` としてゲストから見える。

```bash
# 成果物だけの FD を作る
node toolchain/build-com.mjs samples/hello.asm -o /tmp/pc98dev.xdf

# WebNP2 で開く（CORS 付きで配信してから）
#   http://localhost:5273/?freedos=1&run=1&fd2=http://127.0.0.1:8231/pc98dev.xdf
# DOS プロンプトで:  B:  →  HELLO
```

起動ディスク自体に載せたい場合（AUTOEXEC から自動実行したい等）は
`build-boot-fd.mjs` を使う。ベースイメージはコピーされ、元ファイルは変更されない。

```bash
node toolchain/build-boot-fd.mjs samples/hello.asm -o /tmp/boot.xdf
#   http://localhost:5273/?fd1=http://127.0.0.1:8231/boot.xdf&run=1
```

再ビルドが必要な場合:

```bash
cd toolchain/nasm-wasm && ./build.sh
```

## 検証

```bash
cd toolchain
node nasm-wasm/verify.mjs   # wasm NASM の出力がホスト版と sha256 一致するか
node verify-fd.mjs          # FD 生成 → 独立コードで読み戻して round-trip 一致
node verify-fdadd.mjs       # 既存イメージへの追加で元ファイルを壊していないか
```

## 技術選定

| 領域 | 選択 | 理由 |
|---|---|---|
| アセンブラ | **NASM 2.16.03** | BSD 2-clause。SmallerC のバックエンドでもあるため必須 |
| C コンパイラ | **SmallerC**（未着手） | BSD 2-clause・セルフホスティング・依存極小。出力が NASM 形式 |
| エディタ | **CodeMirror 6**（未着手） | モバイル対応と軽さ。Monaco は 2〜5MB でモバイルが弱い |

## 次のステップ

3. `exec_1step()` を wasm export してステップ実行（NP2kai の `i386c/ia32` に部品が揃っている）
4. SmallerC を wasm 化して C 対応
5. CodeMirror 6 でブラウザ UI

## 注意

- **ソースは CP932（Shift-JIS）のまま扱うこと。** `iconv -f SHIFT_JIS` は 0x5C を ¥ に
  変換して C/asm のエスケープを壊す。`-f CP932` を使う
- NASM の `main` はプロセスグローバル状態を持つため、**1回のアセンブルごとに
  `createNasm()` で新しいモジュールインスタンスを作る必要がある**
- 自動テストからエミュレータへキー入力する際、`KeyboardEvent` の合成は**二重入力になる**
  （`HELLO` → `hheelllo`）。`ccall('webnp2_push_key_buffer', ..., [charCode])` で
  BIOS キーバッファへ直接注入すること
- `WebNP2/public/freedos/fd98_2hd.xdf` はベースイメージ。**書き換えないこと**
  （`fdadd.mjs` はコピーを作って出力する）
