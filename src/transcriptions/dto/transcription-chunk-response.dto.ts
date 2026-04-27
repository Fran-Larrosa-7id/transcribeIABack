export interface TranscriptionChunkResponse {
  id: string;
  transcriptionJobId: string;
  index: number;
  filePath: string;
  filename: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  createdAt: string;
}
