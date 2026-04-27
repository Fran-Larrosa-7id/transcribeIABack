import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { diskStorage } from 'multer';
import { CreateTranscriptionDto } from './dto/create-transcription.dto';
import { TranscriptionStatusResponse } from './dto/transcription-status-response.dto';
import { audioFileFilter } from './helpers/audio-file-filter.helper';
import { TranscriptionJobResponse } from './helpers/format-transcription.helper';
import { TranscriptionsService } from './transcriptions.service';

const uploadDir = process.env.UPLOAD_DIR ?? 'uploads/transcriptions';
const maxAudioFileSizeMb = Number(process.env.MAX_AUDIO_FILE_SIZE_MB ?? 500);

const sanitizeBaseName = (filename: string): string =>
  filename
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'audio';

@Controller('transcriptions')
export class TranscriptionsController {
  constructor(private readonly transcriptionsService: TranscriptionsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          mkdirSync(uploadDir, { recursive: true });
          callback(null, uploadDir);
        },
        filename: (_request, file, callback) => {
          const extension = extname(file.originalname).toLowerCase();
          const storedFilename = `${sanitizeBaseName(file.originalname)}-${Date.now()}-${randomUUID()}${extension}`;
          callback(null, storedFilename);
        },
      }),
      fileFilter: audioFileFilter,
      limits: {
        fileSize: maxAudioFileSizeMb * 1024 * 1024,
      },
    }),
  )
  async create(
    @Body() createTranscriptionDto: CreateTranscriptionDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<TranscriptionJobResponse> {
    if (!file) {
      throw new BadRequestException('El archivo de audio es obligatorio.');
    }

    return this.transcriptionsService.create(createTranscriptionDto, file);
  }

  @Get()
  findAll(): Promise<TranscriptionJobResponse[]> {
    return this.transcriptionsService.findAll();
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string): Promise<TranscriptionStatusResponse> {
    return this.transcriptionsService.getStatus(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<TranscriptionJobResponse> {
    return this.transcriptionsService.findOne(id);
  }

  @Patch(':id/retry')
  retry(@Param('id') id: string): Promise<TranscriptionJobResponse> {
    return this.transcriptionsService.retry(id);
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Query('format') format: string = 'txt',
    @Res() response: Response,
  ): Promise<void> {
    if (format !== 'txt') {
      throw new BadRequestException(
        `El formato "${format}" todavia no esta implementado. Por ahora use format=txt.`,
      );
    }

    const download = await this.transcriptionsService.getTxtDownload(id);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${download.filename}"`,
    );
    response.send(download.content);
  }

  @Patch(':id/simulate-progress')
  // Development-only compatibility endpoint. The frontend should poll GET /transcriptions/:id now.
  simulateProgress(@Param('id') id: string): Promise<TranscriptionJobResponse> {
    return this.transcriptionsService.simulateProgress(id);
  }
}
