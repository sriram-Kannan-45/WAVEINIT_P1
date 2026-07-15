export const captureFrameAsBase64 = (stream) => {
  if (!stream || !stream.active) return null;

  const video = document.createElement('video');
  video.srcObject = stream;
  video.play().catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.6);
};

// Backward-compatible alias used by the existing proctoring system
export const captureFrame = (stream, quality = 0.6) => {
  if (!stream || !stream.active) return null;

  const video = document.createElement('video');
  video.srcObject = stream;
  video.play().catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', quality);
};
