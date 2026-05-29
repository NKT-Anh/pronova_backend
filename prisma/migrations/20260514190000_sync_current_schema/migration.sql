-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('NOT_QUEUED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgeRange" AS ENUM ('AGE_13_17', 'AGE_18_24', 'AGE_25_34', 'AGE_35_44', 'AGE_45_PLUS');

-- DropIndex
DROP INDEX "TranslationCache_text_sourceLang_targetLang_key";

-- AlterTable
ALTER TABLE "Attempt"
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "recognizedText" TEXT,
ADD COLUMN "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Attempt" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Folder"
ADD COLUMN "color" TEXT DEFAULT '#3B82F6',
ADD COLUMN "description" TEXT,
ADD COLUMN "icon" TEXT DEFAULT 'folder';

-- AlterTable
ALTER TABLE "SystemConfig"
ADD COLUMN "valueType" TEXT NOT NULL DEFAULT 'string';

-- AlterTable
ALTER TABLE "TextItem"
ADD COLUMN "sampleAudioError" TEXT,
ADD COLUMN "sampleAudioStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "voiceName" TEXT,
ADD COLUMN "voiceProvider" TEXT;

-- AlterTable
ALTER TABLE "TranslationCache" RENAME COLUMN "text" TO "textHash";

-- AlterTable
ALTER TABLE "User" RENAME COLUMN "password" TO "passwordHash";

ALTER TABLE "User"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "UserSetting"
ALTER COLUMN "ageRange" TYPE "AgeRange"
USING (
  CASE
    WHEN "ageRange" IN ('AGE_13_17', 'AGE_18_24', 'AGE_25_34', 'AGE_35_44', 'AGE_45_PLUS')
      THEN "ageRange"::"AgeRange"
    ELSE NULL
  END
);

-- CreateTable
CREATE TABLE "Language" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nativeName" TEXT NOT NULL,
    "isSupported" BOOLEAN NOT NULL DEFAULT true,
    "azureCode" TEXT,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("code")
);

INSERT INTO "Language" ("code", "name", "nativeName", "isSupported", "azureCode") VALUES
('vi', 'Vietnamese', 'Tieng Viet', true, 'vi-VN'),
('en', 'English', 'English', true, 'en-US'),
('ja', 'Japanese', 'Japanese', true, 'ja-JP'),
('ko', 'Korean', 'Korean', true, 'ko-KR'),
('zh', 'Chinese', 'Chinese', true, 'zh-CN')
ON CONFLICT ("code") DO NOTHING;

-- CreateTable
CREATE TABLE "DailyProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "minutesPracticed" INTEGER NOT NULL DEFAULT 0,
    "goalMet" BOOLEAN NOT NULL DEFAULT false,
    "streakDay" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Language_isSupported_idx" ON "Language"("isSupported");

-- CreateIndex
CREATE INDEX "DailyProgress_userId_date_idx" ON "DailyProgress"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyProgress_userId_date_key" ON "DailyProgress"("userId", "date");

-- CreateIndex
CREATE INDEX "Attempt_userId_createdAt_idx" ON "Attempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_guestId_createdAt_idx" ON "Attempt"("guestId", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_textItemId_createdAt_idx" ON "Attempt"("textItemId", "createdAt");

-- CreateIndex
CREATE INDEX "Attempt_status_idx" ON "Attempt"("status");

-- CreateIndex
CREATE INDEX "Attempt_isUsableForAI_idx" ON "Attempt"("isUsableForAI");

-- CreateIndex
CREATE INDEX "Attempt_languageCode_idx" ON "Attempt"("languageCode");

-- CreateIndex
CREATE INDEX "TextItem_sourceLang_idx" ON "TextItem"("sourceLang");

-- CreateIndex
CREATE INDEX "TextItem_createdAt_idx" ON "TextItem"("createdAt");

-- CreateIndex
CREATE INDEX "TextItem_sampleAudioStatus_idx" ON "TextItem"("sampleAudioStatus");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationCache_textHash_sourceLang_targetLang_key" ON "TranslationCache"("textHash", "sourceLang", "targetLang");

-- AddForeignKey
ALTER TABLE "TextItem" ADD CONSTRAINT "TextItem_sourceLang_fkey" FOREIGN KEY ("sourceLang") REFERENCES "Language"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextItem" ADD CONSTRAINT "TextItem_destLang_fkey" FOREIGN KEY ("destLang") REFERENCES "Language"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_languageCode_fkey" FOREIGN KEY ("languageCode") REFERENCES "Language"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgress" ADD CONSTRAINT "DailyProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
