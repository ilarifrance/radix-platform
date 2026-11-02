-- Livello di accesso alla piattaforma per account (users.access): 'full' (tutto, default) o 'crm' (solo CRM/vendite).
-- Letto dal login e scritto nel token di sessione; applicato dal server (api/_auth.js requireFull).
-- Idempotente. Applicare PRIMA su Neon radix-preview; in produzione solo con l'OK esplicito del proprietario.
-- (Stessa istruzione eseguita da /api/admin/migrate. Il codice tollera la colonna assente: tutti 'full'.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS access text NOT NULL DEFAULT 'full' CHECK (access IN ('full','crm'));
