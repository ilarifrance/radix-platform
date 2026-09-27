// Shared Neon Postgres client helper.
//
// Uses the HTTP-based `neon()` tag function from @neondatabase/serverless
// instead of a pooled Pool/Client: each Vercel serverless function
// invocation is short-lived and this avoids managing connections across
// invocations entirely — every call is a single stateless HTTPS request to
// Neon's data API. Good enough for this app's traffic; if usage grows a lot,
// a pooled Pool client would be the next step.
//
// Reads DATABASE_URL (not the default POSTGRES_URL) because that's the
// variable name we chose during Vercel/Neon setup, via a custom env-var
// prefix, specifically so this file has no ambiguity about which connection
// string it's using.

const { neon } = require('@neondatabase/serverless');

let _sql = null;

function sql() {
  if (_sql) return _sql;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Add the Neon Postgres integration to this Vercel project (or set the env var manually).'
    );
  }
  _sql = neon(connectionString);
  return _sql;
}

module.exports = { sql };
