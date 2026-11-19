#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    real: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opt.help) {
  console.log(`Usage: p2p-call-demo [--real]

Open a tmux window with two local callers and a private temporary hub.
By default both callers use synthetic media. --real uses the camera and
microphone for Alice; wear headphones because Bob plays Alice's audio.`);
  process.exit(0);
}

if (!process.env.TMUX) {
  console.error('p2p-call-demo: run this command inside tmux');
  process.exit(1);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.join(root, 'hub.js');
const callPath = path.join(root, 'call.js');

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function shellCommand(args) {
  return args.map(shellQuote).join(' ');
}

function tmux(args, { allowFailure = false } = {}) {
  const result = spawnSync('tmux', args, { encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`tmux ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

function startHub() {
  const hub = spawn(process.execPath, [hubPath, '--host', '127.0.0.1', '--port', '0'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  hub.stderr.pipe(process.stderr);

  const ready = new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('hub did not start within 5 seconds')), 5000);
    hub.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    hub.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    hub.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`hub exited before startup (code ${code})`));
    });
  });
  return { hub, ready };
}

const { hub, ready } = startHub();
let windowId = null;
let stopping = false;
let hubExited = false;
let interrupted = false;
hub.once('exit', () => { hubExited = true; });

function stop() {
  if (stopping) return;
  stopping = true;
  if (hub.exitCode === null && hub.signalCode === null) hub.kill('SIGTERM');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    interrupted = true;
    if (windowId) tmux(['kill-window', '-t', windowId], { allowFailure: true });
    stop();
  });
}

function windowExists(id) {
  const result = tmux(['list-windows', '-a', '-F', '#{window_id}'], { allowFailure: true });
  return result.status === 0 && result.stdout.split('\n').includes(id);
}

try {
  const server = await ready;
  const alice = [process.execPath, callPath, '--server', server, '--name', 'alice'];
  if (opt.real) alice.push('--video', 'camera', '--audio', 'mic', '--audio-out', 'off');
  else alice.push('--video', 'lavfi:mandelbrot', '--audio', 'test', '--audio-out', 'off');

  const bob = [process.execPath, callPath, '--server', server, '--name', 'bob',
    '--video', 'test', '--audio', 'off', '--audio-out', opt.real ? 'speaker' : 'off'];

  const created = tmux(['new-window', '-d', '-P', '-F', '#{window_id}', '-n', 'p2p-call-demo',
    '-c', root, shellCommand(alice)]);
  windowId = created.stdout.trim();
  tmux(['split-window', '-h', '-t', windowId, '-c', root, shellCommand(bob)]);
  tmux(['select-layout', '-t', windowId, 'even-horizontal']);
  tmux(['select-window', '-t', windowId]);

  console.log(`p2p-call-demo: opened tmux window ${windowId}; press Ctrl-C in both panes to close it`);
  while (!interrupted && windowExists(windowId)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (hubExited && !stopping) throw new Error('hub stopped while demo window was open');
  }
} catch (error) {
  if (windowId) tmux(['kill-window', '-t', windowId], { allowFailure: true });
  console.error(`p2p-call-demo: ${error.message}`);
  process.exitCode = 1;
} finally {
  stop();
}
