# PC98Dev

ブラウザ完結の PC-98 開発環境（構築中）。
[WebNP2](../WebNP2) を実行基盤に、C / アセンブラで書いたコードを
その場でビルド・実行・デバッグできるようにするのが目標。

## 現状（2026-08-05）

**Step 3 まで到達。ビルドからソース行デバッグまでの縦一本が通っている。**

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
  listing.mjs        NASMリスティング→ソース行/セグメント内offsetマップ
  makefd.mjs         PC-98 2HD 1232KB FAT12 イメージを新規生成
  fdadd.mjs          既存 FAT12 イメージへファイル追加（BPB 自動判別）
  build-com.mjs      CLI: .asm → .COM → 新規 FD
  build-boot-fd.mjs  CLI: .asm → .COM → 起動可能 FD（FreeDOS ベース）
  verify*.mjs        各種検証スクリプト
samples/             テスト用 .asm
docs/
  masm-to-nasm.md    MASM→NASM 変換規則（自動変換ツールの仕様書を兼ねる）
ide/                WebNP2 embedを使う最小IDE実証
```

## 最小IDE実証

> **現在の制約:** デバッガローダが使うDOS EXEC 4B01hは、同梱FreeDOS(98)・NEC日本語MS-DOS 3.3C・
> 1996年当時のHDD環境の3つで実地確認済み（下表）。ただしこれは手元にあるイメージの範囲であり、
> すべてのDOSでの対応を保証するものではない。非対応DOSではこの方式を利用できない。
> また現時点のIDE実証UIはHELLO.COM固定で、任意ファイル選択UIはまだない。

`ide/` は `samples/hello.asm` をブラウザのwasm NASMでアセンブルし、行マップとFAT12 FDを
その場で生成して、IDEが用意したcanvas上のNP2kaiへ渡す。ソース行クリックBP、現在行強調、
「次の行まで実行」を備える。レジスタはembedのUIを使わないIDE独自表示、逆アセンブルはembed部品である。

`ide/debug-loader.asm` をwasm NASMで組み立て、対象を内容無改変の `TARGET.COM` として同じFDへ置く。
ローダは4Ahで自身を縮小して4B01hで対象をロードし、署名付き制御ブロックへPSPと初期
CS:IP / SS:SPをpublishする。ホストは対象バイト列を走査せず、この専用署名をRAMから読み、CPUをpauseして
範囲検査付きRAM書込みでrelease byteだけを返す。`webnp2_mem_ptr` が指すHEAPU8は直接書込み可能だが、
`window.Module`へ依存しないようembedの `DebuggerController.writeMemory` を公開経路にした。

ローダはCOMなら返却CSをPSPとし、MZ EXEなら事前に読んだヘッダの `e_cs` を使って
`PSP = relocated CS - e_cs - 10h` とする。COM/EXEともDS=ES=PSP、DOS返却のSS:SPとCS:IPを設定し、
割り込み禁止下でSS→SPを連続設定する。最後はSTI直後のfar jumpをエントリBPまで1命令実行枠で追うため、
対象の1命令目を実行する前に停止する。以前の `PC98DEV_IDE` 入力待ちスタブと対象RAM走査は削除した。

WebNP2から埋め込み成果物とコアを同期してから、実ブラウザ検証を実行する。

```bash
../WebNP2/scripts/export-embed.sh
node ide/verify-ide.mjs
```

検証は、28-byteの無改変hello、対象1命令目での初期レジスタ一致と未出力、クリックBPと停止・強調行、
次行への遷移、IDE独自レジスタ表示、実行後のTVRAM出力を確認する。停止IPを+1した値や、実行済みの
画面文字列を同じエントリ検証関数へ渡すとFAILすることも確認し、空回りを防ぐ。
`PC98DEV_URL` と `CHROME_PATH` で起動先を上書きできる。

同期物の `ide/vendor/webnp2/LICENSE.WebNP2` はWebNP2由来コードの出所を、
`ide/core/LICENSE.NP2kai` はNP2kaiの利用条件を示す。FreeDOS起動FDには同じディレクトリの
`README.txt`（GPLv2+とソース情報）が対応するため、配布時は各バイナリとライセンス表示を分離しない。

### デバッガローダ方式

NP2kaiのi386c/ia32では `INT imm8` が命令実装でベクタを読み、`INTERRUPT` が実モードならIVT、
保護モードならIDTへCPU状態を遷移させる。DOSのINT 21h、EXEC、PSP管理自体はゲストOSのコードであり、
NP2kaiは実装しない。`ENABLE_TRAP` 時だけINT実行直前に `softinttrap(CS,EIP,vector)` を呼ぶ既存経路は
あるが、現在のemnp21kai_sdl2のコンパイル定義には `ENABLE_TRAP` がなく、同関数もログ用で停止できない。

通常の4B00hは子の終了まで呼出元へ戻らず、INT入口の検出だけでは開始CS:IPを得られない。
4B01hならDOSが再配置を終えた後、実行前にローダへ戻るため、対象を変更せず入口を確定できる。
同梱FreeDOS(98)ではPhase E-0でCS:IP=0856:0100、SS:SP=0856:FFFCを実測し、PSPと対象全バイトが
存在しながらHELLOが未実行であることまで確認した。これをPhase E-1のIDE開始経路として採用している。

4B01hを使えないDOS向けにC側を補助する場合は、まず
`webnp2_dbg_run_until_softint(vector, ax_mask, ax_value, max_steps)` を追加し、命令実行**前**の
CD imm8とAX条件をC内で効率よく監視する。これはAH=4Bh入口の捕捉APIであり、単独ではロード完了を
意味しない。OS非依存性を保つには、併せて汎用メモリwatch/mailbox通知を提供してゲストローダと協調する。
NP2kai内へDOSバージョン依存のPSP/MCB解析を直接組み込む `run_until_exec_entry` は最終手段とする。

### DOS EXEC 4B01h 実地確認（Phase E-0）

`samples/exec-load-probe.asm` はwasm NASMで組み立てるFreeDOS(98)互換性プローブである。COMのスタックを
保持領域へ移してからINT 21h AH=4Ahで自分のメモリブロックを縮小し、AX=4B01hで
`B:\HELLO.COM`をロードする。EXEC前のSS:SP/DS/ESはCS相対変数へ保存し、戻り直後はスタックを
一切使わず復元する。

Ralf Brown's Interrupt ListのINT 21h/AX=4B01h定義と照合したEXECパラメータブロックは、
`+00h=環境segment`、`+02h=command tail far ptr`、
`+06h=FCB1 far ptr`、`+0Ah=FCB2 far ptr`。4B01h成功時の返却領域は、メモリ格納順で
`+0Eh=SP`、`+10h=SS`、`+12h=IP`、`+14h=CS`（すべてword）である。表示時は人間向けに
`CS:IP`、`SS:SP`へ並べ直す。

検証はFreeDOSをFD1（A:）、プローブFDをFD2（B:）へ入れ、TVRAM上の成功またはCFエラーを判定する。
成功時は `.COM` のIP=0100hに加え、返却CSのPSP先頭が`CD 20`で、CS:0100の全バイトが
wasm NASM生成HELLO.COMと一致するところまで確認する。これにより単なる「値が出た」を成功扱いしない。

MS-DOS環境は再配布できないためリポジトリへ置かず、`PC98DEV_MSDOS33_HDI` と
`PC98DEV_LEGACY_THD` で外部HDDを任意指定する。外部イメージはno-storeでブラウザへ直接
ストリームし、IndexedDB自動保存も無効化する。未指定・不存在は明示的なSKIPとして成功扱いにする。
プロンプトは `A>` / `A:>` / `A:\>` を受理し、タイムアウト時は推測で起動失敗とせずTVRAM全25行を
標準エラーへ出す。各環境の実測結果は次のとおり。

| DOS環境 | 4B01h実測 |
|---|---|
| FreeDOS(98) | 対応（CS:IP=0856:0100、SS:SP=0856:FFFC） |
| NEC日本語MS-DOS 3.3C | 対応（CS:IP=145C:0100、SS:SP=145C:FFFC） |
| 1996年HDD環境 | 対応（CS:IP=1111:0100、SS:SP=1111:FFFC） |

いずれもIP=0100h・SS=CS・SP=FFFCで、`.COM`のDOS規約どおりの値である。

### HDD起動ケースで踏んだ落とし穴

- **起動不能なFDを挿したままHDD起動しない。** PC-98はFDをHDDより先に起動対象として試すため、
  プローブFDをFD1に挿したまま起動するとHDDへ落ちてこず、TVRAMが完全に空のまま停止する。
  HDD単独で起動し、プロンプト到達後に `insertFd` でホットマウントする。
- **当時のHDDはAUTOEXECからランチャが起動し、素のプロンプトが出ない。** MSDOS33.hdiはNEC純正の
  コマンドメニュー（F9で終了）、1996年環境はファイラーFD v3.13（Qで確認ダイアログ→Yで終了）。
  `LAUNCHER_ESCAPES` に検出パターンと離脱キーを列挙して抜ける。
- **FDのドライブレターはHDDのパーティション構成で変わる**ため決め打ちしない。B:〜F:を順に試して
  実際に起動できたものを採用し、採用したレターをログへ出す。

```bash
PC98DEV_MSDOS33_HDI=/path/to/msdos33.hdi \
PC98DEV_LEGACY_THD=/path/to/legacy.thd \
node ide/verify-exec-load.mjs
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

`build-com.mjs` はFDイメージに加え、出力先ディレクトリへ `hello.com` と
`hello.com.map.json` も書き出す。マップは次の配列で、`bytes` はCOM本体から切り出した
実バイト列、`offset` は `.COM` の `ORG 100h` を加えた**セグメント内オフセット**である。
実行時のCSはDOSによるロードまで決まらないためマップには含めず、デバッガ側で組み合わせる。

```json
[
  { "srcLine": 8, "offset": 256, "bytes": [180, 9], "text": "mov\tah,09h" }
]
```

NASMのリスティングは`ORG 100h`でもアドレス欄が0起点で、再配置を含む値は
`BA[0C00]`のように最終バイトと異なる表記になる。このため`listing.mjs`はアドレス欄から
範囲だけを求め、バイト列は必ず生成済みCOMから取得する。ラベル/EQU/コメント等のバイトを
生成しない行はマップから除外し、長い`db`/`times`の継続行は1エントリへ結合する。
マクロで1行から複数命令へ展開された場合は、呼出行と同じ`srcLine`を持つ複数エントリにする。
`lineToOffset`はその行の先頭を、`offsetToLine`は命令・データ途中のoffsetでも包含行を返す。

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
node verify-listing.mjs     # listingマップと.COM実バイト、行/offset逆引きの一致
```

## 技術選定

| 領域 | 選択 | 理由 |
|---|---|---|
| アセンブラ | **NASM 2.16.03** | BSD 2-clause。SmallerC のバックエンドでもあるため必須 |
| C コンパイラ | **SmallerC**（未着手） | BSD 2-clause・セルフホスティング・依存極小。出力が NASM 形式 |
| エディタ | **CodeMirror 6**（未着手） | モバイル対応と軽さ。Monaco は 2〜5MB でモバイルが弱い |

## 次のステップ

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
