-- CreateTable
CREATE TABLE `UnimedInvoice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `competence` DATE NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `invoiceValue` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('DRAFT', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UnimedInvoice_competence_key`(`competence`),
    INDEX `UnimedInvoice_invoiceNumber_idx`(`invoiceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UnimedUsage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `kind` ENUM('PERSONAL', 'WORK_ACCIDENT') NOT NULL,
    `amountTotal` DECIMAL(12, 2) NOT NULL,
    `amountEmployee` DECIMAL(12, 2) NOT NULL,
    `amountCompany` DECIMAL(12, 2) NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UnimedUsage_invoiceId_employeeId_idx`(`invoiceId`, `employeeId`),
    INDEX `UnimedUsage_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UnimedUsage` ADD CONSTRAINT `UnimedUsage_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `UnimedInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnimedUsage` ADD CONSTRAINT `UnimedUsage_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
