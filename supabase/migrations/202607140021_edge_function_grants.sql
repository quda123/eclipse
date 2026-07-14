-- Edge Functions use the service-role JWT to perform compensated account writes.
-- RLS bypass does not replace ordinary table privileges, so grant only the
-- relations required by create-student and manage-student.
grant select, insert, update, delete on table
  public.profiles,
  public.organization_members,
  public.teacher_student_links,
  public.audit_logs
to service_role;
