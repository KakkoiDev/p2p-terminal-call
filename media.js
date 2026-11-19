export function videoInputArgs({ video, camera, width, height, fps }) {
  const lavfi = video === 'test' ? 'testsrc2' : video.startsWith('lavfi:') ? video.slice(6) : null;
  if (lavfi) return ['-re', '-f', 'lavfi', '-i', `${lavfi}=size=${width}x${height}:rate=${fps}`];

  // ffmpeg 8 defaults to yuv420p, which AVFoundation cameras commonly reject.
  return ['-f', 'avfoundation', '-framerate', '30', '-video_size', '640x480',
    '-pixel_format', 'uyvy422', '-i', `${camera}:none`, '-vf', `fps=${fps},scale=${width}:${height},hflip`];
}
