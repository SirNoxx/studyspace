-- Evaluate identity and account status once per statement, not once per row.
alter policy community_blocks_read on public.community_blocks using(owner_id=(select auth.uid()) and (select public.community_live()));
alter policy community_follows_read on public.community_follows using(owner_id=(select auth.uid()) and (select public.community_live()));
alter policy community_topics_read on public.community_topics using(owner_id=(select auth.uid()) and (select public.community_live()));
alter policy community_saves_read on public.community_saves using(owner_id=(select auth.uid()) and (select public.community_live()));
alter policy community_downloads_read on public.community_downloads using(owner_id=(select auth.uid()) and (select public.community_live()));
alter policy community_mutations_read on public.community_mutations using(actor_id=(select auth.uid()) and (select public.community_live()));
alter policy community_reports_read on public.community_reports using((select public.community_moderator()) or (owner_id=(select auth.uid()) and (select public.community_live())));
alter policy community_comments_read on public.community_comments using(not hidden and public.community_post_visible(post_id) and not public.community_blocked(owner_id,(select auth.uid())));
alter policy shared_invites_read on public.shared_invites using((select public.community_live()) and (recipient_id=(select auth.uid()) or exists(select 1 from public.shared_collections where id=collection_id and owner_id=(select auth.uid()))));
