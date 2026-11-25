-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "lastLessonId" INTEGER;

-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "lastPositionSeconds" INTEGER NOT NULL DEFAULT 0;
