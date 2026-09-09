create function public.reply_to_request(p_actor uuid,p_request uuid,p_key uuid,p_body text,p_status text) returns void language plpgsql security definer set search_path=public as $$
declare r clarification_requests;recipient uuid;begin
 select * into r from clarification_requests where id=p_request for update;
 if not found or(p_actor not in(r.sender_id,r.recipient_id) and not exists(select 1 from profiles where id=p_actor and moderator)) then raise exception 'FORBIDDEN';end if;
 if length(p_body) not between 1 and 10000 or p_status not in('Open','In progress','Resolved','Closed') then raise exception 'INVALID';end if;
 if exists(select 1 from jsonb_array_elements(r.replies) x where x->>'id'=p_key::text) then return;end if;
 update clarification_requests set status=case when p_actor=r.recipient_id then p_status else status end,replies=replies||jsonb_build_array(jsonb_build_object('id',p_key,'author',case when p_actor=r.recipient_id then 'Author' when p_actor=r.sender_id then 'Requester' else 'Moderator' end,'body',p_body,'at',now())) where id=r.id;
 recipient:=case when p_actor=r.sender_id then r.recipient_id else r.sender_id end;
 insert into notifications(owner_id,event_key,title,body,href) values(recipient,p_key::text,'A reply to your private request','Open your inbox to read it.','/w/inbox') on conflict(owner_id,event_key) do nothing;
end$$;
revoke all on function public.reply_to_request(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reply_to_request(uuid,uuid,uuid,text,text) to service_role;
