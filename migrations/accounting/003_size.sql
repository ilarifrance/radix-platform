-- RADIX Accounting 003: size pack of each company (Francesco 18/10, add-on packages by workload and company size).
-- The pack sets the monthly fee (lib/accounting/pricing.js SIZES) and the included allowances, such as the copilot
-- questions. Existing companies start on the base pack. Apply on radix-preview; production needs a separate OK.

ALTER TABLE acc_companies ADD COLUMN size text NOT NULL DEFAULT 'base' CHECK(size IN('base','crescita','strutturata'));
