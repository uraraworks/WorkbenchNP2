; 最小テスト — PC-98 / MS-DOS 用 .COM
; INT 21h AH=09h で文字列表示して終了するだけ
	CPU	8086
	BITS	16
	ORG	100h

start:
	mov	ah,09h
	mov	dx,msg
	int	21h
	mov	ax,4C00h
	int	21h

msg	db	'Hello, PC-98!', 0Dh, 0Ah, '$'
