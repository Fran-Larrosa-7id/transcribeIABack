import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export interface ProcessedAudioChunk {
  index: number;
  filePath: string;
  filename: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
}

export interface SplitAudioIntoChunksParams {
  inputPath: string;
  outputDir: string;
  totalDurationSeconds: number;
  chunkDurationSeconds?: number;
}

interface ExecFileResult {
  stdout: string;
  stderr: string;
}

@Injectable()
export class AudioProcessingService {
  private readonly logger = new Logger(AudioProcessingService.name);

  constructor(private readonly configService: ConfigService) {}

  async getDurationSeconds(filePath: string): Promise<number> {
    const ffprobePath = this.configService.get<string>(
      'FFPROBE_PATH',
      'ffprobe',
    );

    const result = await this.runCommand(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    const duration = Number(result.stdout.trim());

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('FFprobe no pudo detectar una duracion valida.');
    }

    return Math.ceil(duration);
  }

  async normalizeAudio(inputPath: string, outputPath: string): Promise<void> {
    const ffmpegPath = this.configService.get<string>('FFMPEG_PATH', 'ffmpeg');
    await fs.mkdir(dirname(outputPath), { recursive: true });

    await this.runCommand(ffmpegPath, [
      '-y',
      '-i',
      inputPath,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      '64k',
      outputPath,
    ]);
  }

  async splitAudioIntoChunks(
    params: SplitAudioIntoChunksParams,
  ): Promise<ProcessedAudioChunk[]> {
    const ffmpegPath = this.configService.get<string>('FFMPEG_PATH', 'ffmpeg');
    const chunkDurationSeconds =
      params.chunkDurationSeconds ??
      Number(
        this.configService.get<string>('AUDIO_CHUNK_DURATION_SECONDS', '600'),
      );

    await fs.mkdir(params.outputDir, { recursive: true });
    const outputPattern = join(params.outputDir, 'chunk-%03d.mp3');

    await this.runCommand(ffmpegPath, [
      '-y',
      '-i',
      params.inputPath,
      '-f',
      'segment',
      '-segment_time',
      String(chunkDurationSeconds),
      '-reset_timestamps',
      '1',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      '64k',
      outputPattern,
    ]);

    const filenames = (await fs.readdir(params.outputDir))
      .filter((filename) => /^chunk-\d{3}\.mp3$/.test(filename))
      .sort();

    if (filenames.length === 0) {
      throw new Error('FFmpeg no genero fragmentos de audio.');
    }

    return filenames.map((filename, index) => {
      const startTimeSeconds = index * chunkDurationSeconds;
      const endTimeSeconds = Math.min(
        startTimeSeconds + chunkDurationSeconds,
        params.totalDurationSeconds,
      );

      return {
        index,
        filePath: join(params.outputDir, filename),
        filename,
        startTimeSeconds,
        endTimeSeconds,
        durationSeconds: Math.max(endTimeSeconds - startTimeSeconds, 0),
      };
    });
  }

  private runCommand(command: string, args: string[]): Promise<ExecFileResult> {
    return new Promise((resolve, reject) => {
      execFile(command, args, (error, stdout, stderr) => {
        const normalizedStdout = stdout.toString();
        const normalizedStderr = stderr.toString();

        if (error) {
          this.logger.error(
            `Fallo ${basename(command)}: ${normalizedStderr || error.message}`,
          );
          reject(
            new Error(
              `No pudimos procesar el audio. Verifica que ${basename(
                command,
              )} este disponible y que el archivo sea valido.`,
            ),
          );
          return;
        }

        resolve({
          stdout: normalizedStdout,
          stderr: normalizedStderr,
        });
      });
    });
  }
}
