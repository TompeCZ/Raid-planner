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

npx tsc --noEmit           # typecheck (samostatný lint skript není definován)
```

Testovací sada v repu zatím není.

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
  triggery (`BEFORE INSERT/UPDATE` na `assignment`, `AFTER UPDATE` na `raid`).
- **Invariant 2** (assignment se zablokuje, má-li jeho majitel překrývající se `Absence`):
  `BEFORE INSERT/UPDATE` trigger na `assignment` — jde o cross-table kontrolu, kterou čistý constraint
  nepokryje.
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

### Struktura aplikace

Feature vertikály žijí pod `src/app/<feature>/`, typicky s:
- `page.tsx` — Server Component, provede auth kontrolu přes `getCurrentAppUser()` + redirect, pak
  renderuje.
- `actions.ts` — modul `"use server"` s Drizzle dotazy/mutacemi pro danou featuru, hlídaný lokálními
  helpery `requireAppUser()`/kontrolou vlastnictví (opakované v každém souboru zvlášť, ne přes sdílený
  middleware).
- Client Components (`"use client"`) pro interaktivní formuláře/řádky, používající `useTransition` +
  `startTransition` kolem přímého volání server actions (žádné samostatné API routes).

Aktuálně implementované vertikály: `characters` (CRUD vlastních postav, soft delete) a `raids` +
`raids/[raidId]` (CRUD raidů, signup hráče s poolem postav, zobrazení rosteru). Autorizace pro
create/update/cancel raidu je zatím otevřená komukoliv přihlášenému ("VARIANTA B" v kódu), s `TODO`
komentáři značícími, kde by se to mělo omezit na `RAID_LEADER`/`ADMIN` — než budeš předpokládat, že
kontrola role existuje, ověř tyhle TODO.

Zatím neimplementováno (existuje jen jako schema/spec, viz `docs/spec.md` §7–8): setup builder pro
`Assignment`, `AttendanceRecord`, `Note`, `AuditLog`, Discord webhook push, WCL import háčky.
