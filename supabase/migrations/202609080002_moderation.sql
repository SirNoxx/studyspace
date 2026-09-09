create function public.moderate_publication(p_actor uuid,p_publication uuid,p_action text,p_report uuid) returns void language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from profiles where id=p_actor and moderator) then raise exception 'FORBIDDEN';end if;
 if p_action not in ('hide','restore') then raise exception 'INVALID_ACTION';end if;
 update publications set hidden=(p_action='hide') where id=p_publication;
 if not found then raise exception 'UNAVAILABLE';end if;
 insert into moderation_actions(actor_id,publication_id,action) values(p_actor,p_publication,p_action);
 if p_report is not null then update reports set status='resolved' where id=p_report and publication_id=p_publication;end if;
end$$;
revoke all on function public.moderate_publication(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.moderate_publication(uuid,uuid,text,uuid) to service_role;
drop policy profile_read on public.profiles;
create policy profile_read on public.profiles for select using(id=auth.uid() or exists(select 1 from public.publications p where p.owner_id=profiles.id and public.public_available(p.id)));
