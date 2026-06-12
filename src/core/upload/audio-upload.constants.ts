export const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 60;

export const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/mpga',
  'audio/m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
]);

export const WAV_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
]);
