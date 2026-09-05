create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  mobile text not null default '',
  organization text,
  created_at timestamptz not null default now()
);

create table if not exists public.verification_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  document_count integer not null default 0,
  overall_status text not null default 'REQUIRES REVIEW'
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.verification_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  storage_path text not null,
  detected_type text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.verification_results (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  score numeric(5,2) not null,
  status text not null,
  issues jsonb not null default '[]'::jsonb,
  checks jsonb not null default '[]'::jsonb,
  recommendation text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists verification_sessions_user_idx on public.verification_sessions(user_id, created_at desc);
create index if not exists documents_user_idx on public.documents(user_id, uploaded_at desc);
create index if not exists documents_session_idx on public.documents(session_id);
create index if not exists results_document_idx on public.verification_results(document_id);

alter table public.profiles enable row level security;
alter table public.verification_sessions enable row level security;
alter table public.documents enable row level security;
alter table public.verification_results enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "Users read own sessions" on public.verification_sessions;
drop policy if exists "Users insert own sessions" on public.verification_sessions;
create policy "Users read own sessions" on public.verification_sessions for select using (auth.uid() = user_id);
create policy "Users insert own sessions" on public.verification_sessions for insert with check (auth.uid() = user_id);

create policy "Users read own documents" on public.documents for select using (auth.uid() = user_id);
create policy "Users insert own documents" on public.documents for insert with check (auth.uid() = user_id);
create policy "Users read own results" on public.verification_results for select using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));
create policy "Users insert own results" on public.verification_results for insert with check (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));

insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
drop policy if exists "Users upload own files" on storage.objects;
drop policy if exists "Users read own files" on storage.objects;
create policy "Users upload own files" on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users read own files" on storage.objects for select to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
