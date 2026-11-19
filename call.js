#!/usr/bin/env node
/**
 * terminal-call: a text, audio and video call between two terminals, over p2p-core.
 *
 * p2p-core carries messages and its Node media helpers drive ffmpeg capture and
 * playback. Video travels as raw rgb24 frames (kind 'vid'), audio as 16 kHz mono
 * s16le PCM (kind 'aud'), chat as strings (kind 'chat'). Video is drawn with half
 * blocks and 24-bit colour, which works inside tmux with no configuration. See
 * README.md for run steps.
 */
import { appendFileSync, createWriteStream } from 'node:fs';
import { parseArgs } from 'node:util';
import { joinRoom } from 'p2p-core';
import {
  captureAudio,
  captureVideo,
  createAudioPlayer,
  unpackAudioChunk,
  unpackVideoFrame,
} from 'p2p-core/extras/node-media.js';
import { frameRows } from './render.js';

const { values: opt } = parseArgs({
  options: {
    server: { type: 'string', default: 'http://127.0.0.1:8787' },
    room: { type: 'string', default: 'term-call' },
    name: { type: 'string', default: process.env.USER || 'me' },
    video: { type: 'string', default: 'camera' }, // camera | test | lavfi:SOURCE | off
    audio: { type: 'string', default: 'mic' }, // mic | test | off
    'audio-out': { type: 'string', default: 'speaker' }, // speaker | file:PATH | off
    camera: { type: 'string', default: '0' },
    mic: { type: 'string', default: '0' },
    size: { type: 'string', default: '80x48' },
    fps: { type: 'string', default: '10' },
    headless: { type: 'boolean', default: false },
    say: { type: 'string' },
    duration: { type: 'string' },
  },
});

const [W, H] = opt.size.split('x').map(Number);
const FPS = Number(opt.fps);
if (!(W > 0 && H > 0 && W * H * 3 + 4 <= 64 * 1024)) throw new Error(`--size ${opt.size}: needs W*H*3 <= 65532`);
const RATE = 16000;
const tty = !opt.headless && process.stdout.isTTY;

const room = joinRoom({
  app: 'term-call',
  room: opt.room,
  mode: 'offline',
  server: opt.server,
  protocol: 1,
  maxPeers: 2,
  profile: { name: opt.name.slice(0, 32) },
  validate: {
    chat: (d) => typeof d === 'string' && d.length > 0 && d.length <= 500,
    vid: (d) => unpackVideoFrame(d) !== null,
    aud: (d) => unpackAudioChunk(d) !== null,
  },
});

const stats = { sent: { vid: 0, aud: 0, chat: 0 }, recv: { vid: 0, aud: 0, chat: 0, audBytes: 0 } };
const chatLog = [];
const children = [];
let peerName = null;
let remoteFrame = null;
let input = '';

function canSend() { return room.peers().length > 0; }

if (opt.video !== 'off') {
  const capture = captureVideo({
    video: opt.video,
    camera: opt.camera,
    width: W,
    height: H,
    fps: FPS,
    onError: (error) => log(`ffmpeg: ${error.message}`),
  }, (message) => {
    if (!canSend()) return;
    room.send('vid', message);
    stats.sent.vid++;
  });
  children.push(capture);
}

if (opt.audio !== 'off') {
  const capture = captureAudio({
    audio: opt.audio,
    mic: opt.mic,
    rate: RATE,
    chunkMs: 40,
    onError: (error) => log(`ffmpeg: ${error.message}`),
  }, (message) => {
    if (!canSend()) return;
    room.send('aud', message);
    stats.sent.aud++;
  });
  children.push(capture);
}

// ---- media out -----------------------------------------------------------

const player = createAudioPlayer({ rate: RATE, onError: (error) => log(`ffplay: ${error.message}`) });
function playAudio(pcm) {
  const out = opt['audio-out'];
  if (out === 'off') return;
  if (out.startsWith('file:')) { appendFileSync(out.slice(5), pcm); return; }
  player.write(pcm);
}

room.onMessage('vid', (d) => {
  const frame = unpackVideoFrame(d);
  if (!frame) return;
  stats.recv.vid++;
  remoteFrame = { w: frame.width, h: frame.height, rgb: frame.data };
  drawVideo();
});

room.onMessage('aud', (d) => {
  const pcm = unpackAudioChunk(d);
  if (!pcm) return;
  stats.recv.aud++;
  stats.recv.audBytes += pcm.length;
  playAudio(pcm);
});

room.onMessage('chat', (text, from) => {
  stats.recv.chat++;
  log(`${nameOf(from)}: ${text}`);
});

const names = new Map();
function nameOf(id) {
  const p = room.peers().find((x) => x.id === id);
  if (p?.profile?.name) names.set(id, String(p.profile.name).slice(0, 32));
  return names.get(id) ?? id.slice(0, 6);
}

room.onPeerJoin((id) => {
  log(`* ${nameOf(id)} joined`);
  if (opt.say) { room.send('chat', opt.say); stats.sent.chat++; log(`${opt.name}: ${opt.say}`); }
});
room.onPeerUpdate((id) => { peerName = nameOf(id); drawStatus(); });
room.onPeerLeave((id) => { log(`* ${nameOf(id)} left`); peerName = null; remoteFrame = null; drawAll(); });

// ---- terminal ------------------------------------------------------------

const ESC = '\x1b[';
let videoRows = Math.ceil(H / 2);
// process.stdout writes to a TTY synchronously, so a slow terminal (tmux under
// load) would block the event loop and stall the network. An fs stream on fd 1
// writes from libuv's thread pool instead; video frames are dropped while it is
// behind.
const screen = tty ? createWriteStream('', { fd: 1 }) : null;

function rows() { return process.stdout.rows || 24; }

function write(s) { screen.write(s); }

function cursorToInput() { return `${ESC}${rows()};${3 + input.length}H${ESC}?25h`; }

function drawVideo() {
  if (!tty || !remoteFrame || screen.writableNeedDrain) return;
  videoRows = Math.ceil(remoteFrame.h / 2);
  const lines = frameRows(remoteFrame.rgb, remoteFrame.w, remoteFrame.h);
  let s = `${ESC}?2026h${ESC}?25l`;
  lines.forEach((line, i) => { s += `${ESC}${i + 1};1H${line}`; });
  write(s + cursorToInput() + `${ESC}?2026l`);
}

function drawStatus() {
  if (!tty) return;
  const server = room.status().transports.server?.state ?? 'off';
  const peer = peerName ? `with ${peerName}` : 'waiting';
  const line = `${opt.room}: ${peer} | ${server} | out v${stats.sent.vid} a${stats.sent.aud}`
    + ` | in v${stats.recv.vid} a${stats.recv.aud} | ^C quit`;
  write(`${ESC}${videoRows + 1};1H${ESC}7m${ESC}2K${line.slice(0, process.stdout.columns || 80)}${ESC}0m` + cursorToInput());
}

function drawChat() {
  if (!tty) return;
  const top = videoRows + 2;
  const height = Math.max(0, rows() - top);
  const shown = chatLog.slice(-height);
  let s = '';
  for (let i = 0; i < height; i++) s += `${ESC}${top + i};1H${ESC}2K${(shown[i] ?? '').slice(0, process.stdout.columns || 80)}`;
  s += `${ESC}${rows()};1H${ESC}2K> ${input}`;
  write(s + cursorToInput());
}

function drawAll() {
  if (!tty) return;
  write(`${ESC}2J`);
  if (remoteFrame) drawVideo();
  else {
    let s = '';
    for (let i = 0; i < videoRows; i++) s += `${ESC}${i + 1};1H${ESC}2K${i === Math.floor(videoRows / 2) ? '   (no video yet)' : ''}`;
    write(s);
  }
  drawStatus();
  drawChat();
}

function log(line) {
  // Peer text: strip control characters so it cannot move the cursor.
  const clean = line.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
  if (!tty) { console.log(clean); return; }
  chatLog.push(clean);
  if (chatLog.length > 200) chatLog.shift();
  drawChat();
}

function quit() {
  if (tty) write(`${ESC}?25h${ESC}?1049l`);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  for (const c of children) c.kill();
  player.stop();
  room.leave();
  if (!tty) console.log(`stats ${JSON.stringify(stats)}`);
  const exit = () => setTimeout(() => process.exit(0), 100);
  if (screen) screen.end(exit); else exit();
}

if (tty) {
  write(`${ESC}?1049h`);
  drawAll();
  process.stdout.on('resize', drawAll);
  setInterval(drawStatus, 1000);
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (keys) => {
    for (const k of keys) {
      if (k === '\x03') return quit();
      if (k === '\r' || k === '\n') {
        const text = input.trim().slice(0, 500);
        input = '';
        if (text) { room.send('chat', text); stats.sent.chat++; log(`${opt.name}: ${text}`); } else drawChat();
      } else if (k === '\x7f' || k === '\b') { input = input.slice(0, -1); drawChat(); }
      else if (k >= ' ') { input += k; drawChat(); }
    }
  });
} else if (!opt.duration) {
  // Piped stdin: each line is a chat message.
  let pending = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    pending += chunk;
    let i;
    while ((i = pending.indexOf('\n')) >= 0) {
      const text = pending.slice(0, i).trim().slice(0, 500);
      pending = pending.slice(i + 1);
      if (text) { room.send('chat', text); stats.sent.chat++; log(`${opt.name}: ${text}`); }
    }
  });
}

process.on('SIGINT', quit);
process.on('SIGTERM', quit);
if (opt.duration) setTimeout(quit, Number(opt.duration) * 1000);
