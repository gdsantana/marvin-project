CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_name_nonempty" CHECK (length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"currency" text NOT NULL,
	"opening_balance_minor" bigint DEFAULT 0 NOT NULL,
	"opening_date" date NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_name_nonempty" CHECK (length(trim("name")) > 0),
	CONSTRAINT "accounts_type_valid" CHECK ("type" in ('checking', 'savings', 'cash', 'credit_card')),
	CONSTRAINT "accounts_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "accounts_id_type_unique" UNIQUE ("id", "type"),
	CONSTRAINT "accounts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE "credit_card_settings" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"credit_limit_minor" bigint,
	"closing_day" smallint NOT NULL,
	"due_day" smallint NOT NULL,
	"billing_timezone" text NOT NULL,
	"closing_mode" text DEFAULT 'manual' NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "credit_card_settings_limit_nonnegative" CHECK ("credit_limit_minor" is null or "credit_limit_minor" >= 0),
	CONSTRAINT "credit_card_settings_closing_day_valid" CHECK ("closing_day" between 1 and 31),
	CONSTRAINT "credit_card_settings_due_day_valid" CHECK ("due_day" between 1 and 31),
	CONSTRAINT "credit_card_settings_mode_valid" CHECK ("closing_mode" in ('manual', 'automatic')),
	CONSTRAINT "credit_card_settings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_nonempty" CHECK (length(trim("name")) > 0),
	CONSTRAINT "categories_type_valid" CHECK ("type" in ('income', 'expense')),
	CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");
--> statement-breakpoint
CREATE TABLE "agent_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"source_channel" text NOT NULL,
	"raw_text" text,
	"proposed_payload" jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "agent_requests_key_nonempty" CHECK (length(trim("idempotency_key")) > 0),
	CONSTRAINT "agent_requests_payload_hash_nonempty" CHECK (length(trim("payload_hash")) > 0),
	CONSTRAINT "agent_requests_status_valid" CHECK ("status" in ('proposed', 'committed', 'rejected', 'failed')),
	CONSTRAINT "agent_requests_source_key_unique" UNIQUE ("source_channel", "idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "idempotency_claims" (
	"key" text PRIMARY KEY NOT NULL,
	"payload_hash" text NOT NULL,
	"result" jsonb,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_claims_key_nonempty" CHECK (length(trim("key")) > 0),
	CONSTRAINT "idempotency_claims_payload_hash_nonempty" CHECK (length(trim("payload_hash")) > 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"posted_on" date,
	"description" text NOT NULL,
	"counterparty_name" text,
	"payment_method" text,
	"notes" text,
	"source" text NOT NULL,
	"review_status" text DEFAULT 'confirmed' NOT NULL,
	"origin_request_id" uuid,
	"related_transaction_id" uuid,
	"idempotency_key" text,
	"idempotency_payload_hash" text,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_kind_valid" CHECK ("kind" in ('expense', 'income', 'transfer', 'refund', 'adjustment')),
	CONSTRAINT "transactions_source_valid" CHECK ("source" in ('manual', 'hermes', 'import')),
	CONSTRAINT "transactions_review_status_valid" CHECK ("review_status" in ('confirmed', 'needs_review')),
	CONSTRAINT "transactions_payment_method_valid" CHECK ("payment_method" is null or "payment_method" in ('pix', 'debit', 'credit', 'bank_transfer', 'cash', 'other')),
	CONSTRAINT "transactions_description_nonempty" CHECK (length(trim("description")) > 0),
	CONSTRAINT "transactions_idempotency_pair" CHECK (("idempotency_key" is null) = ("idempotency_payload_hash" is null)),
	CONSTRAINT "transactions_origin_request_id_agent_requests_id_fk" FOREIGN KEY ("origin_request_id") REFERENCES "agent_requests"("id") ON DELETE RESTRICT,
	CONSTRAINT "transactions_related_transaction_id_transactions_id_fk" FOREIGN KEY ("related_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "transactions_occurred_on_idx" ON "transactions" USING btree ("occurred_on");
--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_source_key_unique" ON "transactions" USING btree ("source", "idempotency_key") WHERE "idempotency_key" is not null;
--> statement-breakpoint
CREATE TABLE "account_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "account_entries_amount_nonzero" CHECK ("amount_minor" <> 0),
	CONSTRAINT "account_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT,
	CONSTRAINT "account_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "account_entries_account_transaction_idx" ON "account_entries" USING btree ("account_id", "transaction_id");
--> statement-breakpoint
CREATE INDEX "account_entries_transaction_id_idx" ON "account_entries" USING btree ("transaction_id");
--> statement-breakpoint
CREATE TABLE "category_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"category_id" uuid,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "category_allocations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT,
	CONSTRAINT "category_allocations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "category_allocations_category_id_idx" ON "category_allocations" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX "category_allocations_transaction_id_idx" ON "category_allocations" USING btree ("transaction_id");
--> statement-breakpoint
CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_transaction_id" uuid NOT NULL,
	"total_amount_minor" bigint NOT NULL,
	"installment_count" smallint NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "installment_plans_purchase_transaction_id_unique" UNIQUE ("purchase_transaction_id"),
	CONSTRAINT "installment_plans_total_positive" CHECK ("total_amount_minor" > 0),
	CONSTRAINT "installment_plans_count_valid" CHECK ("installment_count" between 1 and 120),
	CONSTRAINT "installment_plans_purchase_transaction_id_transactions_id_fk" FOREIGN KEY ("purchase_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE "card_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_account_id" uuid NOT NULL,
	"cycle_start_on" date NOT NULL,
	"closing_on" date NOT NULL,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "card_statements_cycle_valid" CHECK ("cycle_start_on" < "closing_on"),
	CONSTRAINT "card_statements_due_on_valid" CHECK ("due_on" >= "closing_on"),
	CONSTRAINT "card_statements_status_valid" CHECK ("status" in ('open', 'closed', 'paid', 'partially_paid', 'overdue')),
	CONSTRAINT "card_statements_card_account_id_accounts_id_fk" FOREIGN KEY ("card_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX "card_statements_card_closing_unique" ON "card_statements" USING btree ("card_account_id", "closing_on");
--> statement-breakpoint
CREATE INDEX "card_statements_cycle_idx" ON "card_statements" USING btree ("card_account_id", "cycle_start_on", "closing_on");
--> statement-breakpoint
CREATE TABLE "card_statement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"source_transaction_id" uuid NOT NULL,
	"installment_plan_id" uuid,
	"installment_number" smallint,
	"item_type" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "card_statement_items_type_valid" CHECK ("item_type" in ('purchase', 'interest', 'fee', 'refund', 'cashback', 'adjustment')),
	CONSTRAINT "card_statement_items_description_nonempty" CHECK (length(trim("description")) > 0),
	CONSTRAINT "card_statement_items_installment_pair" CHECK (("installment_plan_id" is null) = ("installment_number" is null)),
	CONSTRAINT "card_statement_items_installment_positive" CHECK ("installment_number" is null or "installment_number" > 0),
	CONSTRAINT "card_statement_items_statement_id_card_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "card_statements"("id") ON DELETE RESTRICT,
	CONSTRAINT "card_statement_items_source_transaction_id_transactions_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT,
	CONSTRAINT "card_statement_items_installment_plan_id_installment_plans_id_fk" FOREIGN KEY ("installment_plan_id") REFERENCES "installment_plans"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "card_statement_items_statement_id_idx" ON "card_statement_items" USING btree ("statement_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "card_statement_items_plan_number_unique" ON "card_statement_items" USING btree ("installment_plan_id", "installment_number") WHERE "installment_plan_id" is not null and "installment_number" is not null;
--> statement-breakpoint
CREATE TABLE "statement_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"transfer_transaction_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "statement_payments_amount_positive" CHECK ("amount_minor" > 0),
	CONSTRAINT "statement_payments_statement_id_card_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "card_statements"("id") ON DELETE RESTRICT,
	CONSTRAINT "statement_payments_transfer_transaction_id_transactions_id_fk" FOREIGN KEY ("transfer_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "statement_payments_statement_id_idx" ON "statement_payments" USING btree ("statement_id");
--> statement-breakpoint
CREATE INDEX "statement_payments_transfer_transaction_id_idx" ON "statement_payments" USING btree ("transfer_transaction_id");
--> statement-breakpoint
CREATE FUNCTION "enforce_credit_card_settings_account"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM "accounts" WHERE "id" = NEW."account_id" AND "type" = 'credit_card') THEN
		RAISE EXCEPTION 'credit card settings require a credit_card account' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "credit_card_settings_account_type_trg" BEFORE INSERT OR UPDATE ON "credit_card_settings" FOR EACH ROW EXECUTE FUNCTION "enforce_credit_card_settings_account"();
--> statement-breakpoint
CREATE FUNCTION "enforce_statement_card_account"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	PERFORM 1 FROM "accounts" WHERE "id" = NEW."card_account_id" AND "type" = 'credit_card' FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'card statement requires a credit_card account' USING ERRCODE = '23514';
	END IF;
	PERFORM 1 FROM "card_statements" s
	WHERE s."card_account_id" = NEW."card_account_id"
	  AND s."id" <> COALESCE(NEW."id", '00000000-0000-0000-0000-000000000000'::uuid)
	  AND NEW."cycle_start_on" < s."closing_on"
	  AND NEW."closing_on" > s."cycle_start_on"
	LIMIT 1;
	IF FOUND THEN
		RAISE EXCEPTION 'card statement cycles cannot overlap' USING ERRCODE = '23P01';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "card_statements_card_and_cycle_trg" BEFORE INSERT OR UPDATE ON "card_statements" FOR EACH ROW EXECUTE FUNCTION "enforce_statement_card_account"();
--> statement-breakpoint
CREATE FUNCTION "enforce_statement_payment_limits"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	statement_gross numeric;
	statement_paid numeric;
	transfer_total numeric;
	transfer_allocated numeric;
	statement_card uuid;
	transfer_entry_count bigint;
	card_credits numeric;
	card_currency text;
BEGIN
	PERFORM 1 FROM "transactions" WHERE "id" = NEW."transfer_transaction_id" AND "kind" = 'transfer' FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'statement payment must reference a transfer transaction' USING ERRCODE = '23514';
	END IF;
	PERFORM 1 FROM "card_statements" WHERE "id" = NEW."statement_id" FOR UPDATE;
	SELECT s."card_account_id", a."currency" INTO statement_card, card_currency
	FROM "card_statements" s JOIN "accounts" a ON a."id" = s."card_account_id" WHERE s."id" = NEW."statement_id";
	SELECT COALESCE(sum("amount_minor"), 0) INTO statement_gross FROM "card_statement_items" WHERE "statement_id" = NEW."statement_id";
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
--> statement-breakpoint
CREATE TRIGGER "statement_payments_limits_trg" BEFORE INSERT ON "statement_payments" FOR EACH ROW EXECUTE FUNCTION "enforce_statement_payment_limits"();
--> statement-breakpoint
CREATE FUNCTION "reject_financial_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION '% is append-only; add a correcting transaction instead', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "account_entries_append_only_trg" BEFORE UPDATE OR DELETE ON "account_entries" FOR EACH ROW EXECUTE FUNCTION "reject_financial_mutation"();
--> statement-breakpoint
CREATE TRIGGER "statement_payments_append_only_trg" BEFORE UPDATE OR DELETE ON "statement_payments" FOR EACH ROW EXECUTE FUNCTION "reject_financial_mutation"();
--> statement-breakpoint
CREATE TRIGGER "card_statement_items_append_only_trg" BEFORE UPDATE OR DELETE ON "card_statement_items" FOR EACH ROW EXECUTE FUNCTION "reject_financial_mutation"();
--> statement-breakpoint
CREATE FUNCTION "enforce_statement_item_source"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	statement_card uuid;
	purchase_id uuid;
	installment_total smallint;
BEGIN
	SELECT "card_account_id" INTO statement_card FROM "card_statements" WHERE "id" = NEW."statement_id";
	IF NOT EXISTS (SELECT 1 FROM "account_entries" WHERE "transaction_id" = NEW."source_transaction_id" AND "account_id" = statement_card) THEN
		RAISE EXCEPTION 'statement item source must have an entry on its card account' USING ERRCODE = '23514';
	END IF;
	IF NEW."installment_plan_id" IS NOT NULL THEN
		SELECT "purchase_transaction_id", "installment_count" INTO purchase_id, installment_total FROM "installment_plans" WHERE "id" = NEW."installment_plan_id";
		IF purchase_id IS DISTINCT FROM NEW."source_transaction_id" OR NEW."item_type" <> 'purchase' OR NEW."amount_minor" <= 0 OR NEW."installment_number" > installment_total THEN
			RAISE EXCEPTION 'installment item does not match its purchase plan' USING ERRCODE = '23514';
		END IF;
	ELSIF NEW."item_type" = 'purchase' THEN
		RAISE EXCEPTION 'purchase statement items require an installment plan' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "statement_items_source_trg" BEFORE INSERT ON "card_statement_items" FOR EACH ROW EXECUTE FUNCTION "enforce_statement_item_source"();
--> statement-breakpoint
CREATE FUNCTION "validate_installment_plan"(plan_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	plan record;
	item_count bigint;
	first_number smallint;
	last_number smallint;
	items_total numeric;
	entry_count bigint;
	entry_total numeric;
BEGIN
	SELECT * INTO plan FROM "installment_plans" WHERE "id" = plan_id;
	IF NOT FOUND THEN RETURN; END IF;
	SELECT count(*), min("installment_number"), max("installment_number"), coalesce(sum("amount_minor"), 0)
	INTO item_count, first_number, last_number, items_total
	FROM "card_statement_items" WHERE "installment_plan_id" = plan_id;
	IF item_count <> plan."installment_count" OR first_number <> 1 OR last_number <> plan."installment_count" OR items_total <> plan."total_amount_minor" THEN
		RAISE EXCEPTION 'installment items must total the purchase and contain every installment number' USING ERRCODE = '23514';
	END IF;
	SELECT count(*), coalesce(sum(e."amount_minor"), 0)
	INTO entry_count, entry_total
	FROM "account_entries" e WHERE e."transaction_id" = plan."purchase_transaction_id";
	IF entry_count <> 1 OR entry_total <> -plan."total_amount_minor" OR NOT EXISTS (
		SELECT 1 FROM "account_entries" e JOIN "accounts" a ON a."id" = e."account_id"
		WHERE e."transaction_id" = plan."purchase_transaction_id" AND a."type" = 'credit_card' AND e."amount_minor" < 0
	) OR NOT EXISTS (
		SELECT 1 FROM "transactions" WHERE "id" = plan."purchase_transaction_id" AND "kind" = 'expense' AND "payment_method" = 'credit'
	) THEN
		RAISE EXCEPTION 'credit purchase must create one integral negative card entry' USING ERRCODE = '23514';
	END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "check_installment_plan_trigger"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_id uuid;
BEGIN
	IF TG_TABLE_NAME = 'installment_plans' THEN plan_id := COALESCE(NEW."id", OLD."id");
	ELSE plan_id := COALESCE(NEW."installment_plan_id", OLD."installment_plan_id"); END IF;
	IF plan_id IS NOT NULL THEN PERFORM "validate_installment_plan"(plan_id); END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "installment_plan_complete_trg" AFTER INSERT OR UPDATE ON "installment_plans" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_installment_plan_trigger"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "installment_items_complete_trg" AFTER INSERT ON "card_statement_items" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "check_installment_plan_trigger"();
--> statement-breakpoint
CREATE FUNCTION "enforce_refund_limit"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	refunded numeric;
	original_amount numeric;
	original_id uuid;
BEGIN
	SELECT "related_transaction_id" INTO original_id FROM "transactions" WHERE "id" = NEW."transaction_id" AND "kind" = 'refund';
	IF original_id IS NULL THEN
		RETURN NEW;
	END IF;
	PERFORM 1 FROM "transactions" WHERE "id" = original_id FOR UPDATE;
	SELECT COALESCE(sum(abs(e."amount_minor")), 0) INTO original_amount
	FROM "account_entries" e JOIN "transactions" t ON t."id" = e."transaction_id"
	WHERE t."id" = original_id AND t."kind" = 'expense' AND e."account_id" = NEW."account_id" AND e."amount_minor" < 0;
	SELECT COALESCE(sum(e."amount_minor"), 0) INTO refunded
	FROM "account_entries" e JOIN "transactions" t ON t."id" = e."transaction_id"
	WHERE t."related_transaction_id" = original_id AND t."kind" = 'refund' AND e."account_id" = NEW."account_id" AND e."amount_minor" > 0;
	IF NEW."amount_minor" <= 0 OR refunded + NEW."amount_minor" > original_amount THEN
		RAISE EXCEPTION 'refund exceeds original expense' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "account_entries_refund_limit_trg" BEFORE INSERT ON "account_entries" FOR EACH ROW EXECUTE FUNCTION "enforce_refund_limit"();
