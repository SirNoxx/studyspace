-- Account-ID invitations must not depend on an optional community profile.
-- Replace only the recipient guard, preserving locks, quotas, idempotency,
-- membership checks and the private core function's existing privileges.
do $migration$
declare
 definition text := pg_get_functiondef('public.community_command_core(text,jsonb,uuid)'::regprocedure);
 old_guard text := $old$if c.owner_id is distinct from a or target=a or public.community_blocked(a,target) or not exists(select 1 from public.community_profiles where id=target) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;$old$;
 new_guard text := $new$if c.owner_id is distinct from a then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
  if target=a then raise exception 'INVITE_SELF' using errcode='PT400'; end if;
  if public.community_blocked(a,target) then raise exception 'BLOCKED' using errcode='42501'; end if;
  if target is null or not exists(select 1 from auth.users where id=target) then raise exception 'INVITEE_UNAVAILABLE' using errcode='PT400'; end if;$new$;
begin
 if position(old_guard in definition)=0 then
  raise exception 'Unexpected community invitation guard; review migration before applying';
 end if;
 execute replace(definition,old_guard,new_guard);
end $migration$;
