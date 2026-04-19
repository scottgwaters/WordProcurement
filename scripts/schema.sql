-- Database schema for Word Procurement
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Words table
create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  age_group text not null check (age_group in ('4-6', '7-9', '10-12')),
  level integer not null check (level in (1, 2, 3)),
  category text not null,
  word_length integer not null,
  hints jsonb,
  pronunciation text,
  part_of_speech text,
  definition text,
  example_sentence text,
  heart_word_explanation text,
  verified boolean default false,
  verified_at timestamp with time zone,
  verified_by uuid references auth.users,
  source text,
  created_at timestamp with time zone default now(),
  created_by uuid references auth.users
);

-- Create unique index on word (case-insensitive)
create unique index if not exists words_word_unique on words (upper(word));

-- Indexes for common queries
create index if not exists words_category_idx on words (category);
create index if not exists words_age_group_idx on words (age_group);
create index if not exists words_verified_idx on words (verified);
create index if not exists words_created_at_idx on words (created_at desc);

-- Activity log for tracking changes
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  word_id uuid references words on delete cascade,
  user_id uuid references auth.users,
  action text not null check (action in ('created', 'verified', 'rejected', 'edited')),
  details jsonb,
  created_at timestamp with time zone default now()
);

-- Index for activity log queries
create index if not exists activity_log_word_id_idx on activity_log (word_id);
create index if not exists activity_log_user_id_idx on activity_log (user_id);
create index if not exists activity_log_created_at_idx on activity_log (created_at desc);

-- Row Level Security (RLS) policies

-- Enable RLS
alter table words enable row level security;
alter table activity_log enable row level security;

-- Words: authenticated users can read all words
create policy "Authenticated users can view words"
  on words for select
  to authenticated
  using (true);

-- Words: authenticated users can insert words
create policy "Authenticated users can insert words"
  on words for insert
  to authenticated
  with check (true);

-- Words: authenticated users can update words
create policy "Authenticated users can update words"
  on words for update
  to authenticated
  using (true);

-- Activity log: authenticated users can read all activity
create policy "Authenticated users can view activity"
  on activity_log for select
  to authenticated
  using (true);

-- Activity log: authenticated users can insert activity
create policy "Authenticated users can insert activity"
  on activity_log for insert
  to authenticated
  with check (true);

-- Grant service role access for imports
grant all on words to service_role;
grant all on activity_log to service_role;
