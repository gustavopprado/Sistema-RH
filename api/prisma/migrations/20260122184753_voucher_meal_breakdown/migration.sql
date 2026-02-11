-- AlterTable
ALTER TABLE `VoucherMealInvoice` ADD COLUMN `invoiceFirstHalfNextNumber` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `invoiceSecondHalfNumber` VARCHAR(191) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE `VoucherMealInvoiceLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceId` INTEGER NOT NULL,
    `part` ENUM('SECOND_HALF', 'FIRST_HALF_NEXT') NOT NULL,
    `kind` ENUM('MEAL_LUNCH', 'MEAL_LUNCH_THIRD_PARTY', 'MEAL_LUNCH_VISITORS', 'MEAL_LUNCH_DONATION', 'COFFEE_SANDWICH', 'COFFEE_COFFEE_LITER', 'COFFEE_COFFEE_MILK_LITER', 'COFFEE_MILK_LITER', 'SPECIAL_SERVICE') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VoucherMealInvoiceLine_invoiceId_kind_idx`(`invoiceId`, `kind`),
    UNIQUE INDEX `VoucherMealInvoiceLine_invoiceId_part_kind_key`(`invoiceId`, `part`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VoucherMealInvoiceLine` ADD CONSTRAINT `VoucherMealInvoiceLine_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `VoucherMealInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
