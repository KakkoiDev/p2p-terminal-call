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

## Install

Not on the npm registry. Install from GitHub, either once:

```sh
npm install -g github:KakkoiDev/p2p-terminal-call
```

which gives two commands, `p2p-call` and `p2p-call-hub`, or run without installing:

```sh
npx -y -p github:KakkoiDev/p2p-terminal-call p2p-call-hub
npx -y -p github:KakkoiDev/p2p-terminal-call p2p-call --server http://HUB:8787
```

From a clone: `npm install`, then `node hub.js` and `node call.js`. `npm test` runs the tests.

## Start locally: one machine, two terminals

No camera or microphone needed: `--video test` and `--audio test` use ffmpeg test sources (a
colour pattern, a 440 Hz tone).

```sh
p2p-call-hub --host 127.0.0.1                                                    # terminal 1
p2p-call --name alice --video lavfi:mandelbrot --audio test --audio-out off      # terminal 2
p2p-call --name bob --video test --audio off --audio-out off                     # terminal 3
```

Both sides show the other's video at the top, a status line (`in v` / `in a` count received video
and audio messages), the chat below, and the input line at the bottom. Drop `--audio-out off` on
one side to hear the tone.

## Call a friend

Both machines must reach the hub: the same LAN, or the same [Tailscale](https://tailscale.com)
tailnet. One side runs the hub; it can be one of the two callers.

1. Hub machine (say its Tailscale IP is `100.64.1.13`; `tailscale ip -4` prints it):

   ```sh
   p2p-call-hub --host 100.64.1.13
   ```

   `--host 100.64.1.13` listens on the tailnet only. Leave `--host` out to listen on every
   network (default `0.0.0.0`, port `8787`; `--port N` changes it).

2. Pick a room name and send your friend the hub address and the room, e.g.
   `http://100.64.1.13:8787`, room `ours`.

3. You:

   ```sh
   p2p-call --server http://100.64.1.13:8787 --room ours --name alice
   ```

4. Your friend:

   ```sh
   p2p-call --server http://100.64.1.13:8787 --room ours --name bob
   ```

Your friend needs the same install and the same needs (Node, ffmpeg, a truecolor terminal,
headphones).

**Security.** The hub relays every message unencrypted, so whoever runs the hub can read the chat
and see and hear the call. Anyone who can reach the hub's address and knows the room name can
connect to that room and receive its messages. Use a hub you run yourself, on a tailnet or a LAN you trust; do not expose
the port to the internet. The hub serves only its own placeholder page, not the folder it was
started from.

## Options

`p2p-call`:

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

`p2p-call-hub`: `--host` (default `0.0.0.0`), `--port` (default `8787`).

## Limits

- The hub sees every message, and binary is base64 on the wire (~155 KB/s of video).
- No codec, no jitter buffer, no lip sync. Messages are ordered and reliable, so a lossy link
  stalls audio behind lost packets. Fine on a LAN or Tailscale.
- Two people per room. One call per process.
- Camera and microphone capture are macOS only (`avfoundation`). The test sources work anywhere
  ffmpeg runs.
- Video frame rate is bounded by the terminal: each 80x48 frame is ~75 KB of escape codes. Above
  ~10 fps inside tmux expect lag; frames are dropped while the terminal is still drawing.
- Tested: two processes on one machine, through the hub, with test sources. Not yet tested: a real
  camera and microphone, two machines over Tailscale.

## License

MIT
