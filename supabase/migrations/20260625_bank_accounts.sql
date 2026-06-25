-- Bank / cash accounts (previously shipped as an in-app SQL snippet).
-- Versioned here so the schema is reproducible.
create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  name text not null,
  bank_name text,
  account_number text,
  ifsc_code text,
  opening_balance numeric default 0,
  current_balance numeric default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table bank_accounts enable row level security;

drop policy if exists "business_access" on bank_accounts;
create policy "business_access" on bank_accounts
  using (business_id in (select business_id from users where id = auth.uid()));
