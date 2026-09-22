-- 0007 Realtime: owners follow a walk live. New GPS points and tap events are
-- broadcast; Realtime checks the existing RLS policies before delivering a row,
-- so a client only receives points and events for walks their dogs are on.

alter publication supabase_realtime add table gps_points, walk_events;
