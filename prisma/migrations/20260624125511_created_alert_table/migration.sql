-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "raw_content" TEXT NOT NULL,
    "hazard_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "region" TEXT,
    "issued_at" TIMESTAMPTZ NOT NULL,
    "ingested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alerts_source_external_id_key" ON "alerts"("source", "external_id");
