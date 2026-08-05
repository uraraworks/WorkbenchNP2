; 同一DOSセッションでのデバッガローダ再実行・終了コード伝播テスト
	CPU	8086
	BITS	16
	ORG	100h

start:
	mov	ah,09h
	mov	dx,msg
	int	21h
	mov	ax,4C25h
	int	21h

msg	db	'Second debug run!', 0Dh, 0Ah, '$'
