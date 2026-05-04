-- CreateEnum
CREATE TYPE "UserContextKind" AS ENUM ('DEVICE', 'ACCOUNT', 'OTHER');

-- AlterEnum
ALTER TYPE "Device" ADD VALUE 'WIFI';

-- CreateTable
CREATE TABLE "user_contexts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "UserContextKind" NOT NULL,
    "label" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_contexts_user_id_kind_idx" ON "user_contexts"("user_id", "kind");

-- AddForeignKey
ALTER TABLE "user_contexts" ADD CONSTRAINT "user_contexts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
