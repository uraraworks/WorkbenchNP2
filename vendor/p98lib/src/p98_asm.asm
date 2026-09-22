; p98_asm.asm - p98.c から抽出した最初の低レベルプリミティブ(out port,val)。
;
; unityビルド廃止(docs/design.md参照)にあたり、少なくとも1つのasm()プリミティブを
; 「本物の別ファイルのNASM→ELFオブジェクト化→リンク」経路へ移した。これは
; WorkbenchNP2 の toolchain/compile-core.mjs に追加された opts.extraLinkInputs
; (WorkbenchNP2 docs/smallerc-wasm.md参照)を使い、p98lib のCソース(ライブラリ側/
; ユーザー側)とは別にNASMでアセンブルし、リンク段だけで合流させる。
;
; 呼び出し規約(SmallerC huge model、実測で確認):
;   - 引数はスタック上、型によらず各4バイトスロットを占める。関数プロローグは
;     常に push ebp / movzx ebp, sp。呼び出し側は smlrc が生成する
;     "db 0x9A" + section .relot 経由の遠隔(far)呼び出しを自動で作るため、
;     呼ばれる側であるこのファイルは特別なことをする必要はなく、
;     プロローグ/エピローグをsmlrc生成コードに合わせるだけでよい。
;   - エピローグは "o32 leave" (0x66プレフィクス付きleave) + far return(retf)。
;     retfなのは huge model では全呼び出しがセグメントをまたぐ可能性がある
;     far callだから(WorkbenchNP2 toolchain/smallerc-src/v0100/cgx86.c の
;     コード生成を実際にコンパイルして確認した; 詳細はp98lib docs/design.md)。
;   - 引数オフセット([bp+8]=port(unsigned=2byteスロットだが型はword)、
;     [bp+12]=val(unsigned char))は、元のasm()ブロック時代にSmallerC自身が
;     出す "; loc x : (@N)" コメントを実測して決めた値をそのまま使っている。
;
; WorkbenchNP2側の実行検証(toolchain/verify-link-multi-object.mjs)で
; 「別ファイルのCとasmをhuge modelでリンクして実行し、末端の値を確認する」
; 経路自体は動作確認済み。p98lib側の検証は tools/verify.mjs (18項目)。

bits 16

section .text

    global _p98__outb
_p98__outb:
    push    ebp
    movzx   ebp, sp
    mov     dx, [bp+8]
    mov     al, [bp+12]
    out     dx, al
    o32 leave
    retf

; p98__blend_bits(seg, off, bits, mask) : void
;   dst = (dst & ~mask) | (bits & mask)   (1回のES:[bx]読み書きで実施)
;
; スプライト描画(p98_draw_sprite, src/p98.c)の速度が要る内側ループ用に追加した
; プリミティブ。引数の並び([bp+8]=seg, [bp+12]=off, [bp+16]=bits, [bp+20]=mask)は
; 既存の p98__fillmem と同じ4引数パターン(型によらず各4バイトスロット)を
; そのまま踏襲しており、新規に確認すべき事項は無い。VRAMセグメントをESへ直接
; ロードする点も既存プリミティブ(p98__peekb/pokeb)と同じで、DS正規化に依存しない。
;
; ビット選択は (old ^ ((old ^ bits) & mask)) という定石で計算する
; (mask=1の位置はbitsの値、mask=0の位置はoldの値になる)。
    global _p98__blend_bits
_p98__blend_bits:
    push    ebp
    movzx   ebp, sp
    mov     ax, [bp+8]      ; seg
    mov     es, ax
    mov     bx, [bp+12]     ; off
    mov     al, [es:bx]     ; old
    mov     cl, [bp+16]     ; bits
    mov     dl, [bp+20]     ; mask
    mov     ah, al
    xor     ah, cl          ; ah = old ^ bits
    and     ah, dl          ; ah = (old ^ bits) & mask
    xor     al, ah          ; al = old ^ ((old ^ bits) & mask)
    mov     [es:bx], al
    o32 leave
    retf

; p98__egc_row(seg, srcOff, dstOff, wordCount) : void
;   EGC有効中に呼ぶ想定。seg:srcOff から seg:dstOff へ wordCount ワードを
;   rep movsw で転送する(「転送元をワードで読む→書き込み先へワードで書く」の
;   対を1行ぶんまとめて行うプリミティブ、src/p98.c の p98_draw_sprite_vram 参照)。
;   読み・書きとも同じセグメント(同一プレーンのVRAM。転送元はオフセット
;   32000以降の余り、転送先は通常の画面オフセット)なので引数は1つでよい。
;   引数は他のプリミティブと同じ4バイトスロット([bp+8]=seg, [bp+12]=srcOff,
;   [bp+16]=dstOff, [bp+20]=wordCount)。
    global _p98__egc_row
_p98__egc_row:
    push    ebp
    movzx   ebp, sp
    push    ds
    mov     ax, [bp+8]      ; seg
    mov     ds, ax
    mov     es, ax
    mov     si, [bp+12]     ; srcOff
    mov     di, [bp+16]     ; dstOff
    mov     cx, [bp+20]     ; wordCount
    cld
    rep     movsw
    pop     ds
    o32 leave
    retf

; 2026-09、_p98__egc_row_masked(EGCマスクレジスタを毎ワード書き直す
; 1パス転送方式用)と_p98__copy_far_to_vram(Cのポインタをfar pointer化して
; VRAMへrep movsbするプリミティブ)はいずれも撤去した。
;
; _p98__egc_row_masked: 1パス方式(絵だけをVRAMへ置き、透明ドットの選別を
; EGCマスクレジスタ側で行う)自体を、2パス方式(現存のp98_vram_upload/
; p98_draw_sprite_vram)の約0.27倍(約3.7倍遅い)という実測(毎ワードの
; OUTが挟まるため rep movsw が使えなくなるのが主因)により不採用と
; 判断し、p98.c/include/p98.h側の呼び出し元ごと削除したため不要になった。
;
; _p98__copy_far_to_vram: Cの大きい静的配列のアドレスをhuge modelの
; far pointerへ変換してVRAMへ渡す処理が、ライブラリ内の無関係な静的
; データの増減で配置が変わると壊れる(無関係なメモリを読む)ことが
; 分かったため撤去した(docs/design.md「配置依存の不具合」節参照)。
; 呼び出し元(p98.cのVRAMアップロード全経路)はp98__pokeb()による
; 1バイトずつの直接書き込みへ置き換えてあり、Cのポインタをこのファイルへ
; far pointerとして渡す経路はこのライブラリから無くなっている。
;
; 経緯の詳細はdocs/design.md・docs/verify-log.md参照。

; p98__pokew4(off, wB, wR, wG, wI) : void
;   4プレーンぶんを1ワードずつ(=1プレーンあたり2バイト)まとめて書く。
;   src/p98.c の p98__vram_upload_pixels / p98__vram_store_inverted_mask が、
;   従来の「プレーンごと・1バイトごとにp98__pokeb()をfar call」する経路
;   (アップロード1回=32x32マスク付きで実測9.56ms、tools/probe_vram_upload_bench.c)
;   を置き換えるために追加した。1呼び出しでfar call 1回・4プレーン×2バイト
;   書けるため、呼び出し回数はバイト数×4プレーンからワード数まで1/8になる
;   (2026-09、docs/design.md参照)。
;
;   4プレーンのセグメント値はここに即値として持つ(Cのポインタは一切渡さない
;   方針を崩さないため。p98__copy_far_to_vram撤去の経緯はファイル冒頭コメント・
;   docs/design.md「配置依存の不具合」節参照)。**この4値は src/p98.c の
;   P98_SEG_PLANE_B/R/G/I と同じでなければならない。ずれた場合は
;   tests/probe_vram_upload_bytes.c(VRAM置き場のバイト列が元のp98_sprite_tと
;   一致することを見る一次検査)がFAILで検出する。**
;     B(青)=0xA800, R(赤)=0xB000, G(緑)=0xB800, I(輝度)=0xE000
;   B/R/Gは0x800刻みだがIだけ離れている(隣接しない)ため、計算せず4つとも
;   即値で書く。
;
;   引数は他のプリミティブと同じ4バイトスロット([bp+8]=off, [bp+12]=wB,
;   [bp+16]=wR, [bp+20]=wG, [bp+24]=wI)。off は4プレーン共通(各プレーンの
;   セグメントが違うだけで同じオフセット)。
    global _p98__pokew4
_p98__pokew4:
    push    ebp
    movzx   ebp, sp
    mov     bx, [bp+8]      ; off(4プレーン共通)

    mov     ax, 0xA800      ; P98_SEG_PLANE_B と同じ値であること(src/p98.c参照)
    mov     es, ax
    mov     ax, [bp+12]     ; wB
    mov     [es:bx], ax

    mov     ax, 0xB000      ; P98_SEG_PLANE_R と同じ値であること(src/p98.c参照)
    mov     es, ax
    mov     ax, [bp+16]     ; wR
    mov     [es:bx], ax

    mov     ax, 0xB800      ; P98_SEG_PLANE_G と同じ値であること(src/p98.c参照)
    mov     es, ax
    mov     ax, [bp+20]     ; wG
    mov     [es:bx], ax

    mov     ax, 0xE000      ; P98_SEG_PLANE_I と同じ値であること(src/p98.c参照)
    mov     es, ax
    mov     ax, [bp+24]     ; wI
    mov     [es:bx], ax

    o32 leave
    retf

; p98__egc_copy_page(seg, srcOff, dstOff, wordCount, bgPage, screenPage) : void
;   EGC有効中に呼ぶ想定(呼び出し側=src/p98.c の p98_copy_bgpage_to_screen()が
;   p98__egc_restore_rect()と同じEGC設定(access=0,fgbg=0,ope=0x08F0,mask=0xFFFF,
;   bg=0,sft=0,leng=0x000F)を先に済ませておく)。
;
;   「背景ページ→画面ページのまるごとコピー」用。p98__egc_restore_rect()
;   (src/p98.c)は同じ発想をCの二重ループ+p98__peekw/p98__pokewで実装しており、
;   1ワードごとにfar callが2回(peek/poke)+ポート0xA6のOUTが2回発生する。
;   画面全体(400行×80バイト=16000ワード)をそれで流すとfar callだけで32000回
;   かかるため、ループ自体をasm側へ落として呼び出し回数を1回(このfar call
;   そのもの)にする狙いで追加した(2026-09、docs/design.md「背景ページ→画面
;   ページのまるごとコピー」節参照)。
;
;   ループ内は「OUT(背景ページ)→ソースをワードで読む→OUT(画面ページ)→
;   デストへワードで書く」を1ワードずつ繰り返す(p98__egc_restore_rect()と
;   同じ順序をそのままasm化しただけ)。全画面コピーのようにsrcOff=dstOff=0・
;   wordCount=16000(400行×80バイト/2)を渡せば、行の継ぎ目もオフセットが
;   連続しているため1回のループで矩形(この場合は画面全体)ぜんたいをカバー
;   できる(P98_BYTES_PER_LINE=80×P98_SCREEN_H=400=32000バイトはページ内で
;   隙間無く連続しているため)。
;
;   ポート0xA6は既存の P98_PORT_DRAW_PAGE(src/p98.c)と同じ値であること
;   (asm側では即値0xA6のまま使う。ずれるとページ切替が効かず内容が化ける)。
;
;   引数は他のプリミティブと同じ4バイトスロット([bp+8]=seg, [bp+12]=srcOff,
;   [bp+16]=dstOff, [bp+20]=wordCount, [bp+24]=bgPage, [bp+28]=screenPage)。
;   srcOff・dstOffは同じセグメント(=同一プレーン、seg一本)内のオフセットで、
;   ページ(0xA6)の違いだけで背景/画面を読み分け・書き分ける。
;   Cのポインタは渡さない(既存プリミティブと同じ方針。ファイル冒頭コメント参照)。
    global _p98__egc_copy_page
_p98__egc_copy_page:
    push    ebp
    movzx   ebp, sp
    push    ds
    mov     ax, [bp+8]      ; seg
    mov     ds, ax
    mov     es, ax
    mov     si, [bp+12]     ; srcOff
    mov     di, [bp+16]     ; dstOff
    mov     cx, [bp+20]     ; wordCount
    test    cx, cx
    jz      .done
.loop:
    mov     dx, 0x0A6       ; P98_PORT_DRAW_PAGE と同じ値であること(src/p98.c参照)
    mov     al, [bp+24]     ; bgPage
    out     dx, al
    mov     bx, [si]        ; ソースワードを読む(背景ページ側)
    add     si, 2
    mov     dx, 0x0A6
    mov     al, [bp+28]     ; screenPage
    out     dx, al
    mov     [di], bx        ; デストへ書く(画面ページ側)
    add     di, 2
    dec     cx
    jnz     .loop
.done:
    pop     ds
    o32 leave
    retf
