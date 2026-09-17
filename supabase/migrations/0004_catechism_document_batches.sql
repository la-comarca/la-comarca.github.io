-- Secure document collection/export batches for diocesan requests.
-- Files remain in the existing private `catechism-private` Storage bucket.

create table if not exists public.catechism_document_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade default public.catechism_workspace_id(),
  name text not null,
  requested_for text not null default 'Diócesis',
  group_id uuid references public.catechism_groups(id) on delete set null,
  cycle_id uuid references public.catechism_cycles(id) on delete set null,
  due_on date,
  status text not null default 'collecting' check (status in ('draft','collecting','ready','submitted','archived')),
  required_types text[] not null default '{}',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(name) between 1 and 180),
  check (char_length(requested_for) between 1 and 180)
);

create table if not exists public.catechism_document_batch_items (
  batch_id uuid not null references public.catechism_document_batches(id) on delete cascade,
  document_id uuid not null references public.catechism_student_documents(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (batch_id, document_id)
);

create index if not exists catechism_document_batches_status_idx
  on public.catechism_document_batches(status, due_on);
create index if not exists catechism_document_batches_group_idx
  on public.catechism_document_batches(group_id, created_at desc);
create index if not exists catechism_document_batch_items_document_idx
  on public.catechism_document_batch_items(document_id);

alter table public.catechism_document_batches enable row level security;
alter table public.catechism_document_batch_items enable row level security;

create policy catechism_document_batches_admin
  on public.catechism_document_batches for all
  using (public.catechism_has_role(array['admin','coordinator']::public.member_role[]))
  with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));

create policy catechism_document_batch_items_admin
  on public.catechism_document_batch_items for all
  using (public.catechism_has_role(array['admin','coordinator']::public.member_role[]))
  with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
