# Changelog

## 0.1.0 - 2026-11-18

- `p2p-call`: text, audio and video call between two terminals, moved out of p2p-core's
  `examples/terminal-call/` (p2p-core commit d4fcecc on branch `fm/p2p-call-poc`). Same behaviour.
- `p2p-call-hub`: runs p2p-core's server with a placeholder page as its file root, so the hub
  does not publish the folder it was started from.
- Depends on p2p-core from GitHub, pinned to commit a7057e2.
- GitHub Pages site in `docs/`.
