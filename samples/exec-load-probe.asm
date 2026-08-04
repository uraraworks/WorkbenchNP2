; DOS EXEC 4B01h (load but do not execute) 対応確認用 .COM
; Ralf Brown's Interrupt ListのINT 21h/AX=4B01h定義と照合した。
; 返却領域はメモリ格納順で +0Eh=SP, +10h=SS, +12h=IP, +14h=CS。
; 人間向け表示ではこれをCS:IP / SS:SPへ並べ直す。
	CPU	8086
	BITS	16
	ORG	100h

start:
	push	cs
	pop	ds
	push	cs
	pop	es

	; 縮小後も自前領域に収まるスタックへ先に切り替える。
	mov	ax,cs
	mov	ss,ax
	mov	sp,stack_top

	mov	dx,msg_self
	call	print_string
	mov	ax,cs
	call	print_hex_word
	mov	dx,msg_crlf
	call	print_string

	; .COMのPSPからprogram_endまでだけを残し、EXEC用メモリを解放する。
	mov	bx,(program_end - $$ + 10Fh) / 16
	mov	ah,4Ah
	int	21h
	jc	shrink_error

	; EXECパラメータブロック内のfar pointerのsegmentを実行時CSで埋める。
	mov	ax,cs
	mov	[exec_params + 04h],ax
	mov	[exec_params + 08h],ax
	mov	[exec_params + 0Ch],ax

	; 4B01hは戻り時にSS:SP、DS、ESを含むレジスタを破壊し得る。
	; 戻り直後にも参照できるようCS相対の自前領域へ保存する。
	mov	ax,ss
	mov	[cs:saved_ss],ax
	mov	[cs:saved_sp],sp
	mov	ax,ds
	mov	[cs:saved_ds],ax
	mov	ax,es
	mov	[cs:saved_es],ax

	mov	dx,target_path
	mov	bx,exec_params
	mov	ax,4B01h
	int	21h

	; 壊れた可能性があるスタックには触れず、結果を先にCS相対へ保存する。
	mov	[cs:exec_ax],ax
	lahf
	mov	[cs:exec_flags],ah
	cli
	mov	ax,[cs:saved_ss]
	mov	ss,ax
	mov	sp,[cs:saved_sp]
	sti
	mov	ax,[cs:saved_ds]
	mov	ds,ax
	mov	ax,[cs:saved_es]
	mov	es,ax

	test	byte [cs:exec_flags],01h
	jnz	exec_error

	mov	dx,msg_ok_csip
	call	print_string
	mov	ax,[exec_params + 14h]	; initial CS
	call	print_hex_word
	mov	dl,':'
	call	print_char
	mov	ax,[exec_params + 12h]	; initial IP
	call	print_hex_word
	mov	dx,msg_sssp
	call	print_string
	mov	ax,[exec_params + 10h]	; initial SS
	call	print_hex_word
	mov	dl,':'
	call	print_char
	mov	ax,[exec_params + 0Eh]	; initial SP
	call	print_hex_word
	mov	dx,msg_crlf
	call	print_string
	jmp	wait_key

shrink_error:
	mov	bx,ax
	mov	dx,msg_4a_error
	call	print_string
	mov	ax,bx
	call	print_hex_word
	mov	dx,msg_crlf
	call	print_string
	jmp	wait_key

exec_error:
	mov	dx,msg_exec_error
	call	print_string
	mov	ax,[cs:exec_ax]
	call	print_hex_word
	mov	dx,msg_crlf
	call	print_string

wait_key:
	mov	ah,08h
	int	21h
	mov	ax,4C00h
	int	21h

print_string:
	mov	ah,09h
	int	21h
	ret

print_char:
	mov	ah,02h
	int	21h
	ret

print_hex_word:
	push	ax
	push	bx
	push	cx
	push	dx
	mov	bx,ax
	mov	cx,4
.digit:
	rol	bx,1
	rol	bx,1
	rol	bx,1
	rol	bx,1
	mov	dl,bl
	and	dl,0Fh
	add	dl,'0'
	cmp	dl,'9'
	jbe	.output
	add	dl,'A' - '9' - 1
.output:
	call	print_char
	loop	.digit
	pop	dx
	pop	cx
	pop	bx
	pop	ax
	ret

msg_self	db	'E0 SELF CS=', '$'
msg_ok_csip	db	'E0 4B01 OK CS:IP=', '$'
msg_sssp	db	' SS:SP=', '$'
msg_4a_error	db	'E0 4A ERROR AX=', '$'
msg_exec_error	db	'E0 4B01 ERROR AX=', '$'
msg_crlf	db	0Dh, 0Ah, '$'
target_path	db	'B:\HELLO.COM', 0
command_tail	db	0, 0Dh

; DOS EXEC parameter block (AL=01h): far pointerはoffset,segmentの順。
exec_params:
	dw	0			; +00h environment (0 = inherit)
	dw	command_tail, 0		; +02h command tail
	dw	5Ch, 0			; +06h FCB1 (PSP:005Ch)
	dw	6Ch, 0			; +0Ah FCB2 (PSP:006Ch)
	dw	0, 0			; +0Eh initial SP, SS (DOS output)
	dw	0, 0			; +12h initial IP, CS (DOS output)

saved_ss	dw	0
saved_sp	dw	0
saved_ds	dw	0
saved_es	dw	0
exec_ax	dw	0
exec_flags	db	0

	align	16, db 0
stack_bottom:
	times	512 db 0
stack_top:
program_end:
