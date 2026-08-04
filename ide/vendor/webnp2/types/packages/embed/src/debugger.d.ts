import type { WebNP2DebugTarget } from './engine.ts';
import type { DisasmLine, Registers } from './types.ts';
export interface PauseEvent {
    paused: boolean;
}
export interface BreakpointEvent {
    index: number;
    registers: Registers;
}
type Listener<T> = (event: T) => void;
/** 既存wasmデバッグAPIをまとめ、埋め込み側向けの状態変化イベントを付加する。 */
export declare class DebuggerController {
    private readonly target;
    private pauseListeners;
    private breakpointListeners;
    constructor(target: WebNP2DebugTarget);
    isBooted(): boolean;
    setPaused(paused: boolean): void;
    isPaused(): boolean;
    step(count: number): number;
    readRegisters(): Registers;
    disassemble(seg: number, off: number, count: number): DisasmLine[];
    setBreakpoint(index: number, seg: number, off: number, enabled: boolean): void;
    runUntilBreakpoint(maxSteps: number): number;
    readMemory(addr: number, len: number): Uint8Array;
    onPause(listener: Listener<PauseEvent>): () => void;
    onBreakpoint(listener: Listener<BreakpointEvent>): () => void;
}
export declare function createDebugger(target: WebNP2DebugTarget): DebuggerController;
export {};
