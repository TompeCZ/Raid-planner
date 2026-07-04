# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Jazykové konvence

- Odpovídej česky.
- Commit messages piš anglicky, v imperativu.
- Kód komentuj česky.

## O čem to je

Raid & Absence Planner — webová aplikace nahrazující Discord Raid‑Helper + tabulku dovolených pro
plánování raidů a evidenci absencí ve sloučené WoW TBC Classic (Anniversary) guildě. Jeden sloučený
roster; jednotkou přihlášení je **hráč (User)**, ne postava — hráč deklaruje dostupnost a nabídne pool
použitelných postav, raid leader z něj ručně postaví reálný setup.

Kompletní doménová specifikace je v `docs/spec.md` — přečti si ji, než budeš dělat cokoliv nad rámec
aktuálně existujících vertikál `characters`/`raids`. `docs/er-diagram.md` je kontrolní diagram proti
tomuto specu a popisuje, **kde přesně** je který cross-table invariant vynucen (exclusion constraint
vs. trigger vs. aplikační kód) — podívej se tam, než přidáš logiku dotýkající se `Assignment`,
`Signup` nebo `Absence`.

## Příkazy

```bash
npm run dev              # dev server Next.js
npm run build             # produkční build
npm start                 # spuštění produkčního buildu

npm run db:generate       # vygeneruje Drizzle migraci ze src/db/schema.ts
npm run db:migrate        # aplikuje migrace z drizzle/
npm run db:push           # promítne schema přímo bez migračního souboru — jen pro dev
npm run db:studio         # GUI Drizzle Studio

npm test                  # unit testy (Vitest, `vitest run`)
npx tsc --noEmit           # typecheck (samostatný lint skript není definován)
```

Unit testy (Vitest) žijí vedle testovaného kódu jako `*.test.ts` — čistě validace/přechody stavů
(`raid-validation`, `raid-status`, `absence-validation`, `setup-validation`), žádné nesahají na DB ani
na Supabase. Absence-conflict detekce a setup builder actions (DB dotazy, upserty, Discord webhook)
testy zatím nemají — vyžadovalo by to testovací DB nebo mockování Postgres.

Vyžaduje `.env` (viz `.env.example`) s `DATABASE_URL` (Supabase Postgres), `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` a `NEXT_PUBLIC_SITE_URL`. Discord OAuth client id/secret se nastavují
v Supabase dashboardu (Authentication > Providers > Discord), aplikace je sama nečte.

## Architektura

**Stack:** Next.js (App Router) + React 19, Supabase (Postgres + Discord OAuth), Drizzle ORM,
TypeScript. Bez hostovaného Discord bota — odchozí integrace je jen přes webhooky (zatím jen
naplánováno, není postaveno).

### Auth: dvě oddělené vrstvy identity

- **Supabase auth** (`src/lib/supabase/{client,server,middleware}.ts`) řeší jen OAuth handshake a
  session cookies. K datům aplikace se přes něj nikdy nepřistupuje.
- **Tabulka `user`** (Drizzle, `src/db/schema.ts`) je skutečná identita používaná všude jinde, klíčem
  je `discordId`. `src/lib/auth.ts#getCurrentAppUser()` (obalené React `cache()`) napáruje aktuální
  Supabase session na app `User` řádek — při prvním zavolání v rámci requestu ho případně založí nebo
  obnoví (zruší soft delete).
- Middleware (`middleware.ts` → `updateSession`) obnovuje Supabase session cookie při každém requestu;
  musí volat `supabase.auth.getUser()` (ne `getSession()`), jinak se token neobnoví.
- OAuth callback (`src/app/auth/callback/route.ts`) vymění code za session, hned zavolá
  `getCurrentAppUser()` (aby se app user materializoval ihned) a přesměruje na `next` (default
  `/characters`). Rozlišení redirect base záměrně ignoruje `NEXT_PUBLIC_SITE_URL`, pokud obsahuje
  `0.0.0.0` (typicky omylem zkopírovaná dev hodnota), a spadne zpět na `origin` z requestu.
- Přístup k datům jde vždy přes Drizzle ze server vrstvy Next.js (Server Components, Server Actions,
  Route Handlers) — nikdy přímo z prohlížeče. Supabase Row Level Security je zamýšlené jen jako
  pojistka na citlivé tabulky (spec vyžaduje `Note` = jen LEADERSHIP), ne jako primární autorizační
  model; autorizace se vynucuje ve vrstvě server actions (viz vzory `requireAppUser` /
  `requireOwnCharacter` / `requireRaid` v `src/app/**/actions.ts`).

### Invarianty datového modelu žijí částečně mimo Drizzle

`src/db/schema.ts` je zdroj pravdy pro typy a většinu DDL, ale několik Postgres-nativních mechanismů
nejde v Drizzle vyjádřit a jsou ručně dopsané do `drizzle/0000_init.sql` nad rámec vygenerované
migrace:

- **Invariant 1** (postava smí být `CONFIRMED` max v jednom časově se překrývajícím raidu): partial
  `EXCLUDE USING gist` constraint na `assignment`, omezený na `WHERE status = 'CONFIRMED'` (bench
  assignmenty jsou vyjmuty — leader smí stejnou postavu tužkou hodit do dvou raidů). Vyžaduje
  rozšíření `btree_gist`. Protože exclusion constraint nemůže odkazovat sloupce jiné tabulky, jsou
  `assignment.startsAt`/`endsAt` denormalizované kopie časů z nadřazeného `raid`, držené v synchronu
  triggery (`BEFORE INSERT/UPDATE` na `assignment`, `AFTER UPDATE` na `raid`). Setup builder (viz níže)
  proto při insertu/upsertu `assignment` posílá `startsAt`/`endsAt` jen jako placeholder pro NOT NULL —
  hodnotu vždy přepíše trigger, appka ji nikdy nepočítá.
- **Invariant 2** (assignment se zablokuje, má-li jeho majitel překrývající se `Absence`):
  `BEFORE INSERT/UPDATE` trigger na `assignment` — jde o cross-table kontrolu, kterou čistý constraint
  nepokryje. Tohle je jen **forward směr** (nelze přiřadit už-absentního hráče). Reverse směr (absence
  založená/rozšířená AŽ PO existujícím `CONFIRMED` assignmentu) trigger nezachytí — řeší se aplikačně,
  viz „Absence-konflikt (reverse flow)" níže.
- **Invariant 3/4** (signup smí nabídnout jen hráčovy vlastní `isRaidReady` postavy; `SIGNUP_MODE
  SINGLE` = právě jedna postava): triggery na `signup_character`. Pravidlo „`ALL` mód potřebuje ≥1
  postavu" je naopak vynucené jen v aplikačním kódu (viz `submitSignup` v
  `src/app/raids/[raidId]/actions.ts`), ne v DB.
- Composite FK `(characterId, userId)` na `assignment` do `character(id, userId)` je to, díky čemu DB
  sama garantuje `Assignment.userId == Character.userId` — bez potřeby triggeru.
- Idempotentní generování instancí raidu ze `RaidTemplate` se opírá o partial index
  `UNIQUE(templateId, startsAt) WHERE templateId IS NOT NULL` na `raid`.

Při změně `src/db/schema.ts` spusť `npm run db:generate` a ověř, jestli vygenerovaná migrace
potřebuje znovu ručně doplnit stejné dodatky (Drizzle SQL pro triggery/exclusion constraint sám
nevygeneruje) — porovnej s tabulkou „Vynucení nad rámec FK" v `docs/er-diagram.md` a s
`docs/schema-proposal.sql`, než budeš migraci ručně upravovat.

Soft delete je napříč schématem jednotný: `deletedAt timestamptz NULL`, nikdy boolean `active` flag,
a u `user` nikdy hard delete.

`assignment.groupNo` je CHECK omezený na `1..8` (40man: 8 skupin × 5 slotů). Kapacitu 5/skupinu CHECK
nehlídá — to je aplikační pravidlo v `assignToGroup()` (`src/app/raids/[raidId]/setup/actions.ts`),
protože „slot" uvnitř skupiny nemá vlastní sloupec/identitu, jen pořadí v UI.

### Absence-konflikt (reverse flow) — odvozený dotaz, ne uložený flag

Když hráč založí/rozšíří `Absence`, která nově pokrývá raid, kde už má `CONFIRMED` `Assignment`,
appka postavu **NEODEBÍRÁ** ze setupu — jen ji označí jako konfliktní. Řešeno v
`src/lib/absence-conflicts.ts#findConflictedAssignments()`: JOIN `assignment` (status `CONFIRMED`) ×
`raid` × `absence` (bez `deletedAt`), stejná podmínka data jako v triggeru
`assignment_block_on_absence` (`DATE(starts_at AT TIME ZONE 'UTC')` mezi `from_date`/`to_date`).

**Rozhodnutí:** konflikt se **nepersistuje** do sloupce/flagu na `assignment` — počítá se odvozeně při
každém čtení. Důvod: uložený flag by se musel ručně přepočítávat při zkrácení/zrušení absence, posunu
raidu nebo smazání assignmentu, jinak zůstane nesynchronně visieť (stale). Odvozený dotaz je vždy
aktuální a jediný zdroj pravdy je stejný jako pro forward-only trigger. Cena je JOIN navíc při čtení
(setup builder, dashboard `/raids`) — pro objem dat týdenního raidování zanedbatelné.

Použití stejné funkce na třech místech:
- setup builder (`raids/[raidId]/setup/actions.ts#getSetupData`) — konflikt per raid, vizuálně
  odlišená karta (`⚠`, jantarový rámeček) v `setup-board.tsx`.
- dashboard `/raids` (`raids/page.tsx`) — badge „⚠ absence-konflikt v setupu" u raidu, viditelný jen
  pro `RAID_LEADER`/`ADMIN`.
- `src/app/absences/actions.ts#notifyNewAbsenceConflicts` — po zápisu absence spočítá množinu
  konfliktů PŘED a PO zápisu; pošle Discord ping jen na NOVĚ vzniklé konflikty (aby needitace jiné
  absence nespamovala staré, už známé konflikty). Webhook = `raid.discordWebhookOverride ??
  raidTemplate.discordWebhookUrl`; když žádný není nastavený, `sendDiscordWebhook()` (`src/lib/
  discord-webhook.ts`) mlčky nic neudělá — nikdy nevyhazuje.

### Struktura aplikace

Feature vertikály žijí pod `src/app/<feature>/`, typicky s:
- `page.tsx` — Server Component, provede auth kontrolu přes `getCurrentAppUser()` + redirect, pak
  renderuje.
- `actions.ts` — modul `"use server"` s Drizzle dotazy/mutacemi pro danou featuru, hlídaný lokálními
  helpery `requireAppUser()`/kontrolou vlastnictví (opakované v každém souboru zvlášť, ne přes sdílený
  middleware).
- Client Components (`"use client"`) pro interaktivní formuláře/řádky, používající `useTransition` +
  `startTransition` kolem přímého volání server actions (žádné samostatné API routes).

Aktuálně implementované vertikály:
- `characters` — CRUD vlastních postav, soft delete.
- `raids` + `raids/[raidId]` — CRUD raidů, ruční přechody stavu (`raid-status.ts`,
  `canTransitionRaidStatus`), signup hráče s poolem postav, zobrazení rosteru.
- `absences` — CRUD vlastních absencí (bez schválení/workflow, jen nahlásit/upravit/zrušit); zápis
  spouští reverse-flow detekci absence-konfliktu (viz níže).
- `raids/[raidId]/setup` — setup builder: mřížka 8 skupin × 5 slotů (`CONFIRMED`) + bench (`BENCH`),
  click-click přiřazování (bez drag-and-drop — to je BACKLOG), 1 hráč = max 1 postava v rámci raidu
  (aplikační pravidlo, ne DB constraint), vizuální konflikt při absenci.

Create/update/cancel/setup raidu je omezené na role `RAID_LEADER`/`ADMIN` — predikát `canManageRaids()`
v `src/lib/auth.ts`, vynucený v server actions přes lokální `requireRaidLeader()` a zrcadlený v UI
(skrytí formulářů a tlačítek ne-leaderům). Kdokoli s rolí RL smí editovat setup libovolného raidu —
"jen někteří RL na raid" je BACKLOG.

`src/lib/audit.ts#logAudit()` zapisuje do `audit_log` jen smysluplné akce (přechod stavu raidu,
přiřazení/bench/odebrání postavy ze setupu, vznik absence-konfliktu) — ne každý klik.

Zatím neimplementováno (existuje jen jako schema/spec, viz `docs/spec.md` §7–8): publikování setupu do
Discordu (samostatná vertikála — webhook infrastruktura z absence-konfliktu se dá znovupoužít),
drag-and-drop v setup builderu, přepínač „jen někteří RL" pro setup, auto-lock raidu podle času,
`AttendanceRecord`, `Note`, WCL import háčky.
