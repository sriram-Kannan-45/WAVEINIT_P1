// Quick offline verification of backend file-signature validation.
// Run: node test/scripts/verify-file-signatures.js
const path = require('node:path');
const v = require(path.join(__dirname, '..', '..', 'backend', 'src', 'security', 'fileValidator'));

const zip = () => Buffer.concat([Buffer.from('PK'), Buffer.from([0x03, 0x04]), Buffer.from('body')]);
const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const pdf = () => Buffer.from('%PDF-1.4\n1 0 obj\n');
const mz = () => Buffer.from('MZ\x90\x00Windows PE');
const elf = () => Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x00, 0x00]);

const cases = [
  { name: 'real.pdf', buf: pdf(), want: true, sig: 'pdf' },
  { name: 'docx-docx', buf: zip(), want: true, sig: 'zip' },
  { name: 'notes.txt', buf: Buffer.from('plain readable text\nsecond line'), want: true, sig: 'text' },
  { name: 'pdf named .docx', buf: pdf(), want: false },
  { name: 'zip named .pdf', buf: zip(), want: false },
  { name: 'text named .pdf', buf: Buffer.from('not really a pdf'), want: false },
  { name: 'exe named .pdf', buf: mz(), want: false },
  { name: 'elf named .docx', buf: elf(), want: false },
  { name: 'png named .pdf', buf: png(), want: false },
  { name: 'exe named .txt', buf: mz(), want: false },
  { name: 'binary unknown', buf: Buffer.from([0x00, 0x01, 0x02, 0x00, 0x00]), want: false },
];

let failed = 0;
for (const c of cases) {
  const res = v.validateFileSignature(c.buf, c.name);
  const ok = res.valid === c.want;
  const sigOk = c.sig ? v.detectFileSignature(c.buf) === c.sig : true;
  if (!ok || !sigOk) failed += 1;
  console.log(
    `${ok && sigOk ? 'PASS' : 'FAIL'}  ${res.valid ? 'ACCEPT' : 'REJECT'}  ${c.name.padEnd(18)} sig=${v.detectFileSignature(c.buf).padEnd(7)} ${res.error || ''}`
  );
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} signature cases behaved as expected`);