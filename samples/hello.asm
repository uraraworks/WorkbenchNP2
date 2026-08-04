; 最小テスト — PC-98 / MS-DOS 用 .COM
; INT 21h AH=09h で文字列表示して終了するだけ
	CPU	8086
	BITS	16
	ORG	100h

start:
	; IDEビルドだけはロード済みCOMをRAMで同定してCSを確定するまで入力を待つ。
%ifdef PC98DEV_IDE
	mov	ah,08h
	int	21h
%endif
	mov	ah,09h
	mov	dx,msg
	int	21h
	mov	ax,4C00h
	int	21h

msg	db	'Hello, PC-98!', 0Dh, 0Ah, '$'
