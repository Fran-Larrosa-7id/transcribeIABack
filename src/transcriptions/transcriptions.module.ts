import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioProcessingModule } from '../audio-processing/audio-processing.module';
import { PrismaService } from '../prisma/prisma.service';
import { TRANSCRIPTION_QUEUE } from './constants/transcription-queue.constants';
import { TranscriptionProcessor } from './transcription.processor';
import { TranscriptionsController } from './transcriptions.controller';
import { TranscriptionsService } from './transcriptions.service';

@Module({
  imports: [
    ConfigModule,
    AudioProcessingModule,
    BullModule.registerQueue({
      name: TRANSCRIPTION_QUEUE,
    }),
  ],
  controllers: [TranscriptionsController],
  providers: [TranscriptionsService, TranscriptionProcessor, PrismaService],
})
export class TranscriptionsModule {}
