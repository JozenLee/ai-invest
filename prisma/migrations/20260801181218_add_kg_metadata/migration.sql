-- CreateTable
CREATE TABLE "kg_domains" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "kg_news_links" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "domainCode" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "extracted" BOOLEAN NOT NULL DEFAULT false,
    "extractedAt" DATETIME,
    "entityCount" INTEGER NOT NULL DEFAULT 0,
    "relationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kg_news_links_domainCode_fkey" FOREIGN KEY ("domainCode") REFERENCES "kg_domains" ("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "kg_domains_code_key" ON "kg_domains"("code");

-- CreateIndex
CREATE INDEX "kg_news_links_domainCode_extracted_idx" ON "kg_news_links"("domainCode", "extracted");

-- CreateIndex
CREATE INDEX "kg_news_links_publishedAt_idx" ON "kg_news_links"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "kg_news_links_domainCode_url_key" ON "kg_news_links"("domainCode", "url");
