export const DOS_PROMPT_PATTERN = /(?:^|\n)\s*[A-Z]:?\\?>\s*(?:\n|$)/i;
export const DOS_DRIVE_ERROR_PATTERN = /(?:中止\s*\(A\).*無視\s*\(I\).*再試行\s*\(R\).*失敗\s*\(F\)|Abort.*Retry.*Fail)/is;

export function currentDosPrompt(screen) {
  if (!screen?.cursor) return null;
  const line = screen.lines[screen.cursor.row];
  return typeof line === 'string' && DOS_PROMPT_PATTERN.test(line) ? line : null;
}
