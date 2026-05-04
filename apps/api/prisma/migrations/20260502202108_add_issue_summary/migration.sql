-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RecommendedRoute" AS ENUM ('AI', 'AI_WITH_HUMAN_FALLBACK', 'HUMAN');

-- CreateTable
CREATE TABLE "issue_summaries" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "tags" TEXT[],
    "complexity" INTEGER NOT NULL,
    "urgency" "Urgency" NOT NULL,
    "recommend_route" "RecommendedRoute" NOT NULL,
    "image_attached" BOOLEAN NOT NULL DEFAULT false,
    "message_count" INTEGER NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issue_summaries_session_id_key" ON "issue_summaries"("session_id");

-- AddForeignKey
ALTER TABLE "issue_summaries" ADD CONSTRAINT "issue_summaries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
