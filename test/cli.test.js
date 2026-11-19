import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(root, 'p2p-terminal-call.js');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('demo subcommand delegates arguments to demo launcher', () => {
  const result = run(['demo', '--help']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Open a tmux window with two local callers/);
});

test('no arguments and --help print subcommand usage', () => {
  for (const args of [[], ['--help']]) {
    const result = run(args);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /demo \[--real\]/);
    assert.match(result.stdout, /call \.\.\./);
    assert.match(result.stdout, /hub \.\.\./);
  }
});

test('unknown subcommand prints usage and exits non-zero', () => {
  const result = run(['unknown']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown subcommand: unknown/);
  assert.match(result.stderr, /Usage: p2p-terminal-call/);
});
