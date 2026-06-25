-- Manual balance-sheet line items (fixed assets, loans, capital, tax, etc.)
-- that aren't auto-derived from invoices/purchases. Previously an in-app snippet.
create table if not exists balance_sheet_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  section text not null,        -- fixed_asset | investment | other_current_asset |
                                -- long_term_liability | other_current_liability | capital | drawings
  name text not null,
  amount numeric default 0,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table balance_sheet_entries enable row level security;

drop policy if exists "business_access" on balance_sheet_entries;
create policy "business_access" on balance_sheet_entries
  using (business_id in (select business_id from users where id = auth.uid()));
