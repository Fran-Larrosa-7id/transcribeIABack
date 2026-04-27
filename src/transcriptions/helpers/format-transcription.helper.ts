import { TranscriptionJob as PrismaTranscriptionJob } from '@prisma/client';

export interface TranscriptionJobResponse {
  id: string;
  title: string;
  originalFilename: string;
  fileSize: number;
  durationSeconds?: number;
  language: string;
  model: string;
  status: string;
  progress: number;
  createdAt: string;
  finishedAt?: string;
  transcriptText?: string;
  summary?: string;
  errorMessage?: string;
}

export const formatTranscription = (
  transcription: PrismaTranscriptionJob,
): TranscriptionJobResponse => ({
  id: transcription.id,
  title: transcription.title,
  originalFilename: transcription.originalFilename,
  fileSize: transcription.fileSize,
  durationSeconds: transcription.durationSeconds ?? undefined,
  language: transcription.language,
  model: transcription.model,
  status: transcription.status,
  progress: transcription.progress,
  createdAt: transcription.createdAt.toISOString(),
  finishedAt: transcription.finishedAt?.toISOString(),
  transcriptText: transcription.transcriptText ?? undefined,
  summary: transcription.summary ?? undefined,
  errorMessage: transcription.errorMessage ?? undefined,
});
