-- CreateTable
CREATE TABLE "family_links" (
    "id" TEXT NOT NULL,
    "senior_user_id" TEXT NOT NULL,
    "family_user_id" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_invites" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_user_id" TEXT,

    CONSTRAINT "family_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_links_senior_user_id_idx" ON "family_links"("senior_user_id");

-- CreateIndex
CREATE INDEX "family_links_family_user_id_idx" ON "family_links"("family_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_links_family_user_id_senior_user_id_key" ON "family_links"("family_user_id", "senior_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_invites_code_key" ON "family_invites"("code");

-- CreateIndex
CREATE INDEX "family_invites_created_by_user_id_created_at_idx" ON "family_invites"("created_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "family_invites_expires_at_idx" ON "family_invites"("expires_at");

-- AddForeignKey
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_senior_user_id_fkey" FOREIGN KEY ("senior_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_family_user_id_fkey" FOREIGN KEY ("family_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
