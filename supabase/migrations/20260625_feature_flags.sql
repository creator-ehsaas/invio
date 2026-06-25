-- Feature flags + A/B experiments (self-hosted in Supabase).
-- Read by all authenticated users; only the service role (server) writes.
create table if not exists feature_flags (
  key text primary key,
  description text,
  enabled boolean default false,         -- master on/off
  rollout_pct int default 100 check (rollout_pct between 0 and 100),
  plan_target text[] default null,       -- null = all plans; else e.g. {'pro_monthly','business_monthly'}
  variants text[] default null,          -- A/B buckets, e.g. {'control','variant'} (null = simple boolean flag)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table feature_flags enable row level security;

-- Any authenticated user can read flags so the client can evaluate them.
drop policy if exists "read_flags" on feature_flags;
create policy "read_flags" on feature_flags for select using (auth.role() = 'authenticated');

-- Seed a few flags. Toggle/adjust these from the Supabase table editor at runtime —
-- no redeploy needed.
insert into feature_flags (key, description, enabled, rollout_pct, plan_target, variants) values
  ('claude_accountant',  'Business-tier Claude AI accountant',      false, 0,   array['business_monthly','business_yearly'], null),
  ('business_tier_live', 'Make the Business plan purchasable',       false, 100, null, null),
  ('pricing_experiment', 'A/B test pricing page layout',            false, 100, null, array['control','variant'])
on conflict (key) do nothing;
