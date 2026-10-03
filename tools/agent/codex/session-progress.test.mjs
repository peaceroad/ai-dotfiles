import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from './session-progress.mjs';

function capture(terminal, columns = 80) {
  const lines = [], writes = [];
  let time = 0;
  const progress = createProgress(text => lines.push(text), {
    stream: { columns, write: text => writes.push(text) }, terminal, now: () => time,
  });
  return { progress, lines, writes, advance: value => { time += value; } };
}

test('terminal progress stays on one bounded line and clears before persistent output', () => {
  const c = capture(true, 40);
  c.progress.phase('Read saved files', 0, 100);
  for (let n = 1; n < 20; n++) { c.advance(10); c.progress.phase('Read saved files', n, 100); }
  assert.equal(c.writes.length, 1);
  c.advance(100); c.progress.bytes(1024 * 1024, 20 * 1024 * 1024);
  assert.equal(c.writes.length, 2);
  assert.ok(c.writes.every(text => text.startsWith('\r\x1b[2K') && !text.includes('\n') && text.slice(5).length <= 39));
  c.progress.log('Warning: fixture');
  assert.equal(c.writes.at(-1), '\r\x1b[2K');
  assert.deepEqual(c.lines, ['Warning: fixture']);
  const count = c.writes.length; c.progress.clear();
  assert.equal(c.writes.length, count);
});

test('redirected output keeps boundaries and completion with sparse intermediate updates', () => {
  const c = capture(false);
  c.progress.phase('Verify exports', 0, 100);
  for (let n = 1; n <= 14; n++) { c.advance(2000); c.progress.bytes(n * 1024); }
  assert.equal(c.lines.length, 1);
  c.advance(2000); c.progress.bytes(15 * 1024);
  assert.equal(c.lines.length, 2);
  c.progress.phase('Verify exports', 100, 100);
  c.progress.phase('Verify exports', 100, 100);
  assert.equal(c.lines.length, 3);
  assert.equal(c.lines.at(-1), 'Progress: Verify exports 100/100');
  c.progress.phase('Write receipt');
  assert.equal(c.lines.at(-1), 'Progress: Write receipt');
  assert.deepEqual(c.writes, []);
  assert.doesNotMatch(c.lines.join('\n'), /\x1b|\r/);
});

test('changing per-file stages does not flood redirected logs', () => {
  const c = capture(false);
  for (let n = 0; n < 100; n++) {
    c.progress.phase('Copy', n, 100);
    c.progress.phase('Render', n, 100);
    c.advance(10);
  }
  assert.equal(c.lines.length, 1);
  c.progress.phase('Prepare', 100, 100);
  assert.equal(c.lines.at(-1), 'Progress: Prepare 100/100');
});

test('nested reporters share the transient line and preserve errors and results', () => {
  const c = capture(true);
  const nested = createProgress(c.progress.log);
  assert.equal(nested, c.progress);
  nested.phase('Read source');
  c.progress.log('Error: fixture');
  assert.equal(c.writes.at(-1), '\r\x1b[2K');
  nested.phase('Read source');
  c.advance(300); nested.phase('Read source');
  assert.match(c.writes.at(-1), /Read source/);
  nested.log('Completed');
  assert.deepEqual(c.lines, ['Error: fixture', 'Completed']);
});
