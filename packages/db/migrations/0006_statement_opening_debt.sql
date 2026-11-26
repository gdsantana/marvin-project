ALTER TABLE card_statements
  ADD COLUMN opening_debt_minor numeric(19, 0),
  ADD CONSTRAINT card_statements_opening_debt_valid CHECK (opening_debt_minor > 0 AND opening_debt_minor <= 9223372036854775808);
--> statement-breakpoint
CREATE UNIQUE INDEX card_statements_one_opening_debt_per_card
  ON card_statements (card_account_id) WHERE opening_debt_minor IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION protect_statement_opening_debt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.opening_debt_minor IS DISTINCT FROM OLD.opening_debt_minor
    AND (OLD.opening_debt_minor IS NOT NULL OR OLD.status <> 'open' OR NEW.status <> 'open') THEN
    RAISE EXCEPTION 'opening debt can only be assigned once to an open statement' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER card_statements_opening_debt_trg BEFORE UPDATE OF opening_debt_minor ON card_statements
  FOR EACH ROW EXECUTE FUNCTION protect_statement_opening_debt();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "enforce_statement_payment_limits"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  statement_gross numeric;
  statement_paid numeric;
  transfer_total numeric;
  transfer_allocated numeric;
  statement_card uuid;
  transfer_entry_count bigint;
  card_credits numeric;
  card_currency text;
  opening_debt numeric;
BEGIN
  PERFORM 1 FROM "transactions" WHERE "id" = NEW."transfer_transaction_id" AND "kind" = 'transfer' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement payment must reference a transfer transaction' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM "card_statements" WHERE "id" = NEW."statement_id" FOR UPDATE;
  SELECT s."card_account_id", a."currency", COALESCE(s."opening_debt_minor", 0)
  INTO statement_card, card_currency, opening_debt
  FROM "card_statements" s JOIN "accounts" a ON a."id" = s."card_account_id" WHERE s."id" = NEW."statement_id";
  SELECT opening_debt + COALESCE(sum("amount_minor"), 0) INTO statement_gross FROM "card_statement_items" WHERE "statement_id" = NEW."statement_id";
  SELECT COALESCE(sum("amount_minor"), 0) INTO statement_paid FROM "statement_payments" WHERE "statement_id" = NEW."statement_id";
  IF statement_paid + NEW."amount_minor" > statement_gross THEN
    RAISE EXCEPTION 'statement payment exceeds amount due' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(sum(abs("amount_minor")), 0) INTO transfer_total FROM "account_entries" WHERE "transaction_id" = NEW."transfer_transaction_id" AND "amount_minor" < 0;
  SELECT count(*), COALESCE(sum("amount_minor") FILTER (WHERE e."account_id" = statement_card AND e."amount_minor" > 0), 0)
  INTO transfer_entry_count, card_credits
  FROM "account_entries" e WHERE e."transaction_id" = NEW."transfer_transaction_id";
  IF transfer_entry_count <> 2 OR card_credits <> transfer_total OR NOT EXISTS (
    SELECT 1 FROM "account_entries" e JOIN "accounts" a ON a."id" = e."account_id"
    WHERE e."transaction_id" = NEW."transfer_transaction_id" AND e."account_id" = statement_card
      AND e."amount_minor" > 0 AND a."currency" = card_currency
  ) OR NOT EXISTS (
    SELECT 1 FROM "account_entries" e JOIN "accounts" a ON a."id" = e."account_id"
    WHERE e."transaction_id" = NEW."transfer_transaction_id" AND e."amount_minor" < 0
      AND a."currency" = card_currency AND e."amount_minor" = -card_credits
  ) THEN
    RAISE EXCEPTION 'statement payment transfer must move equal amounts between same-currency accounts and the statement card' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(sum("amount_minor"), 0) INTO transfer_allocated FROM "statement_payments" WHERE "transfer_transaction_id" = NEW."transfer_transaction_id";
  IF transfer_allocated + NEW."amount_minor" > transfer_total THEN
    RAISE EXCEPTION 'statement payment allocations exceed transfer amount' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
