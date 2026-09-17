-- A batch should point to the current selected version of each document type for each student.
-- When a newer document is attached, remove an older reference for the same student/type.
create or replace function public.catechism_document_batch_replace_same_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  incoming_student uuid;
  incoming_type text;
begin
  select student_id, document_type
    into incoming_student, incoming_type
  from public.catechism_student_documents
  where id = new.document_id;

  if incoming_student is null then
    raise exception 'Document not found';
  end if;

  delete from public.catechism_document_batch_items bi
  using public.catechism_student_documents existing
  where bi.batch_id = new.batch_id
    and bi.document_id = existing.id
    and existing.student_id = incoming_student
    and existing.document_type = incoming_type
    and bi.document_id <> new.document_id;

  return new;
end
$$;

drop trigger if exists catechism_document_batch_replace_same_type on public.catechism_document_batch_items;
create trigger catechism_document_batch_replace_same_type
before insert on public.catechism_document_batch_items
for each row execute function public.catechism_document_batch_replace_same_type();
