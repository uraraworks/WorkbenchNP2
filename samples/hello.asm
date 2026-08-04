; 最小テスト — PC-98 / MS-DOS 用 .COM
; INT 21h AH=09h で文字列表示して終了するだけ
	CPU	8086
	BITS	16
	ORG	100h

start:
	; 暫定実証専用: IDEビルドだけはRAM探索まで生存させる（入力消費・タイミング変化あり）。
	; 無改変バイナリや即時終了対象には使えないため、汎用デバッグ手段に流用しないこと。
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
