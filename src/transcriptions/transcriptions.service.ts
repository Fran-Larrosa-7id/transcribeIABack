import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TranscriptionStatus as PrismaTranscriptionStatus } from '@prisma/client';
import { promises as fs } from 'node:fs';
import { CreateTranscriptionDto } from './dto/create-transcription.dto';
import {
  formatTranscription,
  TranscriptionJobResponse,
} from './helpers/format-transcription.helper';
import { PrismaService } from '../prisma/prisma.service';

interface TextDownload {
  filename: string;
  content: string;
}

@Injectable()
export class TranscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateTranscriptionDto,
    file: Express.Multer.File,
  ): Promise<TranscriptionJobResponse> {
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
          transcriptText: this.buildInitialMockTranscript(
            dto.title,
            file.originalname,
          ),
          summary: dto.generateSummary
            ? 'Resumen mock pendiente de reemplazar por el servicio de IA.'
            : null,
        },
      });

      // Luego este punto deberia publicar un job en BullMQ para procesar audio e IA.
      return formatTranscription(transcription);
    } catch (error) {
      await this.removeUploadedFile(file.path);
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
      },
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

  private buildInitialMockTranscript(
    title: string,
    originalFilename: string,
  ): string {
    return `Transcripcion mock creada para "${title}" desde el archivo "${originalFilename}". El procesamiento real se conectara luego con cola, FFmpeg y proveedor de IA.`;
  }

  private buildCompletedMockTranscript(title: string): string {
    return `Transcripcion mock finalizada para "${title}". Este texto permite integrar y probar el frontend hasta conectar el pipeline real de transcripcion.`;
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
