-- CreateTable
CREATE TABLE "ActualPayroll" (
    "id" TEXT NOT NULL,
    "workplaceId" TEXT NOT NULL,
    "paymentMonth" DATE NOT NULL,
    "taxableAmount" DECIMAL(10,2) NOT NULL,
    "nonTaxableAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActualPayroll_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActualPayroll_paymentMonth_idx" ON "ActualPayroll"("paymentMonth");

-- CreateIndex
CREATE INDEX "ActualPayroll_workplaceId_paymentMonth_idx" ON "ActualPayroll"("workplaceId", "paymentMonth");

-- CreateIndex
CREATE UNIQUE INDEX "ActualPayroll_workplaceId_paymentMonth_key" ON "ActualPayroll"("workplaceId", "paymentMonth");

-- AddForeignKey
ALTER TABLE "ActualPayroll" ADD CONSTRAINT "ActualPayroll_workplaceId_fkey" FOREIGN KEY ("workplaceId") REFERENCES "Workplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
