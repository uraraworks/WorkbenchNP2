# MASM → NASM 変換規則

当時（1990年代）の PC-98 アセンブラ資産はほぼ **MASM 記法**で書かれている。
一方このプロジェクトのアセンブラは **NASM**（SmallerC のバックエンドでもあるため必須）。
その差分を整理する。

この文書は `samples/test_nasm.asm`（1996年の `A-GAMES/TEST.ASM` を手で変換したもの）を
作る過程で確立した。**将来の自動変換ツールの仕様書を兼ねる。**

## 検証状況

`TEST.ASM`（455B）の変換版は wasm NASM でアセンブルし、WebNP2 上の FreeDOS(98) で
実行して **`てすと中だぜぃ` が ESC[10;8H の指定どおり表示されることを確認済み**。

`SAKA.ASM` の変換前実測値、全重複ラベル、MZ生成方針は
[saka-masm-inventory.md](saka-masm-inventory.md) に分離した。
変換結果と再生成・検証手順は [saka-nasm.md](saka-nasm.md) に記録した。

---

## 1. オペランドの意味が逆転する（最頻出・最重要）

MASM はデータラベルを**メモリオペランド**として扱う。NASM は**アドレス**を意味する。

| MASM | NASM | 意味 |
|---|---|---|
| `mov ax,mmx` | `mov ax,[mmx]` | mmx の中身をロード |
| `mov bx,OFFSET msg` | `mov bx,msg` | msg のアドレスをロード |
| `mov flag,1` | `mov byte [flag],1` | 定数を格納（**サイズ指定が要る**） |
| `cmp k_bango,0` | `cmp word [k_bango],0` | 同上 |
| `inc k_bango` | `inc word [k_bango]` | 同上 |
| `mov cx,WORD PTR h_wait` | `mov cx,[h_wait]` | |

**自動変換の注意**: 単純な正規表現では壊れる。データラベルとコードラベル（`call`/`jmp` の
飛び先）を区別する必要がある。**先にシンボル表を作ってから置換すること。**

即値を格納する箇所は MASM ではラベルの宣言（`db`/`dw`）からサイズが決まるが、
NASM では `byte`/`word` を明示しないとアセンブルできない。ここもシンボル表が要る。

## 2. ラベルスコープ（最大の地雷）

MASM は `PROC` 内のラベルをローカル扱いする。NASM にはこの概念がない。

`SAKA.ASM` は**これに全面的に依存**している：

| ラベル | 重複している PROC |
|---|---|
| `owari:` | main / member / k_anime / m_anime / put_k / message |
| `put:` | opening / ending / main / putmap / put_dat / message |
| `loop0:` | main / put_k / putmap / message |
| `change:` | main / k_anime / m_anime / check_h |

`opening` と `ending` に**まったく同じ `put:` サブルーチンが2つ書かれている**のが証拠。
ラベルがローカルだからコピーせざるを得なかった。

素直に移すと**シンボル重複エラーが爆発する**。対処は2択：

- **`.local` 形式へ変換** — NASM は `.` 始まりのラベルを直前の非ローカルラベルにスコープする。
  `PROC` 名を非ローカルラベルにして、内部を `.owari` `.put` にする
- **機械的リネーム** — `main_owari` `member_owari` のように PROC 名を前置

前者が原典に近い。**PROC 境界を正しく認識できることが自動変換ツールの必須要件。**

## 3. セグメント/モデル宣言

| MASM | NASM (.COM の場合) |
|---|---|
| `.MODEL small` | （不要） |
| `.STACK` | （不要） |
| `.DATA` / `.CODE` | （不要。`ORG 100h` の一本構成） |
| `.STARTUP` | （不要。`ORG 100h` の先頭が入口） |
| `mov ax,DGROUP` / `mov ds,ax` | （不要。.COM は DS=CS=ES=SS） |
| `END` | （不要） |

`.COM` に落とせるなら**これが一番簡単**。リロケーションが無く、
ロードアドレスが `100h` 固定なので**デバッガのアドレス対応も自明**になる。

MZ EXE が必要な場合（データが 64KB を超える等）はセグメント宣言を
NASM の `segment` 疑似命令で書き直し、リンカ（`smlrl`）に渡す。

## 4. PROC / ENDP

```asm
; MASM
clear_text	PROC
	...
	ret
clear_text	ENDP

; NASM
clear_text:
	...
	ret
```

## 5. 先頭に付けるもの

```asm
	CPU	8086      ; 対象CPUを固定（8086を超える命令を誤って使わないため）
	BITS	16
	ORG	100h      ; .COM の場合
```

MASM の `.MODEL` にあたるものが無いので、明示的に書く。

## 6. 文字エンコーディング

**ソースは CP932（Shift-JIS）のまま扱うこと。UTF-8 に変換してはいけない。**

- PC-98 の画面に出すバイト列がそのまま SJIS である必要がある
- `iconv -f SHIFT_JIS` は **0x5C を ¥ に変換して壊す**。`-f CP932` を使う
  （詳細は別項 `feedback_sjis_source_cp932_not_shiftjis`）
- SJIS 2バイト目が 0x5C になる文字（十・表・能・予・申・貼・暴・構 …）は
  アセンブラによってはエスケープと誤解される。NASM は `'...'`（シングルクォート）内では
  エスケープ解釈をしないので**シングルクォートを使えば安全**
  （`"..."` はバックスラッシュエスケープが効くので避ける）

## 7. 未検証・今後の課題

- `SAKA.ASM` は **EMS（INT 67h）を27件**使う。実行環境に EMS ドライバが要る
- `SAKA.ASM` には `STRUC` / マクロ / 条件アセンブルはなかった。他資産は未調査
- `.OBJ`（OMF）を経由するリンクが必要なケース（複数ファイル構成）は未着手
- JWasm / UASM は Sybase Open Watcom Public License 1.0 で、BSD-2で揃える方針と
  合わないため採用しない。BSD系のMASM互換アセンブラも確認できず、一度だけNASM記法へ変換する

---

## 変換例（実物）

元 `A-GAMES/TEST.ASM`（1996, MASM, 455B）:

```asm
	.MODEL small
	.STACK
	.DATA
msg	DB	1Bh,'[10;8Hてすと中だぜぃ$'
	.CODE
	.STARTUP
	call	clear_text
	mov	ah,09h
	mov	dx,OFFSET msg
	int	21h
	call	go_dos
clear_text	PROC
	mov	ah,2h
	mov	dl,1ah
	int	21h
	ret
clear_text	ENDP
go_dos	PROC
	mov	ax,4c00h
	int	21h
go_dos	ENDP
	END
```

変換後（`samples/test_nasm.asm`）:

```asm
	CPU	8086
	BITS	16
	ORG	100h

start:
	call	clear_text
	mov	ah,09h
	mov	dx,msg		; MASM: mov dx,OFFSET msg
	int	21h
	call	go_dos

clear_text:			; MASM: clear_text PROC / ENDP
	mov	ah,02h
	mov	dl,1Ah		; PC-98: DL=1Ah でテキスト画面クリア
	int	21h
	ret

go_dos:
	mov	ax,4C00h
	int	21h

msg	db	1Bh,'[10;8Hてすと中だぜぃ$'
```

生成物 47 バイト。ホスト版 NASM の出力と sha256 一致。実行確認済み。
