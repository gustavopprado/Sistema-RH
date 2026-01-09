/*
  Warnings:

  - You are about to drop the `VoucherAllocation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VoucherInvoice` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `VoucherAllocation` DROP FOREIGN KEY `VoucherAllocation_employeeId_fkey`;

-- DropForeignKey
ALTER TABLE `VoucherAllocation` DROP FOREIGN KEY `VoucherAllocation_invoiceId_fkey`;

-- DropTable
DROP TABLE `VoucherAllocation`;

-- DropTable
DROP TABLE `VoucherInvoice`;

-- CreateTable
CREATE TABLE `VoucherMarketInvoice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `competence` DATE NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `invoiceValue` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VoucherMarketInvoice_invoiceNumber_idx`(`invoiceNumber`),
    UNIQUE INDEX `VoucherMarketInvoice_competence_key`(`competence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoucherMarketAllocation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VoucherMarketAllocation_employeeId_idx`(`employeeId`),
    UNIQUE INDEX `VoucherMarketAllocation_invoiceId_employeeId_key`(`invoiceId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VoucherMarketAllocation` ADD CONSTRAINT `VoucherMarketAllocation_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `VoucherMarketInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoucherMarketAllocation` ADD CONSTRAINT `VoucherMarketAllocation_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
