-- Enquiries from the contact form. The `contact` function
-- (supabase/functions/contact) checks each one, saves it here and emails it.

create table if not exists public.enquiries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) <= 120),
  email       text not null check (char_length(email) <= 200),
  phone       text not null check (char_length(phone) <= 30),
  company     text check (char_length(company) <= 120),
  about       text check (char_length(about) <= 2000),   -- "Brief about you"
  idea        text check (char_length(idea) <= 4000),    -- "What do you have in mind"
  page        text,                                       -- the page it was sent from
  ip_hash     text,                                       -- for the rate limit; never the IP itself
  emailed     boolean not null default false              -- did the email to us go out?
);

-- Row level security on, and no policies: the public (anon) key can neither
-- read nor write this table. Only the function can, with the service role.
alter table public.enquiries enable row level security;

create index if not exists enquiries_created_at on public.enquiries (created_at desc);
create index if not exists enquiries_ip_recent on public.enquiries (ip_hash, created_at);
