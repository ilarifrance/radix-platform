-- Personal «Trading» page (api/_trading.js): the latest snapshot sent by each member's Mac.
-- One row per member; token_issued_at is the time of the only push token that still works.
CREATE TABLE IF NOT EXISTS rx_trading_snapshots (
 user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 snapshot jsonb CHECK (snapshot IS NULL OR (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 1500000)),
 received_at timestamptz,
 token_issued_at timestamptz
);
