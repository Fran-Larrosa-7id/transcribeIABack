import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscriptionStatus as PrismaTranscriptionStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AudioProcessingService } from '../audio-processing/audio-processing.service';
import { TRANSCRIPTION_QUEUE } from './constants/transcription-queue.constants';
import { PrismaService } from '../prisma/prisma.service';
import { TranscriptionProcessingJobData } from './types/transcription-processing-job-data.type';

@Processor(TRANSCRIPTION_QUEUE)
export class TranscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscriptionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audioProcessingService: AudioProcessingService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<TranscriptionProcessingJobData>): Promise<void> {
    const { transcriptionJobId } = job.data;

    try {
      const transcription = await this.prisma.transcriptionJob.findUnique({
        where: { id: transcriptionJobId },
        select: {
          id: true,
          title: true,
          filePath: true,
          generateSummary: true,
        },
      });

      if (!transcription) {
        throw new Error(`TranscriptionJob ${transcriptionJobId} no existe.`);
      }

      await this.updateStage(transcriptionJobId, {
        status: PrismaTranscriptionStatus.processing_audio,
        progress: 10,
      });

      const durationSeconds =
        await this.audioProcessingService.getDurationSeconds(
          transcription.filePath,
        );

      await this.prisma.transcriptionJob.update({
        where: { id: transcriptionJobId },
        data: {
          durationSeconds,
          progress: 20,
        },
      });

      const processedRoot = this.configService.get<string>(
        'PROCESSED_AUDIO_DIR',
        'uploads/transcriptions/processed',
      );
      const jobProcessedDir = join(processedRoot, transcriptionJobId);
      const normalizedAudioPath = join(jobProcessedDir, 'normalized.mp3');

      await mkdir(jobProcessedDir, { recursive: true });
      await this.audioProcessingService.normalizeAudio(
        transcription.filePath,
        normalizedAudioPath,
      );

      await this.updateStage(transcriptionJobId, {
        status: PrismaTranscriptionStatus.processing_audio,
        progress: 25,
      });

      const chunkDurationSeconds = Number(
        this.configService.get<string>('AUDIO_CHUNK_DURATION_SECONDS', '600'),
      );
      const chunks = await this.audioProcessingService.splitAudioIntoChunks({
        inputPath: normalizedAudioPath,
        outputDir: jobProcessedDir,
        totalDurationSeconds: durationSeconds,
        chunkDurationSeconds,
      });

      await this.prisma.$transaction([
        this.prisma.transcriptionChunk.deleteMany({
          where: { transcriptionJobId },
        }),
        this.prisma.transcriptionChunk.createMany({
          data: chunks.map((chunk) => ({
            transcriptionJobId,
            index: chunk.index,
            filePath: chunk.filePath,
            filename: chunk.filename,
            startTimeSeconds: chunk.startTimeSeconds,
            endTimeSeconds: chunk.endTimeSeconds,
            durationSeconds: chunk.durationSeconds,
          })),
        }),
      ]);

      await this.updateStage(transcriptionJobId, {
        status: PrismaTranscriptionStatus.processing_audio,
        progress: 40,
      });

      await this.updateStage(transcriptionJobId, {
        status: PrismaTranscriptionStatus.transcribing,
        progress: 45,
      });

      const chunkTranscripts: string[] = [];
      for (const chunk of chunks) {
        await this.wait(500);
        chunkTranscripts.push(
          `[Parte ${chunk.index + 1}] Transcripcion de prueba para el fragmento ${this.formatTimestamp(
            chunk.startTimeSeconds,
          )} - ${this.formatTimestamp(chunk.endTimeSeconds)}.`,
        );

        const progress = this.calculateChunkProgress(
          chunk.index,
          chunks.length,
        );
        await this.updateStage(transcriptionJobId, {
          status: PrismaTranscriptionStatus.transcribing,
          progress,
        });
      }

      await this.updateStage(transcriptionJobId, {
        status: PrismaTranscriptionStatus.merging,
        progress: 90,
      });
      await this.wait(500);

      const transcriptText = [
        'Audio procesado y dividido correctamente. La transcripcion sigue mockeada hasta integrar un proveedor de IA.',
        '',
        ...chunkTranscripts,
      ].join('\n');

      await this.updateStage(transcriptionJobId, {
        status: PrismaTranscriptionStatus.merging,
        progress: 95,
      });

      await this.prisma.transcriptionJob.update({
        where: { id: transcriptionJobId },
        data: {
          status: PrismaTranscriptionStatus.completed,
          progress: 100,
          finishedAt: new Date(),
          transcriptText,
          summary: transcription.generateSummary
            ? 'Resumen generado en modo de prueba.'
            : null,
          errorMessage: null,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido durante el procesamiento.';

      this.logger.error(
        `Fallo el procesamiento de la transcripcion ${transcriptionJobId}: ${message}`,
      );

      await this.prisma.transcriptionJob
        .update({
          where: { id: transcriptionJobId },
          data: {
            status: PrismaTranscriptionStatus.failed,
            errorMessage:
              'No pudimos procesar el audio. Verifica que el archivo sea valido e intenta nuevamente.',
          },
        })
        .catch(() => undefined);

      throw error;
    }
  }

  private async updateStage(
    transcriptionJobId: string,
    data: {
      status: PrismaTranscriptionStatus;
      progress: number;
    },
  ): Promise<void> {
    await this.prisma.transcriptionJob.update({
      where: { id: transcriptionJobId },
      data,
    });
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  private calculateChunkProgress(index: number, totalChunks: number): number {
    const chunkCount = Math.max(totalChunks, 1);
    const ratio = (index + 1) / chunkCount;
    return Math.min(85, Math.max(45, Math.round(45 + ratio * 40)));
  }

  private formatTimestamp(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }
}
