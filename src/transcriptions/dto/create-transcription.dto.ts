import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { TranscriptionLanguage } from '../enums/transcription-language.enum';
import { TranscriptionModel } from '../enums/transcription-model.enum';

const toBoolean = (value: unknown): unknown => {
  if (value === true || value === 'true' || value === '1' || value === 1) {
    return true;
  }

  if (value === false || value === 'false' || value === '0' || value === 0) {
    return false;
  }

  return value;
};

export class CreateTranscriptionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsEnum(TranscriptionLanguage)
  language!: TranscriptionLanguage;

  @IsEnum(TranscriptionModel)
  model!: TranscriptionModel;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  fixPunctuation: boolean = false;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  generateSummary: boolean = false;
}
