import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const createNasm = require('./nasm.js');

const cases = [
  {
    source: '../../samples/hello.asm',
    expectedSize: 28,
    expectedSha256: '7882c8cff9addfb9c56cf3061ac11cbf0ea80bd989027950b59ed04df11f46a7',
  },
  {
    source: '../../samples/test_nasm.asm',
    expectedSize: 47,
    expectedSha256: 'b546f96789622d56a1026cc7ff25421aca7df3ff38bfc3f89e367ca7fea687e9',
  },
];

let failed = false;

for (const testCase of cases) {
  // Use a fresh module because NASM's main function has process-global state.
  const module = await createNasm();
  const sourceUrl = new URL(testCase.source, import.meta.url);
  const input = await readFile(sourceUrl); // Preserve CP932 bytes verbatim.

  module.FS.writeFile('/in.asm', input);
  module.callMain(['-f', 'bin', '-o', '/out.com', '/in.asm']);

  const output = module.FS.readFile('/out.com');
  const actualSha256 = createHash('sha256').update(output).digest('hex');
  const name = sourceUrl.pathname.split('/').pop();
  const passed = output.byteLength === testCase.expectedSize
    && actualSha256 === testCase.expectedSha256;

  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${output.byteLength} bytes ${actualSha256}`);
  failed ||= !passed;
}

if (failed) {
  process.exitCode = 1;
}
