import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TranscriptionsController } from './transcriptions.controller';
import { TranscriptionsService } from './transcriptions.service';

@Module({
  imports: [ConfigModule],
  controllers: [TranscriptionsController],
  providers: [TranscriptionsService, PrismaService],
})
export class TranscriptionsModule {}
