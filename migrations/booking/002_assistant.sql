-- Ciuffo 002: the assistant that answers customers on WhatsApp and on the phone.
-- A shop gets channels (a WhatsApp number through Twilio for the trials or through Meta with the shop's own number,
-- and a phone number that the shop forwards calls to). Every chat or call is a conversation with its messages;
-- the assistant stops in a conversation as soon as the shop answers by hand (paused_until).
-- Apply on radix-preview first (Francesco's «sviluppa anche il rispondi su whatsapp… e quello che risponde al
-- telefono», 19/11/2026); production needs a separate OK.
BEGIN;
ALTER TABLE bk_shops ADD COLUMN IF NOT EXISTS assistant_on boolean NOT NULL DEFAULT false;
ALTER TABLE bk_shops ADD COLUMN IF NOT EXISTS assistant_notes text CHECK(length(assistant_notes)<=2000);

-- Numbers are assigned by Ciuffo (CIUFFO_ADMINS), never claimed by a shop: whoever owns the number gets its messages.
CREATE TABLE bk_channels (
 shop_id uuid NOT NULL REFERENCES bk_shops(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('whatsapp','voice')),
 provider text NOT NULL CHECK(provider IN('twilio','meta')),
 address text NOT NULL CHECK(length(address) BETWEEN 3 AND 40),   -- +E.164 number (Twilio) or phone_number_id (Meta)
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(shop_id,id), UNIQUE(provider,kind,address));

CREATE TABLE bk_conversations (
 shop_id uuid NOT NULL REFERENCES bk_shops(id) ON DELETE CASCADE,
 id uuid NOT NULL,
 channel text NOT NULL CHECK(channel IN('whatsapp','voice','sim')),
 provider text CHECK(provider IN('twilio','meta')),
 address text,                                  -- the shop's number on that channel
 peer text CHECK(peer ~ '^\+[0-9]{6,15}$'),     -- the customer's number (null: hidden caller id)
 call_sid text UNIQUE,                          -- one conversation per phone call
 owner_id integer REFERENCES users(id),         -- «Prova l'assistente»: the owner plays the customer
 voice boolean NOT NULL DEFAULT false,          -- answers written for the phone (also in the trial chat)
 needs_owner boolean NOT NULL DEFAULT false,    -- the assistant handed the conversation to the shop
 paused_until timestamptz,                      -- the shop answered by hand: the assistant keeps quiet until then
 last_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(shop_id,id));
CREATE UNIQUE INDEX bk_conversations_chat ON bk_conversations(shop_id,channel,peer) WHERE channel='whatsapp';
CREATE UNIQUE INDEX bk_conversations_sim ON bk_conversations(shop_id,owner_id) WHERE channel='sim';
CREATE INDEX bk_conversations_recent ON bk_conversations(shop_id,last_at DESC);

CREATE TABLE bk_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 shop_id uuid NOT NULL,
 conversation_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN('customer','assistant','owner','note')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 ext_id text UNIQUE,                            -- provider message id: a webhook delivered twice is stored once
 at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(shop_id,conversation_id) REFERENCES bk_conversations(shop_id,id) ON DELETE CASCADE);
CREATE INDEX bk_messages_conv ON bk_messages(shop_id,conversation_id,id);
COMMIT;
