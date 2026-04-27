import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

export const ALLOWED_AUDIO_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.m4a',
  '.ogg',
  '.webm',
  '.mp4',
] as const;

export const audioFileFilter = (
  _request: Express.Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
): void => {
  const extension = extname(file.originalname).toLowerCase();

  if (
    !ALLOWED_AUDIO_EXTENSIONS.includes(
      extension as (typeof ALLOWED_AUDIO_EXTENSIONS)[number],
    )
  ) {
    callback(
      new BadRequestException(
        `Formato de audio no permitido. Extensiones validas: ${ALLOWED_AUDIO_EXTENSIONS.join(', ')}`,
      ),
      false,
    );
    return;
  }

  callback(null, true);
};
