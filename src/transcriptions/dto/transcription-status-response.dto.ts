import { TranscriptionStatus } from '../enums/transcription-status.enum';

export interface TranscriptionStatusResponse {
  id: string;
  status: TranscriptionStatus;
  progress: number;
  errorMessage?: string;
  finishedAt?: string;
}
