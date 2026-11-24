-- Plancia on its own database (not the RADIX one): the accounts table the other migrations refer to.
-- On the RADIX database `users` already exists and this file changes nothing.
-- Order on a new database: 000, 001, 002, 003, 004, 005, 006, 007.
CREATE TABLE IF NOT EXISTS users (
 id serial PRIMARY KEY,
 email text NOT NULL UNIQUE CHECK(email=lower(email) AND length(email)<=254),
 name text CHECK(length(name)<=120),
 password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now());
