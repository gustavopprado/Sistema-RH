-- AlterTable
ALTER TABLE `Employee` ADD COLUMN `voucherMarketExcluded` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `Employee_voucherMarketExcluded_idx` ON `Employee`(`voucherMarketExcluded`);
