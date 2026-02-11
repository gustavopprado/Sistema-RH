-- CreateTable
CREATE TABLE `MealPeriod` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `referenceMonth` VARCHAR(191) NOT NULL,
    `invoiceSecondHalf` DECIMAL(12, 2) NOT NULL,
    `invoiceFirstHalfNext` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MealPeriod_referenceMonth_key`(`referenceMonth`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MealAllocation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `periodId` INTEGER NOT NULL,
    `employeeId` INTEGER NOT NULL,
    `employee20` DECIMAL(12, 2) NOT NULL,
    `company80` DECIMAL(12, 2) NOT NULL,
    `total100` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MealAllocation_periodId_employeeId_key`(`periodId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MealAllocation` ADD CONSTRAINT `MealAllocation_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `MealPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MealAllocation` ADD CONSTRAINT `MealAllocation_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
