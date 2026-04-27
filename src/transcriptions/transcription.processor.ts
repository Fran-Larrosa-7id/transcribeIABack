import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { TranscriptionStatus as PrismaTranscriptionStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { TRANSCRIPTION_QUEUE } from './constants/transcription-queue.constants';
import { PrismaService } from '../prisma/prisma.service';
import { TranscriptionProcessingJobData } from './types/transcription-processing-job-data.type';

@Processor(TRANSCRIPTION_QUEUE)
export class TranscriptionProcessor extends WorkerHost {
  private readonly logger = new Logger(TranscriptionProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<TranscriptionProcessingJobData>): Promise<void> {
    const { transcriptionJobId } = job.data;

    try {
      const transcription = await this.prisma.transcriptionJob.findUnique({
        where: { id: transcriptionJobId },
        select: { id: true, generateSummary: true },
      });

      if (!transcription) {
        throw new Error(`TranscriptionJob ${transcriptionJobId} no existe.`);
      }

      await this.updateStage(transcriptionJobId, {
        status: PrismaTranscriptionStatus.processing_audio,
        progress: 20,
      });
      await this.wait(2_000);

      await this.updateStage(transcriptionJobId, {
        status: PrismaTranscriptionStatus.transcribing,
        progress: 55,
      });
      await this.wait(3_000);

      await this.updateStage(transcriptionJobId, {
        status: PrismaTranscriptionStatus.merging,
        progress: 85,
      });
      await this.wait(2_000);

      await this.prisma.transcriptionJob.update({
        where: { id: transcriptionJobId },
        data: {
          status: PrismaTranscriptionStatus.completed,
          progress: 100,
          finishedAt: new Date(),
          transcriptText:
            'Esta es una transcripcion de prueba generada automaticamente para validar el flujo de procesamiento en segundo plano.',
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
              'No pudimos procesar la transcripcion. Intenta nuevamente.',
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
}
