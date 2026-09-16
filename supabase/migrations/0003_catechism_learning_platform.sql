-- Catecismo v2: private SIS/LMS domain for students, catechists, groups, curriculum,
-- calendar exceptions, resources, assessments, gradebook and private documents.
-- Legacy public.groups/students/sessions/attendance remain untouched during migration.

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid() or p.id = auth.uid()
  order by (p.auth_user_id = auth.uid()) desc
  limit 1
$$;

create or replace function public.catechism_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.workspaces where key = 'catecismo' and active limit 1
$$;

create or replace function public.catechism_role()
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.workspace_memberships m
  where m.workspace_id = public.catechism_workspace_id()
    and m.user_id = public.current_profile_id()
    and m.active
  limit 1
$$;

create or replace function public.catechism_has_role(roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.catechism_role() = any(roles), false)
$$;

create table public.catechism_people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null default '',
  preferred_name text,
  birth_date date,
  email text,
  phone text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(first_name) between 1 and 120),
  check (char_length(last_name) <= 180),
  check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create table public.catechism_catechists (
  person_id uuid primary key references public.catechism_people(id) on delete cascade,
  profile_id uuid unique references public.profiles(id) on delete set null,
  active boolean not null default true,
  started_on date,
  ended_on date,
  formation_notes text not null default '',
  created_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

create table public.catechism_students (
  person_id uuid primary key references public.catechism_people(id) on delete cascade,
  status text not null default 'active' check (status in ('applicant','active','paused','completed','withdrawn')),
  joined_on date,
  completed_on date,
  baptism_date date,
  baptism_place text,
  pastoral_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_on is null or joined_on is null or completed_on >= joined_on)
);

create table public.catechism_student_contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.catechism_students(person_id) on delete cascade,
  person_id uuid not null references public.catechism_people(id) on delete cascade,
  relationship text not null check (relationship in ('mother','father','guardian','godfather','godmother','emergency','other')),
  primary_contact boolean not null default false,
  authorized_pickup boolean not null default false,
  notes text not null default '',
  unique(student_id,person_id,relationship)
);

create table public.catechism_cycles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade default public.catechism_workspace_id(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planning' check (status in ('planning','active','closed','archived')),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique(workspace_id,name)
);

create table public.catechism_programs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade default public.catechism_workspace_id(),
  name text not null,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id,name)
);

create table public.catechism_rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade default public.catechism_workspace_id(),
  name text not null,
  location text not null default '',
  capacity integer check (capacity is null or capacity >= 0),
  notes text not null default '',
  active boolean not null default true,
  unique(workspace_id,name)
);

create table public.catechism_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade default public.catechism_workspace_id(),
  cycle_id uuid not null references public.catechism_cycles(id) on delete restrict,
  program_id uuid not null references public.catechism_programs(id) on delete restrict,
  room_id uuid references public.catechism_rooms(id) on delete set null,
  name text not null,
  level text not null default '',
  weekday smallint check (weekday between 0 and 6),
  starts_at time,
  ends_at time,
  timezone text not null default 'America/Mexico_City',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cycle_id,name),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.catechism_group_catechists (
  group_id uuid not null references public.catechism_groups(id) on delete cascade,
  catechist_id uuid not null references public.catechism_catechists(person_id) on delete cascade,
  role text not null default 'catechist' check (role in ('lead','catechist','assistant','substitute')),
  active boolean not null default true,
  primary key(group_id,catechist_id)
);

create table public.catechism_enrollments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.catechism_groups(id) on delete cascade,
  student_id uuid not null references public.catechism_students(person_id) on delete cascade,
  status text not null default 'active' check (status in ('pending','active','paused','completed','withdrawn')),
  enrolled_on date not null default current_date,
  withdrawn_on date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique(group_id,student_id),
  check (withdrawn_on is null or withdrawn_on >= enrolled_on)
);

create table public.catechism_curriculum_topics (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.catechism_programs(id) on delete cascade,
  code text,
  title text not null,
  description text not null default '',
  sequence integer not null default 0,
  required boolean not null default true,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  active boolean not null default true,
  unique(program_id,sequence,title)
);

create table public.catechism_topic_prerequisites (
  topic_id uuid not null references public.catechism_curriculum_topics(id) on delete cascade,
  prerequisite_topic_id uuid not null references public.catechism_curriculum_topics(id) on delete cascade,
  primary key(topic_id,prerequisite_topic_id),
  check (topic_id <> prerequisite_topic_id)
);

create table public.catechism_session_series (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.catechism_groups(id) on delete cascade,
  title text not null default 'Catecismo',
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  starts_on date not null,
  ends_on date not null,
  interval_weeks integer not null default 1 check (interval_weeks between 1 and 12),
  room_id uuid references public.catechism_rooms(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_on >= starts_on)
);

create table public.catechism_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.catechism_groups(id) on delete cascade,
  series_id uuid references public.catechism_session_series(id) on delete set null,
  room_id uuid references public.catechism_rooms(id) on delete set null,
  title text not null default 'Catecismo',
  kind text not null default 'class' check (kind in ('class','parish_activity','mass','retreat','celebration','service','other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  cancellation_reason text not null default '',
  replaced_by_session_id uuid references public.catechism_sessions(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.catechism_session_topics (
  session_id uuid not null references public.catechism_sessions(id) on delete cascade,
  topic_id uuid not null references public.catechism_curriculum_topics(id) on delete restrict,
  status text not null default 'planned' check (status in ('planned','taught','partial','skipped')),
  notes text not null default '',
  primary key(session_id,topic_id)
);

create table public.catechism_session_catechists (
  session_id uuid not null references public.catechism_sessions(id) on delete cascade,
  catechist_id uuid not null references public.catechism_catechists(person_id) on delete cascade,
  role text not null default 'catechist' check (role in ('lead','catechist','assistant','substitute')),
  confirmed boolean not null default false,
  primary key(session_id,catechist_id)
);

create table public.catechism_attendance (
  session_id uuid not null references public.catechism_sessions(id) on delete cascade,
  enrollment_id uuid not null references public.catechism_enrollments(id) on delete cascade,
  status public.attendance_status not null default 'unrecorded',
  note text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(session_id,enrollment_id)
);

create table public.catechism_student_topic_progress (
  enrollment_id uuid not null references public.catechism_enrollments(id) on delete cascade,
  topic_id uuid not null references public.catechism_curriculum_topics(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','exempt')),
  completed_at timestamptz,
  source_session_id uuid references public.catechism_sessions(id) on delete set null,
  evidence_type text not null default 'attendance' check (evidence_type in ('attendance','assessment','makeup','manual','other')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(enrollment_id,topic_id)
);

create table public.catechism_resources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade default public.catechism_workspace_id(),
  program_id uuid references public.catechism_programs(id) on delete cascade,
  group_id uuid references public.catechism_groups(id) on delete cascade,
  topic_id uuid references public.catechism_curriculum_topics(id) on delete set null,
  session_id uuid references public.catechism_sessions(id) on delete set null,
  title text not null,
  description text not null default '',
  resource_type text not null default 'link' check (resource_type in ('file','link','video','audio','document','presentation','other')),
  storage_path text,
  external_url text,
  audience text not null default 'both' check (audience in ('catechists','students','both')),
  published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);

create table public.catechism_grade_categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.catechism_groups(id) on delete cascade,
  name text not null,
  weight numeric(5,2) not null default 0 check (weight between 0 and 100),
  drop_lowest integer not null default 0 check (drop_lowest between 0 and 20),
  sequence integer not null default 0,
  unique(group_id,name)
);

create table public.catechism_assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.catechism_groups(id) on delete cascade,
  category_id uuid references public.catechism_grade_categories(id) on delete set null,
  topic_id uuid references public.catechism_curriculum_topics(id) on delete set null,
  session_id uuid references public.catechism_sessions(id) on delete set null,
  title text not null,
  instructions text not null default '',
  kind text not null default 'assignment' check (kind in ('assignment','in_class','project','quiz','exam','participation')),
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  max_points numeric(8,2) not null default 10 check (max_points > 0),
  weight_override numeric(5,2) check (weight_override is null or weight_override between 0 and 100),
  due_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catechism_assignment_resources (
  assignment_id uuid not null references public.catechism_assignments(id) on delete cascade,
  resource_id uuid not null references public.catechism_resources(id) on delete cascade,
  primary key(assignment_id,resource_id)
);

create table public.catechism_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.catechism_assignments(id) on delete cascade,
  enrollment_id uuid not null references public.catechism_enrollments(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned','submitted','late','graded','missing','excused')),
  submitted_at timestamptz,
  text_response text not null default '',
  storage_path text,
  points numeric(8,2),
  feedback text not null default '',
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(assignment_id,enrollment_id),
  check (points is null or points >= 0)
);

create table public.catechism_questions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade default public.catechism_workspace_id(),
  program_id uuid references public.catechism_programs(id) on delete cascade,
  topic_id uuid references public.catechism_curriculum_topics(id) on delete set null,
  question_type text not null check (question_type in ('multiple_choice','multiple_select','true_false','short_text','long_text')),
  prompt text not null,
  explanation text not null default '',
  default_points numeric(8,2) not null default 1 check (default_points > 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.catechism_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.catechism_questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  sequence integer not null default 0
);

create table public.catechism_quizzes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.catechism_assignments(id) on delete cascade,
  attempts_allowed integer not null default 1 check (attempts_allowed between 1 and 20),
  shuffle_questions boolean not null default false,
  shuffle_options boolean not null default false,
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes between 1 and 600),
  passing_percent numeric(5,2) check (passing_percent is null or passing_percent between 0 and 100),
  show_answers text not null default 'after_close' check (show_answers in ('never','after_submit','after_close'))
);

create table public.catechism_quiz_questions (
  quiz_id uuid not null references public.catechism_quizzes(id) on delete cascade,
  question_id uuid not null references public.catechism_questions(id) on delete restrict,
  sequence integer not null default 0,
  points numeric(8,2) not null default 1 check (points > 0),
  required boolean not null default true,
  primary key(quiz_id,question_id)
);

create table public.catechism_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.catechism_quizzes(id) on delete cascade,
  enrollment_id uuid not null references public.catechism_enrollments(id) on delete cascade,
  attempt_no integer not null default 1 check (attempt_no > 0),
  status text not null default 'in_progress' check (status in ('in_progress','submitted','graded','abandoned')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric(8,2),
  unique(quiz_id,enrollment_id,attempt_no)
);

create table public.catechism_quiz_responses (
  attempt_id uuid not null references public.catechism_quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.catechism_questions(id) on delete restrict,
  selected_option_ids uuid[] not null default '{}',
  text_response text not null default '',
  points_awarded numeric(8,2),
  feedback text not null default '',
  graded_by uuid references public.profiles(id) on delete set null,
  primary key(attempt_id,question_id),
  check (points_awarded is null or points_awarded >= 0)
);

create table public.catechism_student_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.catechism_students(person_id) on delete cascade,
  subject_person_id uuid references public.catechism_people(id) on delete set null,
  document_type text not null check (document_type in ('birth_certificate','baptism_certificate','godparent_id','guardian_id','consent','photo','other')),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size integer not null check (file_size between 1 and 10485760),
  status text not null default 'pending' check (status in ('pending','verified','rejected','expired')),
  expires_on date,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  uploaded_at timestamptz not null default now(),
  notes text not null default ''
);

create index catechism_people_name_idx on public.catechism_people(last_name,first_name);
create index catechism_groups_cycle_idx on public.catechism_groups(cycle_id,active);
create index catechism_enrollments_student_idx on public.catechism_enrollments(student_id,status);
create index catechism_sessions_group_time_idx on public.catechism_sessions(group_id,starts_at);
create index catechism_attendance_enrollment_idx on public.catechism_attendance(enrollment_id);
create index catechism_progress_enrollment_idx on public.catechism_student_topic_progress(enrollment_id,status);
create index catechism_assignments_group_due_idx on public.catechism_assignments(group_id,due_at);
create index catechism_submissions_enrollment_idx on public.catechism_submissions(enrollment_id,status);
create index catechism_documents_student_idx on public.catechism_student_documents(student_id,status);

create or replace function public.catechism_can_access_group(target_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.catechism_has_role(array['admin','coordinator']::public.member_role[])
    or (
      public.catechism_has_role(array['catechist']::public.member_role[])
      and exists (
        select 1
        from public.catechism_group_catechists gc
        join public.catechism_catechists c on c.person_id = gc.catechist_id
        where gc.group_id = target_group
          and gc.active
          and c.active
          and c.profile_id = public.current_profile_id()
      )
    )
$$;

create or replace function public.catechism_can_view_student(target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.catechism_has_role(array['admin','coordinator']::public.member_role[])
    or exists (
      select 1 from public.catechism_enrollments e
      where e.student_id = target_student
        and e.status in ('active','paused')
        and public.catechism_can_access_group(e.group_id)
    )
$$;

create or replace function public.catechism_can_manage_content()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.catechism_has_role(array['admin','coordinator','editor']::public.member_role[])
$$;

alter table public.catechism_people enable row level security;
alter table public.catechism_catechists enable row level security;
alter table public.catechism_students enable row level security;
alter table public.catechism_student_contacts enable row level security;
alter table public.catechism_cycles enable row level security;
alter table public.catechism_programs enable row level security;
alter table public.catechism_rooms enable row level security;
alter table public.catechism_groups enable row level security;
alter table public.catechism_group_catechists enable row level security;
alter table public.catechism_enrollments enable row level security;
alter table public.catechism_curriculum_topics enable row level security;
alter table public.catechism_topic_prerequisites enable row level security;
alter table public.catechism_session_series enable row level security;
alter table public.catechism_sessions enable row level security;
alter table public.catechism_session_topics enable row level security;
alter table public.catechism_session_catechists enable row level security;
alter table public.catechism_attendance enable row level security;
alter table public.catechism_student_topic_progress enable row level security;
alter table public.catechism_resources enable row level security;
alter table public.catechism_grade_categories enable row level security;
alter table public.catechism_assignments enable row level security;
alter table public.catechism_assignment_resources enable row level security;
alter table public.catechism_submissions enable row level security;
alter table public.catechism_questions enable row level security;
alter table public.catechism_question_options enable row level security;
alter table public.catechism_quizzes enable row level security;
alter table public.catechism_quiz_questions enable row level security;
alter table public.catechism_quiz_attempts enable row level security;
alter table public.catechism_quiz_responses enable row level security;
alter table public.catechism_student_documents enable row level security;

create policy catechism_people_read on public.catechism_people for select using (
  public.catechism_has_role(array['admin','coordinator']::public.member_role[])
  or exists (select 1 from public.catechism_students s where s.person_id=id and public.catechism_can_view_student(s.person_id))
  or exists (select 1 from public.catechism_catechists c join public.catechism_group_catechists gc on gc.catechist_id=c.person_id where c.person_id=id and public.catechism_can_access_group(gc.group_id))
);
create policy catechism_people_admin_write on public.catechism_people for all using (public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
create policy catechism_catechists_member_read on public.catechism_catechists for select using (public.catechism_role() is not null);
create policy catechism_catechists_admin_write on public.catechism_catechists for all using (public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
create policy catechism_students_scoped_read on public.catechism_students for select using (public.catechism_can_view_student(person_id));
create policy catechism_students_admin_write on public.catechism_students for all using (public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
create policy catechism_contacts_scoped_read on public.catechism_student_contacts for select using (public.catechism_can_view_student(student_id));
create policy catechism_contacts_admin_write on public.catechism_student_contacts for all using (public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));

create policy catechism_cycles_member on public.catechism_cycles for select using (public.catechism_role() is not null);
create policy catechism_cycles_admin_write on public.catechism_cycles for all using (public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
create policy catechism_programs_member on public.catechism_programs for select using (public.catechism_role() is not null);
create policy catechism_programs_content_write on public.catechism_programs for all using (public.catechism_can_manage_content()) with check (public.catechism_can_manage_content());
create policy catechism_rooms_member on public.catechism_rooms for select using (public.catechism_role() is not null);
create policy catechism_rooms_admin_write on public.catechism_rooms for all using (public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
create policy catechism_groups_member on public.catechism_groups for select using (public.catechism_role() is not null);
create policy catechism_groups_admin_write on public.catechism_groups for all using (public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
create policy catechism_group_catechists_read on public.catechism_group_catechists for select using (public.catechism_role() is not null);
create policy catechism_group_catechists_admin_write on public.catechism_group_catechists for all using (public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
create policy catechism_enrollments_scoped_read on public.catechism_enrollments for select using (public.catechism_can_access_group(group_id));
create policy catechism_enrollments_admin_write on public.catechism_enrollments for all using (public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));

create policy catechism_topics_member on public.catechism_curriculum_topics for select using (public.catechism_role() is not null);
create policy catechism_topics_content_write on public.catechism_curriculum_topics for all using (public.catechism_can_manage_content()) with check (public.catechism_can_manage_content());
create policy catechism_prereq_member on public.catechism_topic_prerequisites for select using (public.catechism_role() is not null);
create policy catechism_prereq_content_write on public.catechism_topic_prerequisites for all using (public.catechism_can_manage_content()) with check (public.catechism_can_manage_content());

create policy catechism_series_group_read on public.catechism_session_series for select using (public.catechism_can_access_group(group_id) or public.catechism_has_role(array['editor','reader']::public.member_role[]));
create policy catechism_series_group_write on public.catechism_session_series for all using (public.catechism_can_access_group(group_id)) with check (public.catechism_can_access_group(group_id));
create policy catechism_sessions_group_read on public.catechism_sessions for select using (public.catechism_can_access_group(group_id) or public.catechism_has_role(array['editor','reader']::public.member_role[]));
create policy catechism_sessions_group_write on public.catechism_sessions for all using (public.catechism_can_access_group(group_id)) with check (public.catechism_can_access_group(group_id));
create policy catechism_session_topics_read on public.catechism_session_topics for select using (public.catechism_can_access_group((select s.group_id from public.catechism_sessions s where s.id=session_id)));
create policy catechism_session_topics_write on public.catechism_session_topics for all using (public.catechism_can_access_group((select s.group_id from public.catechism_sessions s where s.id=session_id))) with check (public.catechism_can_access_group((select s.group_id from public.catechism_sessions s where s.id=session_id)));
create policy catechism_session_catechists_read on public.catechism_session_catechists for select using (public.catechism_can_access_group((select s.group_id from public.catechism_sessions s where s.id=session_id)));
create policy catechism_session_catechists_write on public.catechism_session_catechists for all using (public.catechism_can_access_group((select s.group_id from public.catechism_sessions s where s.id=session_id))) with check (public.catechism_can_access_group((select s.group_id from public.catechism_sessions s where s.id=session_id)));
create policy catechism_attendance_group on public.catechism_attendance for all using (public.catechism_can_access_group((select e.group_id from public.catechism_enrollments e where e.id=enrollment_id))) with check (public.catechism_can_access_group((select e.group_id from public.catechism_enrollments e where e.id=enrollment_id)));
create policy catechism_progress_group on public.catechism_student_topic_progress for all using (public.catechism_can_access_group((select e.group_id from public.catechism_enrollments e where e.id=enrollment_id))) with check (public.catechism_can_access_group((select e.group_id from public.catechism_enrollments e where e.id=enrollment_id)));

create policy catechism_resources_member on public.catechism_resources for select using (public.catechism_role() is not null and (group_id is null or public.catechism_can_access_group(group_id) or public.catechism_has_role(array['editor','reader']::public.member_role[])));
create policy catechism_resources_write on public.catechism_resources for all using (public.catechism_can_manage_content() or (group_id is not null and public.catechism_can_access_group(group_id))) with check (public.catechism_can_manage_content() or (group_id is not null and public.catechism_can_access_group(group_id)));
create policy catechism_grade_categories_group on public.catechism_grade_categories for all using (public.catechism_can_access_group(group_id)) with check (public.catechism_can_access_group(group_id));
create policy catechism_assignments_group on public.catechism_assignments for all using (public.catechism_can_access_group(group_id)) with check (public.catechism_can_access_group(group_id));
create policy catechism_assignment_resources_group on public.catechism_assignment_resources for all using (public.catechism_can_access_group((select a.group_id from public.catechism_assignments a where a.id=assignment_id))) with check (public.catechism_can_access_group((select a.group_id from public.catechism_assignments a where a.id=assignment_id)));
create policy catechism_submissions_group on public.catechism_submissions for all using (public.catechism_can_access_group((select e.group_id from public.catechism_enrollments e where e.id=enrollment_id))) with check (public.catechism_can_access_group((select e.group_id from public.catechism_enrollments e where e.id=enrollment_id)));

create policy catechism_questions_member on public.catechism_questions for select using (public.catechism_role() is not null);
create policy catechism_questions_write on public.catechism_questions for all using (public.catechism_can_manage_content() or public.catechism_has_role(array['catechist']::public.member_role[])) with check (public.catechism_can_manage_content() or public.catechism_has_role(array['catechist']::public.member_role[]));
create policy catechism_question_options_member on public.catechism_question_options for select using (public.catechism_role() is not null);
create policy catechism_question_options_write on public.catechism_question_options for all using (public.catechism_can_manage_content() or public.catechism_has_role(array['catechist']::public.member_role[])) with check (public.catechism_can_manage_content() or public.catechism_has_role(array['catechist']::public.member_role[]));
create policy catechism_quizzes_group on public.catechism_quizzes for all using (public.catechism_can_access_group((select a.group_id from public.catechism_assignments a where a.id=assignment_id))) with check (public.catechism_can_access_group((select a.group_id from public.catechism_assignments a where a.id=assignment_id)));
create policy catechism_quiz_questions_group on public.catechism_quiz_questions for all using (public.catechism_can_access_group((select a.group_id from public.catechism_quizzes q join public.catechism_assignments a on a.id=q.assignment_id where q.id=quiz_id))) with check (public.catechism_can_access_group((select a.group_id from public.catechism_quizzes q join public.catechism_assignments a on a.id=q.assignment_id where q.id=quiz_id)));
create policy catechism_quiz_attempts_group on public.catechism_quiz_attempts for all using (public.catechism_can_access_group((select e.group_id from public.catechism_enrollments e where e.id=enrollment_id))) with check (public.catechism_can_access_group((select e.group_id from public.catechism_enrollments e where e.id=enrollment_id)));
create policy catechism_quiz_responses_group on public.catechism_quiz_responses for all using (public.catechism_can_access_group((select e.group_id from public.catechism_quiz_attempts qa join public.catechism_enrollments e on e.id=qa.enrollment_id where qa.id=attempt_id))) with check (public.catechism_can_access_group((select e.group_id from public.catechism_quiz_attempts qa join public.catechism_enrollments e on e.id=qa.enrollment_id where qa.id=attempt_id)));

create policy catechism_documents_admin on public.catechism_student_documents for all using (public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (public.catechism_has_role(array['admin','coordinator']::public.member_role[]));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('catechism-private','catechism-private',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy catechism_storage_admin_read on storage.objects for select using (bucket_id='catechism-private' and public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
create policy catechism_storage_admin_insert on storage.objects for insert with check (bucket_id='catechism-private' and public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
create policy catechism_storage_admin_update on storage.objects for update using (bucket_id='catechism-private' and public.catechism_has_role(array['admin','coordinator']::public.member_role[])) with check (bucket_id='catechism-private' and public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
create policy catechism_storage_admin_delete on storage.objects for delete using (bucket_id='catechism-private' and public.catechism_has_role(array['admin','coordinator']::public.member_role[]));
