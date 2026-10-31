DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM accounts WHERE currency <> 'BRL') OR EXISTS (SELECT 1 FROM expense_forecasts WHERE currency <> 'BRL') THEN
    RAISE EXCEPTION 'BRL migration blocked: non-BRL records require an explicit data decision';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE accounts ADD CONSTRAINT accounts_currency_brl CHECK (currency = 'BRL');
--> statement-breakpoint
ALTER TABLE expense_forecasts ADD CONSTRAINT expense_forecasts_currency_brl CHECK (currency = 'BRL');
