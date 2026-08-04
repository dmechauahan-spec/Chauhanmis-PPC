-- Self-Service Password Reset. Both new `users` columns are added nullable
-- first, backfilled with the 'NOT_SET' sentinel for every existing row (see
-- src/modules/auth/securityQuestion.ts's SECURITY_QUESTION_NOT_SET — kept in
-- sync with this literal by hand, since a SQL migration can't import a TS
-- constant), then set NOT NULL — the standard three-step shape for adding a
-- required column to a table that already has rows, since a bare
-- `ADD COLUMN ... NOT NULL` with no default fails outright against existing
-- data. Every pre-migration user is forced into the "security question not
-- yet configured" state; the forgot-password flow explicitly detects the
-- sentinel and tells the caller to ask an Admin to set a real one via
-- PATCH /api/auth/users/:userId, rather than silently/confusingly failing.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "security_question" TEXT,
ADD COLUMN     "security_answer_hash" TEXT;

-- Backfill
UPDATE "users" SET "security_question" = 'NOT_SET', "security_answer_hash" = 'NOT_SET'
WHERE "security_question" IS NULL;

-- Enforce NOT NULL now that every row has a value
ALTER TABLE "users" ALTER COLUMN "security_question" SET NOT NULL,
ALTER COLUMN "security_answer_hash" SET NOT NULL;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
