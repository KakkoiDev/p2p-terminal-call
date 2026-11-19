# p2p-terminal-call

A text, audio and video call between two terminals. Proof of concept.

Page with the demo: https://kakkoidev.github.io/p2p-terminal-call/

- **Video**: camera -> ffmpeg -> raw rgb24 frames (default 80x48 pixels, 10 fps, ~115 KB/s),
  drawn with half blocks (`▀`) in 24-bit colour. Works inside tmux with no config.
- **Audio**: microphone -> ffmpeg -> 16 kHz mono s16le PCM (~32 KB/s) in 40 ms chunks, played
  with `ffplay`.
- **Text**: type a line, Enter sends it. Ctrl-C quits.

Messages travel through [p2p-core](https://github.com/KakkoiDev/p2p-core)'s server transport: both
sides connect to one small relay (the hub) over WebSocket. Runs in Node, no browser.

## Needs

- Node 22 or newer (uses the global `WebSocket`).
- `ffmpeg` and `ffplay` on the PATH (`brew install ffmpeg`).
- macOS for the camera and microphone (`avfoundation`). The first run asks for camera and
  microphone permission for the terminal app.
- A terminal with 24-bit colour: Ghostty, kitty, WezTerm, iTerm2. Inside tmux, the outer terminal
  must advertise RGB (`set -as terminal-features '*:RGB'`).
- A terminal of at least 80 columns by 26 rows for the default video size.
- **Headphones.** There is no echo cancellation; with speakers the call feeds back.

## How to use

### Install

Not on the npm registry. Install from GitHub, either once:

```sh
npm install -g github:KakkoiDev/p2p-terminal-call
```

which gives the `p2p-terminal-call` command. The existing `p2p-call`, `p2p-call-hub`, and
`p2p-call-demo` commands remain available. Or run without installing:

```sh
npx -y -p github:KakkoiDev/p2p-terminal-call p2p-terminal-call hub
npx -y -p github:KakkoiDev/p2p-terminal-call p2p-terminal-call call --server http://HUB:8787
```

From a clone: `npm install`, then `node hub.js` and `node call.js`. `npm test` runs the tests.

### Test on one machine

From inside tmux, run one command:

```sh
p2p-terminal-call demo
```

From a clone, use `npm install` once, then run `node demo.js` instead. The command starts a private
hub on a random local port and opens a tmux window with Alice and Bob in two panes. Both use
ffmpeg test sources, so no camera or microphone is needed.

Both panes should change from `waiting` to the other caller's name, show moving video at the top,
and show increasing `in v` counters. Bob's `in a` counter should also increase because Alice
sends a 440 Hz test tone. Type a line and press Enter; it should appear in both panes. Press
Ctrl-C in both panes to close the window; the launcher then stops the hub.

To test Alice with a real camera and microphone, wear headphones and run:

```sh
p2p-terminal-call demo --real
```

Use `node demo.js --real` from a clone. Bob plays Alice's microphone, and there is no echo
cancellation. On first use, macOS should ask whether Ghostty may access the camera and microphone.
Allow both prompts; if previously denied, enable Ghostty under **System Settings > Privacy &
Security > Camera** and **Microphone**, then run the command again. Test sources do not trigger
these prompts.

If the launcher is unavailable, the manual fallback is three panes:

```sh
p2p-terminal-call hub --host 127.0.0.1
p2p-terminal-call call --name alice --video lavfi:mandelbrot --audio test --audio-out off
p2p-terminal-call call --name bob --video test --audio off --audio-out off
```

Run one line in each pane. Device indexes can be selected with `--camera N` and `--mic N`; see
[Options](#options).

### Controls

- Type a line and press Enter to send it.
- Press Ctrl-C to quit a caller.
- Watch `in v` and `in a` in the status line for received video and audio messages.

For a call between two machines, follow [Call a friend](#call-a-friend).

## Call a friend

Both machines must reach the hub: the same LAN, or the same [Tailscale](https://tailscale.com)
tailnet. One side runs the hub; it can be one of the two callers.

1. Hub machine (say its Tailscale IP is `100.64.1.13`; `tailscale ip -4` prints it):

   ```sh
   p2p-terminal-call hub --host 100.64.1.13
   ```

   `--host 100.64.1.13` listens on the tailnet only. Leave `--host` out to listen on every
   network (default `0.0.0.0`, port `8787`; `--port N` changes it).

2. Pick a room name and send your friend the hub address and the room, e.g.
   `http://100.64.1.13:8787`, room `ours`.

3. You:

   ```sh
   p2p-terminal-call call --server http://100.64.1.13:8787 --room ours --name alice
   ```

4. Your friend:

   ```sh
   p2p-terminal-call call --server http://100.64.1.13:8787 --room ours --name bob
   ```

Your friend needs the same install and the same needs (Node, ffmpeg, a truecolor terminal,
headphones).

**Security.** The hub relays every message unencrypted, so whoever runs the hub can read the chat
and see and hear the call. Anyone who can reach the hub's address and knows the room name can
connect to that room and receive its messages. Use a hub you run yourself, on a tailnet or a LAN you trust; do not expose
the port to the internet. The hub serves only its own placeholder page, not the folder it was
started from.

## Options

`p2p-terminal-call call` (also available as `p2p-call`):

| Option | Default | |
|---|---|---|
| `--server URL` | `http://127.0.0.1:8787` | the hub address |
| `--room NAME` | `term-call` | both sides must match |
| `--name NAME` | `$USER` | shown to the other side |
| `--video camera\|test\|lavfi:SRC\|off` | `camera` | `lavfi:SRC` is any ffmpeg lavfi video source, e.g. `mandelbrot` |
| `--camera N`, `--mic N` | `0` | avfoundation device index: `ffmpeg -f avfoundation -list_devices true -i ""` |
| `--audio mic\|test\|off` | `mic` | |
| `--audio-out speaker\|file:PATH\|off` | `speaker` | `file:PATH` appends the received PCM to a file |
| `--size WxH` | `80x48` | pixels; the terminal needs W columns and H/2 rows for the video |
| `--fps N` | `10` | |
| `--headless` | | no drawing; log lines and, on exit, a JSON line of message counts |
| `--say TEXT` | | send TEXT when a peer joins |
| `--duration S` | | quit after S seconds |

`p2p-terminal-call hub` (also available as `p2p-call-hub`): `--host` (default `0.0.0.0`),
`--port` (default `8787`).

`p2p-terminal-call demo` (also available as `p2p-call-demo`): `--real` uses the real camera and
microphone for Alice instead of test sources.

## Limits

- The hub sees every message, and binary is base64 on the wire (~155 KB/s of video).
- No codec, no jitter buffer, no lip sync. Messages are ordered and reliable, so a lossy link
  stalls audio behind lost packets. Fine on a LAN or Tailscale.
- Two people per room. One call per process.
- Camera and microphone capture are macOS only (`avfoundation`). The test sources work anywhere
  ffmpeg runs.
- Video frame rate is bounded by the terminal: each 80x48 frame is ~75 KB of escape codes. Above
  ~10 fps inside tmux expect lag; frames are dropped while the terminal is still drawing.
- Tested: two processes on one machine, through the hub, with test sources, plus real camera and
  microphone data delivery. Not yet tested: confirming audio playback through headphones or two
  machines over Tailscale.

## License

MIT
