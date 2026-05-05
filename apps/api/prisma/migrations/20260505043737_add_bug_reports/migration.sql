-- CreateEnum
CREATE TYPE "BugReportScreen" AS ENUM ('HOME', 'CHAT', 'OTHER');

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "screen" "BugReportScreen" NOT NULL,
    "description" TEXT NOT NULL,
    "image_base64" TEXT,
    "image_media_type" TEXT,
    "platform" TEXT,
    "app_version" TEXT,
    "locale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bug_reports_user_id_created_at_idx" ON "bug_reports"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "bug_reports_screen_created_at_idx" ON "bug_reports"("screen", "created_at");

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
