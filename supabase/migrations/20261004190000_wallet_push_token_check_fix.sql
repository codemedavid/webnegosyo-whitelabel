-- Apple Wallet device registration never worked: the push_token check used
-- `^[A-Za-z0-9]{1,256}$`, and Postgres caps a regex repetition count at 255
-- (RE_DUP_MAX). The regex is compiled when a row is checked, not when the
-- constraint is created, so the migration applied cleanly and then EVERY
-- registration insert failed with 2201B "invalid repetition count(s)" — the
-- web service answered 500, no device was ever stored, and no card was ever
-- pushed an update. The length cap moves to char_length; the character class
-- stays a regex.

alter table public.loyalty_wallet_apple_registrations
  drop constraint if exists loyalty_wallet_apple_registrations_push_token_check;

alter table public.loyalty_wallet_apple_registrations
  add constraint loyalty_wallet_apple_registrations_push_token_check
  check (push_token ~ '^[A-Za-z0-9]+$' and char_length(push_token) <= 256);
