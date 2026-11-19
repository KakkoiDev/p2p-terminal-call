#!/usr/bin/env node

const usage = `Usage: p2p-terminal-call <command> [options]

Commands:
  demo [--real]  Open a two-caller demo inside tmux
  call ...       Start a terminal caller
  hub ...        Start a relay hub

Run p2p-terminal-call demo --help for demo details.`;

const command = process.argv[2];

if (!command || command === '--help' || command === '-h') {
  console.log(usage);
  process.exit(0);
}

const entrypoints = {
  demo: './demo.js',
  call: './call.js',
  hub: './hub.js',
};

if (!entrypoints[command]) {
  console.error(`Unknown subcommand: ${command}\n\n${usage}`);
  process.exit(1);
}

process.argv.splice(2, 1);
await import(entrypoints[command]);
