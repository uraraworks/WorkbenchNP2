; 当時の A-GAMES/TEST.ASM (MASM, 455B) を NASM 記法へ変換
; 元は .MODEL small (MZ EXE) だが、ここでは .COM に落としている
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
