; samples/link-probe.c から呼ばれる別ファイルのアセンブラ関数。
; smallerc-src/v0100/tests/lnktst1b.asm と同じ形(bits 16, section .text, global)。
; x86のデフォルトはリーディングアンダースコア付き(-leading-underscore)なので、
; C側の asm_marker() はここでは _asm_marker というラベルになる。
; 呼び出し規約(smlrc.md「Calling conventions」): 戻り値はAXへ。引数無しなので
; スタック操作は不要、呼び出し側がスタックを片付ける。

bits 16

section .text

    global _asm_marker
_asm_marker:
    mov ax, 0x1234
    ret
