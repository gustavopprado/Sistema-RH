-- CreateTable
CREATE TABLE `VoucherInvoice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `referenceMonth` VARCHAR(7) NOT NULL,
    `invoiceNumber` VARCHAR(80) NOT NULL,
    `invoiceValue` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('DRAFT', 'FINALIZED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VoucherInvoice_referenceMonth_idx`(`referenceMonth`),
    UNIQUE INDEX `VoucherInvoice_referenceMonth_invoiceNumber_key`(`referenceMonth`, `invoiceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoucherAllocation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `reason` ENUM('DEFAULT', 'ABSENCE', 'PROPORTIONAL', 'MANUAL') NOT NULL DEFAULT 'DEFAULT',
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VoucherAllocation_employeeId_idx`(`employeeId`),
    UNIQUE INDEX `VoucherAllocation_invoiceId_employeeId_key`(`invoiceId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VoucherAllocation` ADD CONSTRAINT `VoucherAllocation_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `VoucherInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoucherAllocation` ADD CONSTRAINT `VoucherAllocation_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
