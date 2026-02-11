-- AlterTable
ALTER TABLE `Employee` ADD COLUMN `voucherMealExcluded` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `Employee_voucherMealExcluded_idx` ON `Employee`(`voucherMealExcluded`);
