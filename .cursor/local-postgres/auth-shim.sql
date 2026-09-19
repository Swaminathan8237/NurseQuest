-- Local-development shim for Supabase's managed `auth` schema.
--
-- In production this app runs on Supabase, which provides the `auth` schema
-- (auth.users / auth.identities) and the pgcrypto functions used by the seed.
-- A plain local PostgreSQL has neither, so `backend/db/schema.sql` (which creates
-- a trigger ON auth.users) and the seeder (which inserts into auth.users using
-- crypt()/gen_salt()) fail. This file creates a minimal, compatible subset so the
-- unmodified backend can initialize and seed locally. It is fully idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aud                 varchar(255),
  role                varchar(255),
  email               varchar(255) UNIQUE,
  encrypted_password  varchar(255),
  email_confirmed_at  timestamptz,
  raw_app_meta_data   jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data  jsonb DEFAULT '{}'::jsonb,
  is_super_admin      boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  is_anonymous        boolean DEFAULT false,
  is_sso_user         boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data    jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider         text NOT NULL,
  provider_id      text,
  last_sign_in_at  timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
