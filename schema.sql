create table if not exists players (
  id text primary key,
  name text not null,
  team text default '',
  gender text default 'male',
  access_code text not null default '',
  talent integer not null default 0,
  exp integer not null default 0,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table players add column if not exists access_code text not null default '';
alter table players drop constraint if exists players_name_key;
alter table players drop constraint if exists players_identity_key;
alter table players add constraint players_identity_key unique (name, team, access_code);

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
