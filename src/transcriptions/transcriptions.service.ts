import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { TranscriptionStatus as PrismaTranscriptionStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { promises as fs } from 'node:fs';
import {
  PROCESS_TRANSCRIPTION_JOB,
  TRANSCRIPTION_QUEUE,
} from './constants/transcription-queue.constants';
import { CreateTranscriptionDto } from './dto/create-transcription.dto';
import { TranscriptionStatusResponse } from './dto/transcription-status-response.dto';
import { TranscriptionStatus } from './enums/transcription-status.enum';
import {
  formatTranscription,
  TranscriptionJobResponse,
} from './helpers/format-transcription.helper';
import { PrismaService } from '../prisma/prisma.service';
import { TranscriptionProcessingJobData } from './types/transcription-processing-job-data.type';

interface TextDownload {
  filename: string;
  content: string;
}

@Injectable()
export class TranscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TRANSCRIPTION_QUEUE)
    private readonly transcriptionQueue: Queue<TranscriptionProcessingJobData>,
  ) {}

  async create(
    dto: CreateTranscriptionDto,
    file: Express.Multer.File,
  ): Promise<TranscriptionJobResponse> {
    let shouldRemoveUploadedFile = true;

    try {
      const transcription = await this.prisma.transcriptionJob.create({
        data: {
          title: dto.title,
          originalFilename: file.originalname,
          storedFilename: file.filename,
          filePath: file.path,
          mimeType: file.mimetype,
          fileSize: file.size,
          language: dto.language,
          model: dto.model,
          fixPunctuation: dto.fixPunctuation,
          generateSummary: dto.generateSummary,
          status: PrismaTranscriptionStatus.pending,
          progress: 0,
          transcriptText: null,
          summary: null,
        },
      });
      shouldRemoveUploadedFile = false;

      await this.enqueueProcessingJob({
        transcriptionJobId: transcription.id,
        filePath: transcription.filePath,
        originalFilename: transcription.originalFilename,
      });

      return formatTranscription(transcription);
    } catch (error) {
      if (shouldRemoveUploadedFile) {
        await this.removeUploadedFile(file.path);
      }

      throw error;
    }
  }

  async findAll(): Promise<TranscriptionJobResponse[]> {
    const transcriptions = await this.prisma.transcriptionJob.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return transcriptions.map(formatTranscription);
  }

  async findOne(id: string): Promise<TranscriptionJobResponse> {
    const transcription = await this.prisma.transcriptionJob.findUnique({
      where: { id },
    });

    if (!transcription) {
      throw new NotFoundException('Transcripcion no encontrada.');
    }

    return formatTranscription(transcription);
  }

  async getStatus(id: string): Promise<TranscriptionStatusResponse> {
    const transcription = await this.prisma.transcriptionJob.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        progress: true,
        errorMessage: true,
        finishedAt: true,
      },
    });

    if (!transcription) {
      throw new NotFoundException('Transcripcion no encontrada.');
    }

    return {
      id: transcription.id,
      status: transcription.status as TranscriptionStatus,
      progress: transcription.progress,
      errorMessage: transcription.errorMessage ?? undefined,
      finishedAt: transcription.finishedAt?.toISOString(),
    };
  }

  async retry(id: string): Promise<TranscriptionJobResponse> {
    const transcription = await this.prisma.transcriptionJob.findUnique({
      where: { id },
    });

    if (!transcription) {
      throw new NotFoundException('Transcripcion no encontrada.');
    }

    if (transcription.status !== PrismaTranscriptionStatus.failed) {
      throw new BadRequestException(
        'Solo se puede reintentar una transcripcion fallida.',
      );
    }

    const updated = await this.prisma.transcriptionJob.update({
      where: { id },
      data: {
        status: PrismaTranscriptionStatus.pending,
        progress: 0,
        errorMessage: null,
        finishedAt: null,
        transcriptText: null,
        summary: null,
      },
    });

    await this.enqueueProcessingJob({
      transcriptionJobId: updated.id,
      filePath: updated.filePath,
      originalFilename: updated.originalFilename,
    });

    return formatTranscription(updated);
  }

  async getTxtDownload(id: string): Promise<TextDownload> {
    const transcription = await this.prisma.transcriptionJob.findUnique({
      where: { id },
    });

    if (!transcription) {
      throw new NotFoundException('Transcripcion no encontrada.');
    }

    return {
      filename: `${this.slugify(transcription.title)}.txt`,
      content:
        transcription.transcriptText ??
        'La transcripcion todavia no tiene contenido disponible.',
    };
  }

  async simulateProgress(id: string): Promise<TranscriptionJobResponse> {
    const transcription = await this.prisma.transcriptionJob.findUnique({
      where: { id },
    });

    if (!transcription) {
      throw new NotFoundException('Transcripcion no encontrada.');
    }

    if (transcription.status === PrismaTranscriptionStatus.failed) {
      throw new BadRequestException(
        'No se puede simular progreso sobre una transcripcion fallida.',
      );
    }

    const next = this.getNextSimulationState(transcription.status);

    const updated = await this.prisma.transcriptionJob.update({
      where: { id },
      data: {
        status: next.status,
        progress: next.progress,
        finishedAt:
          next.status === PrismaTranscriptionStatus.completed
            ? new Date()
            : null,
        transcriptText:
          next.status === PrismaTranscriptionStatus.completed
            ? this.buildCompletedMockTranscript(transcription.title)
            : transcription.transcriptText,
        summary:
          next.status === PrismaTranscriptionStatus.completed &&
          transcription.generateSummary
            ? 'Resumen mock: audio procesado correctamente y listo para reemplazar por IA real.'
            : transcription.summary,
      },
    });

    return formatTranscription(updated);
  }

  private getNextSimulationState(status: PrismaTranscriptionStatus): {
    status: PrismaTranscriptionStatus;
    progress: number;
  } {
    switch (status) {
      case PrismaTranscriptionStatus.pending:
      case PrismaTranscriptionStatus.uploading:
        return {
          status: PrismaTranscriptionStatus.processing_audio,
          progress: 25,
        };
      case PrismaTranscriptionStatus.processing_audio:
        return { status: PrismaTranscriptionStatus.transcribing, progress: 55 };
      case PrismaTranscriptionStatus.transcribing:
        return { status: PrismaTranscriptionStatus.merging, progress: 85 };
      case PrismaTranscriptionStatus.merging:
      case PrismaTranscriptionStatus.completed:
        return { status: PrismaTranscriptionStatus.completed, progress: 100 };
      default:
        return { status: PrismaTranscriptionStatus.pending, progress: 0 };
    }
  }

  private buildCompletedMockTranscript(title: string): string {
    return `Transcripcion mock finalizada para "${title}". Este texto permite integrar y probar el frontend hasta conectar el pipeline real de transcripcion.`;
  }

  private async enqueueProcessingJob(
    data: TranscriptionProcessingJobData,
  ): Promise<void> {
    try {
      await this.transcriptionQueue.add(PROCESS_TRANSCRIPTION_JOB, data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1_000,
        },
        removeOnComplete: {
          age: 86_400,
          count: 1_000,
        },
        removeOnFail: {
          age: 604_800,
        },
      });
    } catch {
      await this.prisma.transcriptionJob.update({
        where: { id: data.transcriptionJobId },
        data: {
          status: PrismaTranscriptionStatus.failed,
          errorMessage:
            'No pudimos encolar la transcripcion. Verifica que Redis este disponible.',
        },
      });

      throw new ServiceUnavailableException(
        'No se pudo iniciar el procesamiento en segundo plano. Verifica Redis.',
      );
    }
  }

  private slugify(value: string): string {
    const slug = value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'transcripcion';
  }

  private async removeUploadedFile(path: string): Promise<void> {
    try {
      await fs.unlink(path);
    } catch {
      return;
    }
  }
}
