-- CreateTable
CREATE TABLE `Employee` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `matricula` VARCHAR(191) NOT NULL,
    `costCenter` VARCHAR(191) NOT NULL,
    `branch` VARCHAR(191) NOT NULL,
    `admissionDate` DATE NOT NULL,
    `terminationDate` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Employee_matricula_key`(`matricula`),
    INDEX `Employee_branch_idx`(`branch`),
    INDEX `Employee_costCenter_idx`(`costCenter`),
    INDEX `Employee_terminationDate_idx`(`terminationDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
