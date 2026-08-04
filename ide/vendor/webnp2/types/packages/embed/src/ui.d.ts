import type { DisasmLine, Registers } from './types.ts';
export interface ComponentHandle {
    destroy(): void;
}
export interface RegisterViewHandle extends ComponentHandle {
    update(registers: Registers): void;
}
export interface DisassemblyViewHandle extends ComponentHandle {
    update(state: {
        seg: number;
        eip: number;
        lines: DisasmLine[];
        breakpoints: Set<string>;
    }): void;
    setLabels(labels: {
        addBreakpoint: string;
        removeBreakpoint: string;
    }): void;
}
export interface MemoryDumpLabels {
    address: string;
    read: string;
    invalidAddress: string;
}
export interface MemoryDumpHandle extends ComponentHandle {
    update(addr: number, bytes: Uint8Array): void;
    read(): void;
    setEnabled(enabled: boolean): void;
    setLabels(labels: MemoryDumpLabels): void;
}
export interface DebuggerToolbarHandle extends ComponentHandle {
    update(state: {
        enabled: boolean;
        paused: boolean;
        hasBreakpoints: boolean;
    }): void;
    setLabels(labels: DebuggerToolbarLabels): void;
}
export interface DebuggerToolbarLabels {
    pause: string;
    resume: string;
    step: string;
    step10: string;
    runToBreakpoint: string;
    close: string;
}
export declare function breakpointKey(seg: number, off: number): string;
export declare function mountDebuggerToolbar(container: HTMLElement, options: {
    labels: DebuggerToolbarLabels;
    onPauseToggle(): void;
    onStep(count: number): void;
    onRunToBreakpoint(): void;
    onClose(): void;
}): DebuggerToolbarHandle;
export declare function mountRegisterView(container: HTMLElement): RegisterViewHandle;
export declare function mountDisassemblyView(container: HTMLElement, options: {
    addBreakpointLabel: string;
    removeBreakpointLabel: string;
    onToggleBreakpoint(seg: number, off: number): void;
}): DisassemblyViewHandle;
export declare function mountMemoryDump(container: HTMLElement, options: {
    labels: MemoryDumpLabels;
    onRead(addr: number): Uint8Array;
    onError?(message: string): void;
}): MemoryDumpHandle;
