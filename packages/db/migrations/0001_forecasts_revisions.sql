CREATE TABLE "expense_forecasts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expected_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"category_id" uuid,
	"description" text NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'projected' NOT NULL,
	"realized_transaction_id" uuid,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "expense_forecasts_realized_transaction_id_unique" UNIQUE ("realized_transaction_id"),
	CONSTRAINT "expense_forecasts_amount_positive" CHECK ("amount_minor" > 0),
	CONSTRAINT "expense_forecasts_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "expense_forecasts_status_valid" CHECK ("status" in ('projected', 'realized', 'cancelled')),
	CONSTRAINT "expense_forecasts_realized_link" CHECK (("status" = 'realized') = ("realized_transaction_id" is not null)),
	CONSTRAINT "expense_forecasts_description_nonempty" CHECK (length(trim("description")) > 0),
	CONSTRAINT "expense_forecasts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT,
	CONSTRAINT "expense_forecasts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT,
	CONSTRAINT "expense_forecasts_realized_transaction_id_transactions_id_fk" FOREIGN KEY ("realized_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "expense_forecasts_expected_on_idx" ON "expense_forecasts" USING btree ("expected_on");
--> statement-breakpoint
CREATE INDEX "expense_forecasts_status_date_currency_idx" ON "expense_forecasts" USING btree ("status", "expected_on", "currency");
--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_one_reversal_per_original_unique" ON "transactions" USING btree ("related_transaction_id") WHERE "kind" = 'adjustment' AND "related_transaction_id" IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION "enforce_expense_forecast_transition"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."account_id" <> OLD."account_id"
	   OR NEW."expected_on" <> OLD."expected_on"
	   OR NEW."amount_minor" <> OLD."amount_minor"
	   OR NEW."category_id" IS DISTINCT FROM OLD."category_id"
	   OR NEW."description" <> OLD."description"
	   OR NEW."currency" <> OLD."currency"
	   OR NEW."created_at" <> OLD."created_at"
	   OR OLD."status" <> 'projected'
	   OR NEW."status" NOT IN ('realized', 'cancelled') THEN
		RAISE EXCEPTION 'expense forecast fields are immutable; only projected forecasts may be realized or cancelled' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "expense_forecasts_transition_trg" BEFORE UPDATE ON "expense_forecasts" FOR EACH ROW EXECUTE FUNCTION "enforce_expense_forecast_transition"();
--> statement-breakpoint
CREATE FUNCTION "validate_expense_forecast"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM "accounts" a WHERE a."id" = NEW."account_id" AND a."type" <> 'credit_card' AND a."currency" = NEW."currency") THEN
		RAISE EXCEPTION 'expense forecast requires a non-card account in the same currency' USING ERRCODE = '23514';
	END IF;
	IF NEW."category_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "categories" c WHERE c."id" = NEW."category_id" AND c."type" = 'expense') THEN
		RAISE EXCEPTION 'expense forecast category must be an expense category' USING ERRCODE = '23514';
	END IF;
	IF NEW."status" = 'realized' AND NOT EXISTS (
		SELECT 1 FROM "transactions" t
		JOIN "account_entries" e ON e."transaction_id" = t."id"
		WHERE t."id" = NEW."realized_transaction_id" AND t."kind" = 'expense'
		  AND t."payment_method" <> 'credit' AND e."account_id" = NEW."account_id"
		  AND e."amount_minor" = -NEW."amount_minor"
	) THEN
		RAISE EXCEPTION 'realized forecast must link to its matching non-card expense' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "expense_forecasts_validate_trg" BEFORE INSERT OR UPDATE ON "expense_forecasts" FOR EACH ROW EXECUTE FUNCTION "validate_expense_forecast"();
--> statement-breakpoint
CREATE TRIGGER "expense_forecasts_append_only_delete_trg" BEFORE DELETE ON "expense_forecasts" FOR EACH ROW EXECUTE FUNCTION "reject_financial_mutation"();
--> statement-breakpoint
CREATE TRIGGER "transactions_append_only_trg" BEFORE UPDATE OR DELETE ON "transactions" FOR EACH ROW EXECUTE FUNCTION "reject_financial_mutation"();
--> statement-breakpoint
CREATE TRIGGER "category_allocations_append_only_trg" BEFORE UPDATE OR DELETE ON "category_allocations" FOR EACH ROW EXECUTE FUNCTION "reject_financial_mutation"();
--> statement-breakpoint
CREATE TABLE "transaction_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"reason" text NOT NULL,
	"actor" text NOT NULL,
	"source" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"allocations" jsonb,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_revisions_reason_nonempty" CHECK (length(trim("reason")) > 0),
	CONSTRAINT "transaction_revisions_number_positive" CHECK ("revision_number" > 0),
	CONSTRAINT "transaction_revisions_actor_nonempty" CHECK (length(trim("actor")) > 0),
	CONSTRAINT "transaction_revisions_source_valid" CHECK ("source" in ('manual', 'hermes', 'import')),
	CONSTRAINT "transaction_revisions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_revisions_transaction_number_unique" ON "transaction_revisions" USING btree ("transaction_id", "revision_number");
--> statement-breakpoint
CREATE FUNCTION "enforce_revision_sequence"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_revision integer;
BEGIN
	PERFORM 1 FROM "transactions" WHERE "id" = NEW."transaction_id" FOR UPDATE;
	SELECT COALESCE(max("revision_number"), 0) + 1 INTO next_revision
	FROM "transaction_revisions" WHERE "transaction_id" = NEW."transaction_id";
	IF NEW."revision_number" <> next_revision THEN
		RAISE EXCEPTION 'revision_number must be the next revision for this transaction' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "transaction_revisions_sequence_trg" BEFORE INSERT ON "transaction_revisions" FOR EACH ROW EXECUTE FUNCTION "enforce_revision_sequence"();
--> statement-breakpoint
CREATE TRIGGER "transaction_revisions_append_only_trg" BEFORE UPDATE OR DELETE ON "transaction_revisions" FOR EACH ROW EXECUTE FUNCTION "reject_financial_mutation"();
