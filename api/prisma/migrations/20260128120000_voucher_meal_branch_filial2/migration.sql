-- Add branch to VoucherMealInvoice and make competence unique per (competence, branch)
ALTER TABLE `VoucherMealInvoice`
  ADD COLUMN `branch` VARCHAR(191) NOT NULL DEFAULT '1';

-- Replace unique index on competence
DROP INDEX `VoucherMealInvoice_competence_key` ON `VoucherMealInvoice`;

CREATE UNIQUE INDEX `VoucherMealInvoice_competence_branch_key`
  ON `VoucherMealInvoice`(`competence`, `branch`);

CREATE INDEX `VoucherMealInvoice_branch_idx`
  ON `VoucherMealInvoice`(`branch`);

-- Extend enum kinds for filial 02
ALTER TABLE `VoucherMealInvoiceLine`
  MODIFY `kind` ENUM(
    'MEAL_LUNCH',
    'MEAL_LUNCH_THIRD_PARTY',
    'MEAL_LUNCH_VISITORS',
    'MEAL_LUNCH_DONATION',
    'COFFEE_SANDWICH',
    'COFFEE_COFFEE_LITER',
    'COFFEE_COFFEE_MILK_LITER',
    'COFFEE_MILK_LITER',
    'SPECIAL_SERVICE',
    'COFFEE_GENERAL',
    'MISC_SODA',
    'MISC_MEAL_EVENT'
  ) NOT NULL;
