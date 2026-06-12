import { BadRequestException } from '@nestjs/common';
import { parseBuffer } from 'music-metadata';
import {
  MAX_AUDIO_DURATION_SECONDS,
  MAX_AUDIO_UPLOAD_BYTES,
  SUPPORTED_AUDIO_MIME_TYPES,
} from './audio-upload.constants';

export function normalizeAudioMimetype(audio: Express.Multer.File): string {
  let mimeType = audio.mimetype.toLowerCase();
  if (mimeType === 'application/octet-stream' && audio.originalname) {
    const ext = audio.originalname.split('.').pop()?.toLowerCase();
    const extensionToMime: Record<string, string> = {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      m4a: 'audio/m4a',
      mp4: 'audio/mp4',
      mpeg: 'audio/mpeg',
      mpga: 'audio/mpga',
      webm: 'audio/webm',
    };
    if (ext && extensionToMime[ext]) {
      mimeType = extensionToMime[ext];
      audio.mimetype = mimeType;
    }
  }
  return mimeType;
}

export function assertSupportedAudioUpload(audio: Express.Multer.File) {
  const mimeType = normalizeAudioMimetype(audio);

  if (audio.size > MAX_AUDIO_UPLOAD_BYTES) {
    throw new BadRequestException(
      `Audio file is too large. Maximum size is ${MAX_AUDIO_UPLOAD_BYTES / 1024 / 1024}MB.`,
    );
  }

  if (!SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) {
    throw new BadRequestException(
      'Unsupported audio type. Use wav, mp3, m4a, mp4, mpeg, mpga, or webm.',
    );
  }
}

export async function assertAudioDurationLimit(audio: Express.Multer.File) {
  const duration = await getAudioDurationSeconds(audio);

  if (duration === null) {
    return;
  }

  if (duration > MAX_AUDIO_DURATION_SECONDS) {
    throw new BadRequestException(
      `Audio duration is too long. Maximum duration is ${MAX_AUDIO_DURATION_SECONDS} seconds.`,
    );
  }
}

async function getAudioDurationSeconds(
  audio: Express.Multer.File,
): Promise<number | null> {
  try {
    const metadata = await parseBuffer(audio.buffer, audio.mimetype);

    return metadata.format.duration ?? getWavDurationSeconds(audio.buffer);
  } catch {
    return getWavDurationSeconds(audio.buffer);
  }
}

function getWavDurationSeconds(buffer: Buffer): number | null {
  if (buffer.length < 44) {
    return null;
  }

  if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
    return null;
  }

  if (buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let byteRate: number | null = null;
  let dataSize: number | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === 'fmt ' && chunkStart + 12 <= buffer.length) {
      byteRate = buffer.readUInt32LE(chunkStart + 8);
    }

    if (chunkId === 'data') {
      dataSize = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!byteRate || !dataSize) {
    return null;
  }

  return dataSize / byteRate;
}
