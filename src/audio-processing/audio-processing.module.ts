import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioProcessingService } from './audio-processing.service';

@Module({
  imports: [ConfigModule],
  providers: [AudioProcessingService],
  exports: [AudioProcessingService],
})
export class AudioProcessingModule {}
