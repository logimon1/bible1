create table if not exists programs (
  id text primary key,
  program_mode text not null check (program_mode in ('retreat', 'monthly')),
  church_name text not null default '',
  event_name text not null default '',
  event_start_date date,
  event_end_date date,
  participant_limit integer not null default 80,
  team_mode boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id text primary key,
  program_id text references programs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id text primary key,
  program_id text references programs(id) on delete set null,
  name text not null,
  team text default '',
  gender text default 'male',
  access_code text not null default '',
  active boolean not null default true,
  talent integer not null default 0,
  exp integer not null default 0,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table players add column if not exists program_id text references programs(id) on delete set null;
alter table players add column if not exists access_code text not null default '';
alter table players add column if not exists active boolean not null default true;
alter table players drop constraint if exists players_name_key;
alter table players drop constraint if exists players_identity_key;
alter table players add constraint players_identity_key unique (name, team, access_code);

create table if not exists equipment (
  id text primary key,
  name text not null,
  verse text default '',
  description text default '',
  effect text default '',
  unlock_condition text default '',
  print_text text default ''
);

create table if not exists inventory (
  player_id text not null references players(id) on delete cascade,
  armor_code text not null,
  grade text not null check (grade in ('B', 'A', 'S')),
  count integer not null default 0 check (count >= 0),
  primary key (player_id, armor_code, grade)
);

create table if not exists missions (
  code text primary key,
  program_id text references programs(id) on delete cascade,
  mode text not null default 'retreat',
  phase text default '',
  week_index integer not null default 0,
  title text not null,
  short_description text default '',
  verse text default '',
  armor_code text default '',
  reward jsonb not null default '{}'::jsonb,
  small_group_question text default '',
  unlock_at timestamptz,
  active boolean not null default true
);

create table if not exists mission_completions (
  id text primary key,
  player_id text not null references players(id) on delete cascade,
  mission_code text not null,
  reward jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (player_id, mission_code)
);

create table if not exists reward_transactions (
  id text primary key,
  player_id text references players(id) on delete set null,
  source text not null,
  talent integer not null default 0,
  draw_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists draw_logs (
  id text primary key,
  player_id text references players(id) on delete set null,
  draw_count integer not null,
  result jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
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

create table if not exists exchange_transactions (
  id text primary key,
  booth_id integer,
  player1_id text references players(id) on delete set null,
  player2_id text references players(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists event_logs (
  id text primary key,
  player_id text references players(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists admin_logs (
  id text primary key,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into exchange_sessions (booth_id, status)
values (1, 'empty'), (2, 'empty')
on conflict (booth_id) do nothing;
