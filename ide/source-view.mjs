/** IDEとSAKA実証画面で共有するソース行・BP・停止行の描画。 */
export function renderSourceLines(container, {
  sourceLines, sourceMap, currentLine, selectedLine, programCs, onToggleBreakpoint = () => {},
}) {
  container.replaceChildren();
  const mappedLines = new Set(sourceMap.map((entry) => entry.srcLine));
  sourceLines.forEach((text, index) => {
    const line = index + 1;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'source-line';
    row.dataset.sourceLine = String(line);
    row.dataset.text = text;
    if (mappedLines.has(line)) row.dataset.debuggable = 'true';
    if (line === currentLine) row.classList.add('current');
    if (line === selectedLine) row.classList.add('breakpoint');
    row.disabled = !mappedLines.has(line) || programCs === undefined;
    const number = document.createElement('span'); number.className = 'line-number'; number.textContent = String(line);
    const marker = document.createElement('span'); marker.className = 'line-marker';
    marker.textContent = line === selectedLine ? '●' : '';
    const code = document.createElement('code'); code.textContent = text || ' ';
    row.append(number, marker, code);
    row.addEventListener('click', () => onToggleBreakpoint(line));
    container.append(row);
  });
}
