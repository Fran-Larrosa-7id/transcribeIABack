import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TranscriptionStatus } from '../enums/transcription-status.enum';

export class UpdateTranscriptionStatusDto {
  @IsOptional()
  @IsEnum(TranscriptionStatus)
  status?: TranscriptionStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;
}
