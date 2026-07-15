-- Deny-by-default RLS na všech tabulkách v public.
-- Žádné policies se nepřidávají záměrně: PostgREST/anon nemá mít přístup k ničemu.
-- Drizzle jede pod rolí s BYPASSRLS, server actions tím nejsou dotčené.
-- Realtime se nepoužívá, takže absence policies nikde nezpůsobí výpadek eventů.

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "character" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "raid_template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "raid" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signup_character" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "absence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "note_revision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: odebrat granty, aby ani omylem přidaná permisivní policy
-- nezpřístupnila data anon klíči.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
