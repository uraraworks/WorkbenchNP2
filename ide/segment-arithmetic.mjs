/**
 * セグメントレジスタは16bitなので、MZのe_cs/e_ssがFFF0h（-16 paragraph）のような
 * 値でも、DOSの加減算結果は必ず16bitへ折り返す。
 */
export const segment16 = (value) => value & 0xffff;

export const loadedSegmentFromPsp = (psp, mzSegment) => segment16(psp + 0x10 + mzSegment);

export const pspFromLoadedSegment = (loadedSegment, mzSegment) => (
  segment16(loadedSegment - mzSegment - 0x10)
);

/** 8086のsegment:offsetが作る物理アドレスは20bitへ折り返す。 */
export const linear20 = (segment, offset) => ((segment * 16) + offset) & 0xfffff;
