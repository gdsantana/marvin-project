CREATE OR REPLACE FUNCTION protect_statement_opening_debt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.opening_debt_minor IS NOT DISTINCT FROM OLD.opening_debt_minor THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'open' AND NEW.status = 'open' THEN
    IF OLD.opening_debt_minor IS NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.opening_debt_minor IS NULL
      AND NOT EXISTS (SELECT 1 FROM card_statement_items WHERE statement_id = OLD.id)
      AND NOT EXISTS (SELECT 1 FROM statement_payments WHERE statement_id = OLD.id) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'opening debt can only be assigned to an open statement or released from an open statement without activity' USING ERRCODE = '23514';
END;
$$;
