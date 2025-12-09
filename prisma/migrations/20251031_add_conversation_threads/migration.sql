-- CreateTable
CREATE TABLE "ConversationThread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "conversationId" TEXT NOT NULL,
    "assistantThreadId" TEXT NOT NULL,
    "assistantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationThread_tenantId_conversationId_key" ON "ConversationThread"("tenantId", "conversationId");
CREATE INDEX "ConversationThread_conversationId_idx" ON "ConversationThread"("conversationId");
CREATE INDEX "ConversationThread_tenantId_idx" ON "ConversationThread"("tenantId");

