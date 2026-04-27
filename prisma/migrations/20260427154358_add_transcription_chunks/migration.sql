-- CreateTable
CREATE TABLE "TranscriptionChunk" (
    "id" TEXT NOT NULL,
    "transcriptionJobId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "startTimeSeconds" INTEGER NOT NULL,
    "endTimeSeconds" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptionChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranscriptionChunk_transcriptionJobId_idx" ON "TranscriptionChunk"("transcriptionJobId");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptionChunk_transcriptionJobId_index_key" ON "TranscriptionChunk"("transcriptionJobId", "index");

-- AddForeignKey
ALTER TABLE "TranscriptionChunk" ADD CONSTRAINT "TranscriptionChunk_transcriptionJobId_fkey" FOREIGN KEY ("transcriptionJobId") REFERENCES "TranscriptionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
