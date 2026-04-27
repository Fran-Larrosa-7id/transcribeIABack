-- CreateEnum
CREATE TYPE "TranscriptionLanguage" AS ENUM ('auto', 'es', 'en', 'pt');

-- CreateEnum
CREATE TYPE "TranscriptionModel" AS ENUM ('economy', 'high_accuracy');

-- CreateEnum
CREATE TYPE "TranscriptionStatus" AS ENUM ('pending', 'uploading', 'processing_audio', 'transcribing', 'merging', 'completed', 'failed');

-- CreateTable
CREATE TABLE "TranscriptionJob" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "language" "TranscriptionLanguage" NOT NULL,
    "model" "TranscriptionModel" NOT NULL,
    "fixPunctuation" BOOLEAN NOT NULL DEFAULT false,
    "generateSummary" BOOLEAN NOT NULL DEFAULT false,
    "status" "TranscriptionStatus" NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "transcriptText" TEXT,
    "summary" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TranscriptionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranscriptionJob_createdAt_idx" ON "TranscriptionJob"("createdAt");

-- CreateIndex
CREATE INDEX "TranscriptionJob_status_idx" ON "TranscriptionJob"("status");
