-- Preserve existing categories, including archived or differently capitalized names.
DO $$
BEGIN
LOCK TABLE categories IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO categories (name, type)
SELECT 'Ajuste de fatura', 'expense'
WHERE NOT EXISTS (
  SELECT 1 FROM categories
  WHERE lower(trim(name)) = lower('Ajuste de fatura')
    AND type = 'expense' AND parent_id IS NULL
);
END;
$$;
