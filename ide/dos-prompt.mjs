export const DOS_PROMPT_PATTERN = /(?:^|\n)\s*[A-Z]:?\\?>\s*(?:\n|$)/i;

export function currentDosPrompt(screen) {
  if (!screen?.cursor) return null;
  const line = screen.lines[screen.cursor.row];
  return typeof line === 'string' && DOS_PROMPT_PATTERN.test(line) ? line : null;
}
