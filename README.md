# WorkbenchNP2

ブラウザ完結の PC-98 開発環境（構築中）。
[WebNP2](../WebNP2) を実行基盤に、C / アセンブラで書いたコードを
その場でビルド・実行・デバッグできるようにするのが目標。

## 現状（2026-08-13）

**名称はWorkbenchNP2。ASM/Cのビルド・実行・ソース行デバッグに加え、IDE UI第2段
（エディタ上でのBP・停止行・行送り）まで到達。「1ファイル＝1プログラム」の実験的
プロジェクトとして公開する方針のため、複数ファイルにまたがるビルドはできず、
`#include`は同梱の標準ヘッダのみを許可する。保存先はこのブラウザ（IndexedDB）だけで、
ローカルフォルダ接続機能は削除済み。書いたコードを外へ持ち出す手段はダウンロードボタン
のみである。ツールバーは実行・デバッグの2つで、ビルドは実行・デバッグが自動で行うため
専用ボタンは無い。利用者向けの説明は`ide/help.html`にある。**

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
    PATCHES.md         ビルド調整の記録（NASM upstreamパッチは0件）
    verify.mjs         ホスト版 NASM との出力バイト一致検証
  assemble.mjs       アセンブル API（エラーを行番号付きで構造化して返す）
  listing.mjs        NASMリスティング→ソース行/セグメント内offsetマップ
  makefd.mjs         PC-98 2HD 1232KB FAT12 イメージを新規生成
  fdadd.mjs          既存 FAT12 イメージへファイル追加（BPB 自動判別）
  build-com.mjs      CLI: .asm → .COM → 新規 FD
  build-exe.mjs      CLI: exebin.mac使用 .asm → MZ EXE → 新規 FD
  compile.mjs        CLI/API: C → small-model MZ EXE → 新規 FD
  c-source-map.mjs   C行→生成ASM行→実行offsetマップ
  smlrc-wasm/        SmallerC wasm成果物・再現パッチ（upstreamパッチ1件）
  build-boot-fd.mjs  CLI: .asm → .COM → 起動可能 FD（FreeDOS ベース）
  verify*.mjs        各種検証スクリプト
samples/             テスト用 .asm
docs/
  masm-to-nasm.md    MASM→NASM 変換規則（自動変換ツールの仕様書を兼ねる）
ide/                CodeMirrorエディタ＋WebNP2実行画面
  index.html          実用workbench（編集・IndexedDB保存・ビルド・実行・デバッグ）
  verify-loader.mjs   workbenchのローダ状態・再実行・終了コード検証
  project-fs.mjs      IndexedDbProjectFS(このブラウザに保存)を実装するProjectFS抽象
  debug-map.mjs       ASM listing / C source mapを1つの行マップ契約へ寄せる層
  debug-session.mjs   4B01hローダ経由の起動・行BP・行送りを保持するセッション
  vendor/codemirror/  固定版bundle・17パッケージのLICENSE・再現build.sh
```

C側はBSD 2-ClauseのSmallerCをpin検証後、一時ツリーへ1件だけ再現パッチを適用してwasm化し、
`toolchain/compile.mjs` で `smlrpp → smlrc -seg16 → NASM -f elf → smlrl -small` を順に呼んで
16-bit DOS small-model MZ EXEを生成する。標準ライブラリ`lcds.a`もpin済みソースから再生成する。
C/ASM共通入力層はDOSテキスト末尾から連続するEOF `0x1A`だけを除き、除去件数をAPI結果へ返す。
compile CLIは同じ件数をログにも表示する。途中の`0x1A`は書き換えず各ツールへ渡し、入力を黙って変更しない。
1997年の研修コード`STRLEN.C`は原文のままMZ EXE化してPC-98上で実行済みである。
`StrLen("ABC")`を`printf("%d\n")`へ渡すソースどおり、TVRAMの期待出力`3`を確認した。
さらに同じ`STRLEN.C`の22行目`Len++;`へBPを張り、実行addressから同じC行と原文へ
逆引きできることを実機相当ブラウザ検証で確認した。

SmallerCパッチは、各文の開始を`; @pc98dev-c-line`コメント、終了を行0として生成ASMへ出す。
NASMの`%line`も生成バイト自体はコメントと同一だったが、listingの物理ASM行を13/14へ書き換え、
構造化エラー行を0へ退化させることを実測したため採用しなかった。通常コメントは物理ASM行と
エラー行を維持する。NASM upstreamへのパッチは引き続き0件である。

`toolchain/c-source-map.mjs`は`C行 → 物理ASM行 → NASM listing → .text実行offset`を合成する。
1行に複数の非連続区間があれば全て保持し、prologue/epilogueやライブラリなど対応区間外の
addressは近傍行へ寄せず`null`を返す。誤った行を示さないことを優先する。
再現・ホスト版一致検証は [docs/smallerc-wasm.md](docs/smallerc-wasm.md)、
実在コードの詳細は [docs/kensyuu-smallerc.md](docs/kensyuu-smallerc.md) を参照する。

## IDE UI

`ide/index.html`はCodeMirror 6の行番号・gutter付きエディタで、同梱サンプルまたは
IndexedDBプロジェクトのファイルを開き、新規作成・編集・保存できる。保存APIは
`ProjectFS`として切り離し、`IndexedDbProjectFS`を実装する。「1ファイル＝1プログラム」の
実験的プロジェクトとして公開する方針のため、フォルダ階層やローカルフォルダ接続機能は持たない。
書いたコードを外へ持ち出す手段は、サイドバーのダウンロードボタン（アクティブなタブの内容を
basenameのファイル名でUTF-8のまま保存する）である。

新規作成は`#new-file`ボタンを押すとポップアップが開き、ファイル名（拡張子のみ、パスなし）を
入力してEnterで確定する。Escまたはポップアップの外側クリックで閉じる。`.asm`/`.c`以外の
拡張子はポップアップ内にエラーを表示し、ポップアップを閉じない。

操作ボタンはエディタ直下の1本のツールバーへまとめ、通常時の実行／デバッグ操作と、
デバッグ開始後の続行／ステップ／再実行／停止操作をモードに応じて入れ替える。ビルドは
実行・デバッグが自動で行うため専用ボタンは無く、ビルド状況表示（`#build-status`）だけが残る。
8個のアイコンは環境依存の記号文字を使わないinline SVGで、意味は同一文言の`title`と`aria-label`で示す。

ページ・作業領域・タブ・ステータスバーはVS CodeのDark Modernに統一し、ヘッダだけはWebNP2の
実CSSから採取した黒基調を維持する。テーマ色は`ide/workbench.css`の`:root`へ
`--vsc-*`／ヘッダ用`--np2-*`カスタムプロパティとして集約している。

エディタは複数ファイルをタブで開き、編集中の本文・未保存状態・ブレークポイントをファイルごとに
保持する。ファイル操作は開閉可能なエクスプローラーへ集約し、保存状態とライセンスは下端の
ステータスバーへ表示する。エディタとPC-98画面は各見出しのボタンで一時的に片方だけを最大化できる。
両ペイン間のスプリットバーでも幅を調整でき、PC-98画面を等倍（640px）まで広げられる。
デバッグ中はエディタと逆アセンブルの間にもスプリットバーが現れ、逆アセンブルの高さを調整できる。

拡張子から`.asm`／`.c`を判別し、Node CLIと共有する`assemble-core.mjs`／`compile-core.mjs`へ渡す。
成功時はFAT12 FDを生成してWebNP2上のFreeDOSで実行する。失敗時は構造化エラーのstage・行・本文を
一覧とCodeMirror gutterへ表示する。デスクトップはエディタとPC-98画面の左右分割、375px幅では
縦積みと行折返しになり、両方を同じviewport内で操作できることをDOMとスクリーンショットで確認済み。

CodeMirrorは`codemirror@6.0.2`、`@codemirror/lang-cpp@6.0.3`を入口に、直接・間接依存17件を
全て固定して`ide/vendor/codemirror/codemirror.js`へvendoringした。17件の一次`LICENSE`本文は
全てMITで、`LICENSE.CodeMirror`へpackage名・版ごとに同梱する。BP gutterと停止行強調のため
`entry.mjs`へ`Decoration`／`GutterMarker`／`gutter`／`StateField`／`StateEffect`／`RangeSet`／
`RangeSetBuilder`を追加re-exportしてbundleし直し、パッケージ構成・版・17件のLICENSEは変更なく
bundleは458,609 bytes（gzip -9で148,865 bytes）。`ide/vendor/codemirror/build.sh`がnpm install
からbundle・ライセンス収集までを再現する。CDNは使用しない。

デバッガ機能と回帰検証はworkbenchへ統合済みであり、
`index.html`の「デバッグ」ボタンからビルド済み対象を4B01hローダ経由で起動し、対象の1命令目
手前で停止する。BPはCodeMirrorの専用gutterをクリックして張り、停止行はエディタ本体の行
decorationで強調する（別ソース一覧は使わない）。行マップはビルド
時点で確定するため、実行前に「どの行へBPを張れるか」が決まり、生成アドレスのない行へのBPは
拒否する（黙って無視しない）。ハードウェアBP枠は0〜5を利用者BP、6を「次の行まで実行」の
一時BP、7を4B01hのエントリ停止用に割り当てる。C の1行が複数の非連続区間を持つ場合は全区間へ
張り、枠を超えるとエラーにする。レジスタはIDE独自の8本表示。通常実行へ復帰すると停止行強調と
レジスタ表示は消えるが、BPは次のデバッグまで残す。別ファイルを開くとBPは持ち越さない。

コアはページごとに1回しか起動できないため、ローダだけのB:を使ってFreeDOSを先に起動し、以後はビルドのたびに
B:のFDだけ差し替える。差し替えは「排出→間隔→挿入→間隔」のメディア交換手順が必要で、
挿入だけだとDOSがFATキャッシュを持ち越して「ドライブの準備ができていません」になることを
実測した。短い揺らぎはDOSの再試行（R）で吸収し、それでも読めなければ中止（A）でプロンプトへ
戻して排出から交換を最大2回やり直す。固定間隔は最適化に留め、正しさはこの二段の検出・復旧で担保する。
デバッガローダ`E0LOAD.COM`は実行用・デバッグ用でFDを作り分けず、常に対象と同じ
FAT12 FDへ同梱する。

`ide/verify-workbench.mjs`は、`hello.asm`を編集したものをエディタ上でデバッグし、生成行が
8,9,10,11,12,14の6行であること、生成アドレスの無い13行目へのBPが拒否されること、エントリが
8行目で停止すること、「次の行まで実行」で9行目、BPで11行目に停止すること、gutterのBP印と
停止行強調がDOMに出ていることを確認する。続けて1997年の`STRLEN.C`を原文の行番号のままエディタ
上で22行目`Len++;`に停止させ、通常実行へ復帰して出力`3`を確認する。スクリーンショットの出力先は
リポジトリへ固定せず、環境変数`PC98DEV_SHOT_DIR`で差し替えられる（既定はOSの一時ディレクトリ）。

## デバッガ実証

> **現在の制約:** デバッガローダが使うDOS EXEC 4B01hは、同梱FreeDOS(98)・NEC日本語MS-DOS 3.3C・
> 1996年当時のHDD環境の3つで実地確認済み（下表）。ただしこれは手元にあるイメージの範囲であり、
> すべてのDOSでの対応を保証するものではない。非対応DOSではこの方式を利用できない。
> 任意ファイルの編集・実行・デバッグと回帰検証は`index.html`のworkbenchが担当する。

> **終了復帰:** 4B01h load-only後に対象へfar jumpしても、対象のAH=4Ch終了後に
> ローダ自身をAH=4Chで終了してFreeDOSのプロンプトへ戻る。同一セッションで
> 「デバッグ実行→プロンプト復帰→別対象を再度デバッグ実行」できることを実測済み。

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
対象の1命令目を実行する前に停止する。EXEC復帰回数はCS相対の制御ブロックへ記録し、2回目の復帰では
AH=4Dhで取得した子の終了コードをALに保ったまま、ローダ自身もAH=4Chで終了する。
以前の `PC98DEV_IDE` 入力待ちスタブと対象RAM走査は削除した。

WebNP2から埋め込み成果物とコアを同期してから、実ブラウザ検証を実行する。

```bash
../WebNP2/scripts/export-embed.sh
node ide/verify-workbench.mjs
node ide/verify-loader.mjs
node ide/verify-debug-map.mjs
```

`ide/verify-loader.mjs`はworkbenchで、ロード済み対象のビルド出力一致、ローダ終了直前の内部状態、
同一DOSセッションで2本目の終了コード37がCOMMAND.COMへ伝播することを確認する。

workbench検証はASM/Cのエントリ停止、行BP、行送り、レジスタ・逆アセンブル表示とTVRAM出力を確認する。
ローダ検証は無改変helloのロードバイト、EXEC復帰2回、子終了コードと同一セッションでの再実行、
COMMAND.COMへの`ERRORLEVEL 37`伝播を確認し、故障注入でも空回りを防ぐ。
`PC98DEV_URL` と `CHROME_PATH` で起動先を上書きできる。

同期物の `ide/vendor/webnp2/LICENSE.WebNP2` はWebNP2由来コードの出所を、
`ide/core/LICENSE.NP2kai` はNP2kaiの利用条件を示す。FreeDOS起動FDには同じディレクトリの
`README.txt`（GPLv2+とソース情報）が対応するため、配布時は各バイナリとライセンス表示を分離しない。
同様に`ide/vendor/codemirror/codemirror.js`は17件分の`LICENSE.CodeMirror`と分離しない。

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

4B01h直後と子終了後は同じEXEC復帰点を通る。修正前のFreeDOS実測では、子PSPの終了ベクタ
`INT 22h=0801:01C3`とローダの`EXEC-return=0801:01C3`が同一で、復帰点を2回通過した後に
release byte待機ループへ再入していた。また2回目の復帰時SS:SPは保存した親SS:SPと一致し、
DOSによる親スタック復元も確認した。ローダはCS相対の復帰回数を初回1・再入2として区別し、
再入時は復元済みスタック上でAH=4Dhを呼び、子の終了コードを引き継いでAH=4Ch終了する。
AH=50hによるPSP切替やINT 22hの独自トランポリンは不要である。

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

### 当時MZ EXEのload-only検証（Phase E-2）

`verify-exec-load.mjs` は同じHDD起動・ランチャ離脱・FDドライブ探索を再利用し、1996年HDD環境の
`\A-GAMES\SAKA\SAKA.EXE`（ASM版、9149B、再配置4件）と
`\C-GAMES\SAKA\1014\SAKA.EXE`（C版、437130B、再配置566件）も個別起動で検証する。
パスと値はHDDの対象ファイルだけをホスト側FATリーダで読み、ASM版は
`e_ss=021Ch/e_sp=0400h/e_ip=0000h/e_cs=0000h`、C版は
`e_ss=6D1Dh/e_sp=0800h/e_ip=48D8h/e_cs=0000h`と確認済みである。イメージや抽出物は保存しない。

プローブローダはコマンド引数の対象を開き、先頭20hバイトからMZ値を表示してから4B01hを呼ぶ。
MZのword順は同梱NASM upstream `toolchain/nasm-src/misc/exebin.mac` と照合し、
`e_ss=0Eh`、`e_sp=10h`、`e_ip=14h`、`e_cs=16h`と確定した。ホストは表示値が事前読取り値と
一致することに加え、`IP=e_ip`、`SP=e_sp-2`、CS側とSS側から算出したPSP一致、PSP先頭`CD 20`、
PSP先頭が`CD 20`であることを検査する。`exebin.mac`型MZは`FFF0:0100`により実効
`CS=PSP`となり得るため、IP/CSだけでCOMと判定しない。対象エントリへの制御移行は行わない。
純粋関数のfixtureは通常値とFFF0h折り返しを受理し、折り返し無し注入を含む9通りの破壊が
FAILすることを `node ide/verify-exec-load-result.mjs`
で確認できる。

**実測結果（1996年HDD環境、ASM版・C版とも load-only 成功）:**

| 対象 | MZ e_CS:IP | MZ e_SS:SP | 4B01h返却 CS:IP | PSP |
|---|---|---|---|---|
| ASM版 `\A-GAMES\SAKA\SAKA.EXE` | 0000:0000 | 021C:0400 | 113C:0000 | 112C |
| C版 `\C-GAMES\SAKA\1014\SAKA.EXE` | 0000:48D8 | 6D1D:0800 | 113C:48D8 | 112C |

いずれも16bitで折り返した `CS = PSP + 10h + e_cs` / `SS = PSP + 10h + e_ss` が成立する。
**C版は437,130B・常駐438KBだがメモリ不足`0008h`に
ならず、当時環境の空きメモリに載る**。無改変のビルド済みバイナリでも入口を確定できることを示す。

#### 返却SPがe_spより2小さい理由

DOSは子プロセスのスタックへゼロワードを1つ積んでから返す（`RET`でPSP:0000のINT 20hへ
戻れるようにするDOSの規約）。このため返却SPは常に `e_sp - 2` になる。`.COM`で
`SS:SP=xxxx:FFFC`が返るのも同じ理由で、規定のFFFEhから2引かれた値である。
定数2を根拠なく引かないよう、検証では返却`SS:SP`が指すワードをホストがRAMから直読みし、
**その値が`0000`であること自体**も確認している。

### 当時ASM版SAKA.EXEのエントリ停止・命令ステップ（Phase E-3）

`verify-saka-step.mjs` はE-2から共通化したHDD起動・ランチャ離脱・FDドライブ探索を使い、
`\A-GAMES\SAKA\SAKA.EXE`を汎用デバッガローダで4B01hロードして返却CS:IPへ制御を移す。
ローダはPSP command tailの対象パスを受け付け、引数なしの場合だけ従来どおり`B:\TARGET.COM`を使う。

エントリ停止時は、CPUのCS:IPと4B01h返却値、PSP/初期レジスタ、実行前後のTVRAM不変を検査する。
さらにNP2kaiの2MB RAMビュー内にあるGVRAM両ページ・B/R/G/E各32KBもSHA-256照合し、
テキストプレーンだけが不変でもグラフィックが変化したケースをPASSにしない。
さらにホスト側FATリーダがHDD像から固定パスのSAKA.EXEだけをメモリ上へ読み、
`e_cparhdr*16 + ((e_cs*16 + e_ip) & FFFFFh)`のファイル実体とゲストRAMを32 bytes照合する。
再配置表のwordに重なるバイトは比較から除外し、除外バイト数をPASS行へ明示する。
その後は既定8命令（`PC98DEV_SAKA_STEPS`で1〜12）だけを逆アセンブル順にstepし、
非分岐命令では次IPが命令長どおりかを検査する。分岐・CALL・INT等は件数を明示して連続IP検査を省略する。
表示状態の切り分けでは、HDD起動直後、ランチャ離脱後、各ドライブ試行前、4B01h READY/release前、
エントリBP、各step後を個別撮影し、canvas画素・生GVRAM・PNGそれぞれのハッシュをログへ出す。

#### 1996年HDD環境に残るGVRAM画像

初期のengine-ready画面は黒だが、最初の運用上の観測点であるファイラーFD v3.13表示時には、
背景の人物CGが第0 GVRAMページに入っている。FDを終了してDOSプロンプトへ戻った後も消去されず、
E0LOADの4B01h READY/release前、対象エントリ、先頭8命令後までcanvasとGVRAMのSHA-256は不変だった。
従ってこの画像はSAKAやデバッガローダの出力ではなく、HDD起動中のFD表示までに作られた既存内容である。
ただし現検証はAUTOEXEC内を命令追跡していないため、FD自身とそれ以前の起動処理のどちらが書いたかまでは
区別しない。IDEは当時環境のGVRAMが開始時に空とは仮定せず、対象による出力は開始前スナップショットとの差で判定する。

ハッシュ対象はNP2kaiの`VRAM_B=0A8000h`、`VRAM_R=0B0000h`、`VRAM_G=0B8000h`、
`VRAM_E=0E0000h`と、それぞれに`VRAM_STEP=100000h`を足した第1ページである。
`makegrph.mcr`はB/R/G/Eを色indexのbit 0/1/2/3として合成するため、E0000hは16色時の
上位色ビット（輝度に相当）を保持する第4プレーンであり、4プレーンの選択はNP2kai実装と一致する。

今回の診断では最初にrelease前だけを観測したため、既存画像の発生区間を確定できなかった。
「変化していない」と主張する検証は、変化し得る最も早い時点から連続して観測点を置く。

```bash
PC98DEV_LEGACY_THD=/path/to/HDDimage.thd \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node ide/verify-saka-step.mjs
```

純粋関数の空回り防止fixture（停止IPを+1した破壊を含む）は次で確認できる。

```bash
node ide/verify-saka-step-result.mjs
```

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
# Cからsmall-model MZ EXEと成果物FDを作る
node toolchain/compile.mjs samples/hello-c.c -o /tmp/pc98dev-c.xdf

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
node verify-dos-text.mjs    # 末尾DOS EOF許容、途中0x1A保持、無改変STRLEN.C
node verify-c-source-map.mjs # STRLEN.CのC行/実行offset合成、対応なし、故障注入
node verify-saka-build.mjs  # SAKA変換版のwasm NASM・MZヘッダ・EXE行マップ
```

## 技術選定

| 領域 | 選択 | 理由 |
|---|---|---|
| アセンブラ | **NASM 2.16.03** | BSD 2-clause。SmallerC のバックエンドでもあるため必須 |
| C コンパイラ | **SmallerC** | BSD 2-clause・依存極小。wasm化し、NASM出力へ行コメントを加える最小パッチ1件 |
| エディタ | **CodeMirror 6** | contentEditableによるモバイル編集、行番号・gutter。固定版をローカルbundle化 |

## 次のステップ

6. ~~workbenchへASM/Cソース行デバッガを統合（UI第2段）~~ 完了

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

## 商標・非提携について

- PC-9801、PC-9821は日本電気株式会社（NEC）の商標です。本プロジェクトはNECとは関係がなく、
  NECによる承認・提携・協賛を受けたものでもありません
- 本プロジェクトは実行基盤としてNP2kai（Neko Project II 系）をビルドし同梱しています。
  NP2kaiおよびNeko Project IIの作者とも関係がなく、公認を受けたものではありません

## ライセンス

WorkbenchNP2自身のコード（このリポジトリで書かれた部分）はリポジトリ直下の`LICENSE`のとおり
MIT License（Copyright (c) 2026 URARA-works）。同梱している第三者ソフトウェアはそれぞれの
配布元のライセンスに従い、WorkbenchNP2のMIT Licenseで上書きされるものではない：

- `ide/core/LICENSE.NP2kai` — NP2kai（MIT License, Copyright (c) 2017 AZO）
- `ide/vendor/webnp2/LICENSE.WebNP2` — WebNP2由来コード
- `ide/freedos/README.txt` — FreeDOS(98)（GPLv2+、ソース入手先URL付き）
- `ide/vendor/codemirror/LICENSE.CodeMirror` — CodeMirror（MIT、17パッケージ分）
- `toolchain/nasm-src/LICENSE` — NASM（BSD 2-Clause）
- `toolchain/smlrc-wasm/LICENSE.SmallerC` — SmallerC（BSD 2-Clause）
