-- 0005 — Curriculum: courses and the classes that take them.

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  code        text        not null unique,
  title       text        not null,
  created_at  timestamptz not null default now(),

  constraint courses_code_not_blank  check (length(btrim(code)) > 0),
  constraint courses_title_not_blank check (length(btrim(title)) > 0)
);

-- A course can be taken by more than one class (D-022), so the relationship is a
-- join table rather than a class_id on courses. Cheap now; expensive to unpick once
-- attendance rows exist.
create table public.class_courses (
  class_id    uuid        not null references public.classes (id) on delete cascade,
  course_id   uuid        not null references public.courses (id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (class_id, course_id)
);

comment on table public.class_courses is
  'Which classes take which courses. Attendance is still per class-session, so a '
  'shared course produces separate sessions per class.';
