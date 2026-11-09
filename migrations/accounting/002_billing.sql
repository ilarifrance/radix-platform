-- RADIX Accounting 002: client accounts that sign up from /contabilita/ and their Stripe subscription.
-- Client accounts are rows of users (so memberships, roles and audit work unchanged) listed in acc_client_accounts:
-- they sign in only with the accounting client session and are refused by the team login.
-- Apply on radix-preview after Francesco's OK (17/10, "Sì, in prova"); production needs a separate OK.

CREATE TABLE acc_client_accounts (
 user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 company_id uuid NOT NULL UNIQUE REFERENCES acc_companies(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE acc_subscriptions (
 company_id uuid PRIMARY KEY REFERENCES acc_companies(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'incomplete' CHECK(status IN('incomplete','active','trialing','past_due','canceled','unpaid')),
 price_cents integer NOT NULL CHECK(price_cents>0),
 stripe_customer text,
 stripe_subscription text UNIQUE,
 checkout_session text,
 current_period_end timestamptz,
 status_at bigint,                       -- Stripe event time of the last status change: older events never win
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now());

-- Every Stripe event received once (idempotency and a record of what Stripe told us).
CREATE TABLE acc_billing_events (
 id text PRIMARY KEY,
 type text NOT NULL,
 company_id uuid REFERENCES acc_companies(id) ON DELETE SET NULL,
 created bigint NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now());
