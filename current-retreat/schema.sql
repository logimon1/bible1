do $$
declare
  incompatible_metadata boolean := false;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'access_code'
  ) then
    raise exception '이 DB는 납품용 앱 스키마로 보입니다. current-retreat 전용 DB를 사용하세요.';
  end if;
  if to_regclass('public.app_metadata') is not null then
    execute 'select exists (select 1 from app_metadata where key = ''application'' and value <> ''current-retreat-v2'')'
      into incompatible_metadata;
    if incompatible_metadata then
      raise exception '다른 앱이 사용 중인 DB입니다. current-retreat 전용 DB를 사용하세요.';
    end if;
  end if;
end $$;

create table if not exists app_metadata (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_metadata (key, value, updated_at)
values ('application', 'current-retreat-v2', now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

create table if not exists players (
  id text primary key,
  name text not null,
  team text default '',
  gender text default 'male',
  talent integer not null default 0,
  exp integer not null default 0,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table players drop constraint if exists players_name_key;
alter table players drop constraint if exists players_identity_key;
create index if not exists players_name_team_idx on players (name, team);

create table if not exists inventory (
  player_id text not null references players(id) on delete cascade,
  armor_code text not null,
  grade text not null check (grade in ('B', 'A', 'S')),
  count integer not null default 0 check (count >= 0),
  primary key (player_id, armor_code, grade)
);

create table if not exists draw_logs (
  id text primary key,
  player_id text references players(id) on delete set null,
  draw_count integer not null,
  result jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists qr_claims (
  id text primary key,
  player_id text not null references players(id) on delete cascade,
  qr_code text not null,
  reward jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (player_id, qr_code)
);

create table if not exists exchange_sessions (
  booth_id integer primary key,
  status text not null default 'empty',
  player1_id text references players(id) on delete set null,
  player2_id text references players(id) on delete set null,
  player1_items jsonb not null default '[]'::jsonb,
  player2_items jsonb not null default '[]'::jsonb,
  player1_confirmed boolean not null default false,
  player2_confirmed boolean not null default false,
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  completed_at timestamptz
);

create table if not exists event_logs (
  id text primary key,
  player_id text references players(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into exchange_sessions (booth_id, status)
values (1, 'empty'), (2, 'empty')
on conflict (booth_id) do nothing;

-- The app connects as the database owner through Vercel. Public Supabase API
-- roles receive no policies, so these operational tables stay private.
alter table players enable row level security;
alter table inventory enable row level security;
alter table draw_logs enable row level security;
alter table qr_claims enable row level security;
alter table exchange_sessions enable row level security;
alter table event_logs enable row level security;
alter table app_metadata enable row level security;
