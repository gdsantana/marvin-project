ALTER TABLE credit_card_settings
  ADD COLUMN reporting_account_id uuid REFERENCES accounts (id) ON DELETE RESTRICT,
  ADD CONSTRAINT credit_card_settings_reporting_account_distinct CHECK (reporting_account_id <> account_id);
--> statement-breakpoint
CREATE INDEX credit_card_settings_reporting_account_idx ON credit_card_settings (reporting_account_id);
