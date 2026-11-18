#!/usr/bin/env node
/**
 * p2p-call-hub: the relay both sides of a call connect to.
 *
 * Runs p2p-core's server with its file root set to hub-root/, which holds only
 * an index.html, so the hub does not publish the folder it was started from.
 *
 *   p2p-call-hub [--host 0.0.0.0] [--port 8787]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { startServer } from 'p2p-core/server';

const { values: opt } = parseArgs({
  options: {
    host: { type: 'string', default: '0.0.0.0' },
    port: { type: 'string', default: '8787' },
  },
});

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hub-root');
const server = await startServer({ root, host: opt.host, port: Number(opt.port), log: () => {} });
console.log('p2p-call-hub: anyone who can reach these addresses can join a room and read its traffic.');
const urls = opt.host === '0.0.0.0' ? server.urls : [`http://${opt.host}:${server.port}/`];
for (const url of urls) console.log(`  ${url}`);
