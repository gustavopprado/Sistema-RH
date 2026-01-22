/*
  Warnings:

  - You are about to drop the `MealAllocation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MealPeriod` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `MealAllocation` DROP FOREIGN KEY `MealAllocation_employeeId_fkey`;

-- DropForeignKey
ALTER TABLE `MealAllocation` DROP FOREIGN KEY `MealAllocation_periodId_fkey`;

-- DropTable
DROP TABLE `MealAllocation`;

-- DropTable
DROP TABLE `MealPeriod`;

-- CreateTable
CREATE TABLE `VoucherMealInvoice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `competence` DATE NOT NULL,
    `invoiceSecondHalf` DECIMAL(12, 2) NOT NULL,
    `invoiceFirstHalfNext` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('DRAFT', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VoucherMealInvoice_competence_key`(`competence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoucherMealAllocation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `employee20` DECIMAL(12, 2) NOT NULL,
    `company80` DECIMAL(12, 2) NOT NULL,
    `total100` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VoucherMealAllocation_employeeId_idx`(`employeeId`),
    UNIQUE INDEX `VoucherMealAllocation_invoiceId_employeeId_key`(`invoiceId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VoucherMealAllocation` ADD CONSTRAINT `VoucherMealAllocation_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `VoucherMealInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoucherMealAllocation` ADD CONSTRAINT `VoucherMealAllocation_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
