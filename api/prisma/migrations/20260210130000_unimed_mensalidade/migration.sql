-- CreateTable
CREATE TABLE `UnimedMonthlyInvoice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `competence` DATE NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `invoiceValue` DECIMAL(12, 2) NOT NULL,
    `unitValue` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('DRAFT', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UnimedMonthlyInvoice_competence_key`(`competence`),
    INDEX `UnimedMonthlyInvoice_invoiceNumber_idx`(`invoiceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UnimedMonthlyAllocation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `dependents` INTEGER NOT NULL DEFAULT 0,
    `amountTotal` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UnimedMonthlyAllocation_invoiceId_employeeId_key`(`invoiceId`, `employeeId`),
    INDEX `UnimedMonthlyAllocation_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UnimedMonthlyAllocation` ADD CONSTRAINT `UnimedMonthlyAllocation_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `UnimedMonthlyInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnimedMonthlyAllocation` ADD CONSTRAINT `UnimedMonthlyAllocation_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
