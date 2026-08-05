import assert from 'node:assert/strict';

const bytes = (value) => new Uint8Array(Buffer.from(value, 'base64'));

function byteDiff(left, right) {
  const length = Math.max(left.length, right.length);
  let different = 0;
  let bitDifferences = 0;
  let first = -1;
  let last = -1;
  for (let index = 0; index < length; index++) {
    const a = left[index] ?? -1;
    const b = right[index] ?? -1;
    if (a === b) continue;
    if (first < 0) first = index;
    last = index;
    different++;
    if (a >= 0 && b >= 0) {
      let xor = a ^ b;
      while (xor) { bitDifferences += xor & 1; xor >>>= 1; }
    } else {
      bitDifferences += 8;
    }
  }
  return { different, bitDifferences, first, last };
}

function canvasDiff(leftState, rightState) {
  const left = bytes(leftState.base64);
  const right = bytes(rightState.base64);
  const pixelCount = Math.max(left.length, right.length) / 4;
  let differentPixels = 0;
  let minX = Infinity; let minY = Infinity; let maxX = -1; let maxY = -1;
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    if (left[offset] === right[offset] && left[offset + 1] === right[offset + 1]
        && left[offset + 2] === right[offset + 2] && left[offset + 3] === right[offset + 3]) continue;
    differentPixels++;
    const x = pixel % leftState.width;
    const y = Math.floor(pixel / leftState.width);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return {
    differentPixels,
    bounds: differentPixels ? { minX, minY, maxX, maxY, origin: leftState.origin } : null,
  };
}

function textLineDiff(left, right) {
  const a = (left ?? '').split('\n');
  const b = (right ?? '').split('\n');
  const lines = [];
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (a[index] !== b[index]) lines.push({ line: index + 1, original: a[index] ?? '', converted: b[index] ?? '' });
  }
  return lines;
}

export function compareSakaCheckpoints(original, converted) {
  const differences = [];
  assert.equal(original.variant, 'original', '比較左辺がoriginalではありません');
  assert.equal(converted.variant, 'converted', '比較右辺がconvertedではありません');
  assert.equal(converted.checkpoints.length, original.checkpoints.length, 'チェックポイント数が一致しません');
  for (let index = 0; index < original.checkpoints.length; index++) {
    const left = original.checkpoints[index];
    const right = converted.checkpoints[index];
    assert.equal(right.name, left.name, `checkpoint ${index + 1}の名前が一致しません`);
    assert.equal(right.keyBefore, left.keyBefore, `${left.name}の入力列が一致しません`);
    if (left.state.tvram.sha256 !== right.state.tvram.sha256) {
      differences.push({ checkpoint: left.name, kind: 'tvram',
        ...byteDiff(bytes(left.state.tvram.base64), bytes(right.state.tvram.base64)),
        textLines: textLineDiff(left.state.tvram.text, right.state.tvram.text) });
    }
    assert.equal(right.state.gvram.regions.length, left.state.gvram.regions.length,
      `${left.name}のGVRAM領域数が一致しません`);
    for (let region = 0; region < left.state.gvram.regions.length; region++) {
      const a = left.state.gvram.regions[region];
      const b = right.state.gvram.regions[region];
      assert.equal(b.address, a.address, `${left.name}のGVRAM領域順が一致しません`);
      if (a.sha256 !== b.sha256) {
        differences.push({ checkpoint: left.name, kind: 'gvram', address: a.address,
          ...byteDiff(bytes(a.base64), bytes(b.base64)) });
      }
    }
    assert.equal(right.state.canvas.width, left.state.canvas.width, `${left.name}のcanvas幅が一致しません`);
    assert.equal(right.state.canvas.height, left.state.canvas.height, `${left.name}のcanvas高さが一致しません`);
    assert.equal(right.state.canvas.origin, left.state.canvas.origin, `${left.name}のcanvas原点が一致しません`);
    if (left.state.canvas.sha256 !== right.state.canvas.sha256) {
      differences.push({ checkpoint: left.name, kind: 'canvas',
        ...canvasDiff(left.state.canvas, right.state.canvas) });
    }
  }
  return { equal: differences.length === 0, checkpoints: original.checkpoints.length, differences };
}

export function validateSakaEquivalence(original, converted) {
  const result = compareSakaCheckpoints(original, converted);
  assert.equal(result.equal, true, `画面不一致: ${JSON.stringify(result.differences)}`);
  return result;
}
