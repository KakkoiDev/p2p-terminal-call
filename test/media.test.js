import test from 'node:test';
import assert from 'node:assert/strict';
import { videoInputArgs } from 'p2p-core/extras/node-media.js';

test('videoInputArgs: camera selects a supported AVFoundation pixel format', () => {
  assert.deepEqual(videoInputArgs({ video: 'camera', camera: '2', width: 80, height: 48, fps: 10 }), [
    '-f', 'avfoundation', '-framerate', '30', '-video_size', '640x480',
    '-pixel_format', 'uyvy422', '-i', '2:none', '-vf', 'fps=10,scale=80:48,hflip',
  ]);
});

test('videoInputArgs: test source remains a realtime lavfi input', () => {
  assert.deepEqual(videoInputArgs({ video: 'test', camera: '0', width: 40, height: 24, fps: 5 }), [
    '-re', '-f', 'lavfi', '-i', 'testsrc2=size=40x24:rate=5',
  ]);
});
