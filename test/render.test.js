import test from 'node:test';
import assert from 'node:assert/strict';
import { frameRows, splitter } from '../render.js';

test('frameRows: two pixel rows become one cell row of upper half blocks', () => {
  // 2x2 pixels: top row red, green; bottom row blue, white.
  const rgb = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const rows = frameRows(rgb, 2, 2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0],
    '\x1b[38;2;255;0;0;48;2;0;0;255m▀' +
    '\x1b[38;2;0;255;0;48;2;255;255;255m▀' +
    '\x1b[0m');
});

test('frameRows: an odd last pixel row draws on a black background', () => {
  const rgb = Uint8Array.from([10, 20, 30]);
  assert.deepEqual(frameRows(rgb, 1, 1), ['\x1b[38;2;10;20;30;48;2;0;0;0m▀\x1b[0m']);
});

test('frameRows: a frame of the wrong size draws nothing', () => {
  assert.deepEqual(frameRows(new Uint8Array(5), 2, 2), []);
});

test('splitter: emits fixed-size frames across chunk boundaries', () => {
  const out = [];
  const push = splitter(4, (frame) => out.push([...frame]));
  push(Uint8Array.from([1, 2, 3]));
  push(Uint8Array.from([4, 5, 6, 7, 8, 9]));
  push(Uint8Array.from([10]));
  assert.deepEqual(out, [[1, 2, 3, 4], [5, 6, 7, 8]]);
  push(Uint8Array.from([11, 12]));
  assert.deepEqual(out, [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]);
});
