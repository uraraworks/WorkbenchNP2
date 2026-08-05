; PC98Dev guest debugger loader — target is loaded but never modified.
; Host handshake is a signature-bearing RAM control block. The host reads it through
; webnp2_mem_ptr and writes only CONTROL_RELEASE while the CPU is paused. This avoids
; paste-mailbox fallback keystrokes changing the target's input stream.
	CPU	8086
	BITS	16
	ORG	100h

CONTROL_VERSION	equ	3
STATE_READY	equ	1
STATE_EXITING	equ	2
STATE_ERROR	equ	0FFFFh
RELEASE_VALUE	equ	0A5h

start:
	push	cs
	pop	ds
	push	cs
	pop	es
	mov	ax,cs
	mov	[control_loader_psp],ax

	; PSP command tailの先頭引数を対象パスとして使う。引数なしはIDE互換の
	; B:\TARGET.COM。これにより同じローダをCOM/MZや別ドライブへ使い回せる。
	xor	cx,cx
	mov	cl,[80h]
	mov	si,81h
.skip_arg_spaces:
	jcxz	.arg_ready
	cmp	byte [si],' '
	jne	.copy_arg
	inc	si
	dec	cx
	jmp	.skip_arg_spaces
.copy_arg:
	mov	di,target_path
.copy_arg_byte:
	movsb
	loop	.copy_arg_byte
	mov	byte [es:di],0
.arg_ready:

	; The default COM stack is at the top of the original allocation. Move it into
	; the retained loader block before AH=4Ah releases the remainder.
	mov	ss,ax
	mov	sp,stack_top
	mov	bx,(program_end - $$ + 10Fh) / 16
	mov	ah,4Ah
	int	21h
	jc	publish_error

	; Read the MZ header before EXEC. For EXE, DOS returns relocated CS, so
	; PSP = initial_CS - e_cs - 10h. For COM, returned CS itself is the PSP.
	mov	dx,target_path
	mov	ax,3D00h
	int	21h
	jc	publish_error
	mov	bx,ax
	mov	dx,mz_header
	mov	cx,1Ch
	mov	ah,3Fh
	int	21h
	jc	read_failed
	mov	[header_bytes],ax
	mov	ah,3Eh
	int	21h
	jc	publish_error

	mov	byte [control_kind],0
	cmp	word [header_bytes],1Ch
	jb	prepare_exec
	mov	ax,[mz_header]
	cmp	ax,5A4Dh
	je	mark_exe
	cmp	ax,4D5Ah
	jne	prepare_exec
mark_exe:
	mov	byte [control_kind],1

prepare_exec:
	mov	ax,cs
	mov	[exec_params + 04h],ax
	mov	[exec_params + 08h],ax
	mov	[exec_params + 0Ch],ax

	; EXEC may destroy SS:SP, DS and ES. Save them in CS-relative storage and do
	; not touch the possibly-invalid returned stack until it has been restored.
	mov	ax,ss
	mov	[cs:saved_ss],ax
	mov	[cs:saved_sp],sp
	mov	ax,ds
	mov	[cs:saved_ds],ax
	mov	ax,es
	mov	[cs:saved_es],ax
	mov	byte [cs:control_exec_returns],0
	mov	ax,[cs:saved_sp]
	mov	[cs:control_parent_sp],ax
	mov	ax,[cs:saved_ss]
	mov	[cs:control_parent_ss],ax
	mov	dx,target_path
	mov	bx,exec_params
	mov	ax,4B01h
	int	21h
exec_return:
	inc	byte [cs:control_exec_returns]
	mov	[cs:exec_ax],ax
	mov	ax,sp
	mov	[cs:control_return_sp],ax
	mov	ax,ss
	mov	[cs:control_return_ss],ax
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
	cmp	byte [cs:control_exec_returns],1
	jne	child_returned
	test	byte [cs:exec_flags],1
	jnz	exec_failed

	; 4B01hのload-only後にDOSが認識する現在PSPを記録する。制御移譲前の
	; 観測専用であり、AH=50hによる切替はまだ行わない。
	mov	ah,51h
	int	21h
	mov	[control_current_psp],bx

	mov	ax,[exec_params + 0Eh]
	mov	[control_initial_sp],ax
	mov	ax,[exec_params + 10h]
	mov	[control_initial_ss],ax
	mov	ax,[exec_params + 12h]
	mov	[control_initial_ip],ax
	mov	ax,[exec_params + 14h]
	mov	[control_initial_cs],ax

	cmp	byte [control_kind],0
	je	.com_psp
	sub	ax,[mz_header + 16h]
	sub	ax,10h
.com_psp:
	mov	[control_target_psp],ax
	mov	byte [control_release],0
	; Publish state last so the host never observes partially-written register data.
	mov	word [control_state],STATE_READY

wait_for_host:
	cmp	byte [cs:control_release],RELEASE_VALUE
	jne	wait_for_host

	; DOS startup contract: DS=ES=PSP for both formats. COM additionally has
	; CS=SS=PSP; EXE uses the relocated SS:SP and CS:IP returned by 4B01h.
	; AX normally carries FCB drive validity; PC98Dev supplies no FCB arguments,
	; so zero is the documented non-error value and sufficient here.
	mov	ax,[cs:control_initial_ss]
	mov	bx,[cs:control_initial_sp]
	mov	dx,[cs:control_target_psp]
	cli
	mov	ss,ax
	mov	sp,bx
	mov	ds,dx
	mov	es,dx
	mov	ax,0
	; STI takes effect after the following far jump. The host's run-until-BP checks
	; CS:IP immediately after that jump, before the target's first instruction.
	sti
	jmp	far [cs:control_initial_ip]

child_returned:
	; DOS has restored the parent loader's SS:SP before following the child's
	; INT 22h vector here. Consume the child's status and return the same code
	; from the loader so COMMAND.COM observes the debug target's result.
	mov	ah,4Dh
	int	21h
	mov	[cs:control_child_return],ax
	mov	word [cs:control_state],STATE_EXITING
exit_ready:
	mov	ah,4Ch
	int	21h

read_failed:
	push	ax
	mov	ah,3Eh
	int	21h
	pop	ax
	jmp	publish_error

exec_failed:
	mov	ax,[cs:exec_ax]
publish_error:
	mov	[cs:control_error_ax],ax
	mov	word [cs:control_state],STATE_ERROR
.error_wait:
	jmp	.error_wait

target_path	db	'B:\TARGET.COM',0
	times	128-($-target_path) db 0
command_tail	db	0,0Dh
mz_header	times	1Ch db 0
header_bytes	dw	0

exec_params:
	dw	0
	dw	command_tail,0
	dw	5Ch,0
	dw	6Ch,0
	dw	0,0		; +0Eh SP, SS
	dw	0,0		; +12h IP, CS

saved_ss	dw	0
saved_sp	dw	0
saved_ds	dw	0
saved_es	dw	0
exec_ax	dw	0
exec_flags	db	0

	align	2, db 0
control:
	db	'PC98DEV1'
	dw	CONTROL_VERSION
control_state	dw	0
control_loader_psp	dw	0
control_target_psp	dw	0
control_kind	db	0		; 0=COM, 1=MZ EXE
	db	0
control_initial_sp	dw	0
control_initial_ss	dw	0
control_initial_ip	dw	0
control_initial_cs	dw	0
control_current_psp	dw	0
control_error_ax	dw	0
control_release	db	0
	db	0
control_exec_returns	db	0
	db	0
control_parent_sp	dw	0
control_parent_ss	dw	0
control_return_sp	dw	0
control_return_ss	dw	0
control_exec_return_ip	dw	exec_return
control_wait_ip	dw	wait_for_host
control_child_return	dw	0
control_exit_ready_ip	dw	exit_ready

	align	16, db 0
	times	512 db 0
stack_top:
program_end:
