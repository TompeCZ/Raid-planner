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
npm run db:studio         # GUI Drizzle Studio

npm test                  # unit testy (Vitest, `vitest run`)
npx tsc --noEmit           # typecheck (samostatný lint skript není definován)
```

⚠️ Nikdy nepoužívej `drizzle-kit push` / `db:push`. Tiše shodí ručně psané DB objekty, které Drizzle neumí vyjádřit ve `schema.ts` — exclusion constraint (`btree_gist`), triggery, partial unique indexy a `ENABLE ROW LEVEL SECURITY` (deny-by-default RLS na všech tabulkách v `public`, bez policies — viz `drizzle/0009_enable_rls.sql`). Schema se mění výhradně: `db:generate` → ruční doplnění constraintů/indexů/triggerů/RLS do `drizzle/*.sql` → `db:migrate`.

Unit testy (Vitest) žijí vedle testovaného kódu jako `*.test.ts` — čistě validace/přechody
stavů/serializace (`raid-validation`, `raid-status`, `absence-validation`, `setup-validation`,
`local-date`, `month-grid`, `ical`, `discord-emoji`, `discord-announcement`, `discord-setup-embed`),
žádné nesahají na DB ani na Supabase. Pokud testovaná funkce žije v souboru, který (třeba tranzitivně
přes `@/lib/auth`) importuje `server-only`, vyčleň ji do samostatného čistého modulu (viz
`characters/main-error.ts`, `setup/discord-setup-embed.ts`) — jinak test spadne na runtime throw z
`server-only`, ne na assert. Absence-conflict detekce a setup builder actions (DB dotazy, upserty,
Discord webhook volání) testy zatím nemají — vyžadovalo by to testovací DB nebo mockování Postgres.

Vyžaduje `.env` (viz `.env.example`) s `DATABASE_URL` (Supabase Postgres), `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` a `NEXT_PUBLIC_SITE_URL`. Discord OAuth client id/secret se nastavují
v Supabase dashboardu (Authentication > Providers > Discord), aplikace je sama nečte. `DISCORD_RAID_WEBHOOK_URL`
a `DISCORD_EMOJI_*` jsou volitelné (viz „Discord publikace" níže) — bez nich Discord publikace jen
vrátí chybu v UI, appka nespadne.

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
  `getCurrentAppUser()` (aby se app user materializoval ihned) a přesměruje na `next` (default `/` —
  dashboard). Rozlišení redirect base záměrně ignoruje `NEXT_PUBLIC_SITE_URL`, pokud obsahuje
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

`assignment.groupNo` je CHECK omezený na `1..8` (40man: 8 skupin × 5 slotů), `assignment.slotNo` na
`1..5` (přesná pozice v rámci skupiny — kliknutím na 3. slot tam postava zůstane, i když 1.–2. jsou
prázdné). Uniqueness `(raidId, groupNo, slotNo)` se nevynucuje v DB, jen aplikačně v `assignToGroup()`
(`src/app/raids/[raidId]/setup/actions.ts`) — obsazený slot vrátí chybu, swap dvou umístěných postav
řeší `swapAssignments()` v transakci.

`character.isMain` — max 1 hlavní postava na hráče, vynuceno partial unique indexem
`character_one_main_per_user` (`ON character (user_id) WHERE is_main AND deleted_at IS NULL`),
doplněným ručně do migrace stejně jako ostatní partial/exclusion constrainty (Drizzle partial unique
přes bool+NULL podmínku sám nevygeneruje). `setMain()`/`unsetMain()` (`src/app/characters/actions.ts`)
NEODZNAČUJÍ automaticky předchozí hlavní — konflikt spadne na unique indexu (Postgres `23505`),
zachyceno a přeloženo na českou hlášku v `friendlyMainError()` (`src/app/characters/main-error.ts`,
odděleno od `actions.ts` kvůli testovatelnosti bez tažení `server-only` řetězce přes `@/lib/auth`).

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

### Odvozené zobrazovací jméno hráče

`src/lib/display-name.ts#resolveDisplayName(user, mainCharacterName)` — všude, kde se hráč zobrazuje
OSTATNÍM (roster/bench v setup builderu, seznam přihlášených na detailu raidu), se místo Discord
`displayName` použije jméno hráčovy hlavní (nesmazané) postavy, pokud nějakou má. `mainCharacterName`
vždy dodává `src/lib/main-character.ts#getMainCharacterNamesByUserId()` (JOIN filtrovaný na
`isMain AND deletedAt IS NULL`), nikdy se nekontroluje uvnitř `resolveDisplayName` samotné — proto je
to čistá, snadno testovatelná funkce. Vlastní pohled hráče na sebe (`/characters`, `/absences`) fallback
neřeší, tam zůstává Discord jméno.

### Setup builder: cross-raid nedostupnost a hlavní postava

- `src/lib/character-availability.ts#findUsersConfirmedElsewhere()` proaktivně označí v rosteru
  postavy CONFIRMED v jiném časově překrývajícím se raidu (dřív, než na to narazí exclusion constraint
  invariantu 1) — BENCH se nepočítá, stejná výjimka jako u samotného constraintu. Klíčováno na
  **hráče** (`userId`), ne na konkrétní postavu: za jednoho hráče nejde jít dvěma postavami současně,
  takže jakmile má CONFIRMED postavu jinde, zešednou v rosteru VŠECHNY jeho postavy, ne jen ta jedna
  konkrétní, přes kterou se to zjistilo.

### Kalendář, dashboard a iCal odběr

- `/` (dashboard, `src/app/page.tsx` + `src/app/actions.ts#getDashboardRaids`) — rozcestník na
  ostatní vertikály + read-only 7denní přehled (dnes..+6), bucketovaný podle **lokálního** dne
  (Europe/Prague), ne UTC. Absence se sem záměrně nedávají (drženo lehké) — žijí v `/calendar`.
  Přesměrování po loginu/OAuth (`login/page.tsx`, `auth/callback/route.ts`) míří sem, ne na
  `/characters`.
- `src/lib/local-date.ts#toPragueDateKey()`/`pragueDateKeyPlusDays()` — jediné správné místo pro
  převod instantu (UTC `Date`) na kalendářní den. Přes `Intl.DateTimeFormat` s `timeZone:
  "Europe/Prague"`, žádná ruční offset aritmetika — řeší DST správně. Používej VŽDY místo
  `date.toISOString().slice(0,10)`, jinak večerní raid může spadnout na špatný (dřívější/pozdější)
  den. `pragueDateKeyPlusDays` kotví na poledni UTC, aby sčítání dní nesklouzlo přes DST přechod.
- `/calendar` (`src/app/calendar/`) — měsíční mřížka (`month-grid.ts#buildMonthGrid`, čistá funkce,
  týden Po–Ne, přesah z okolních měsíců). Data (`actions.ts#getCalendarMonth`): raidy mimo
  DRAFT/CANCELLED bucketované podle lokálního dne jako dashboard; absence jsou čisté `DATE` rozsahy
  (`fromDate`..`toDate`), žádné TZ řešení — jen řetězcové porovnání `absencesForDay()`. Klik/hover na
  den ukáže pod mřížkou panel s absencemi toho dne — jméno přes `resolveDisplayName`, barva podle
  `character.class` (`characters/constants.ts#CLASS_COLORS`, standardní WoW paleta; Priest je bílý,
  proto má chip vždy jednotný neutrální rámeček, ne barevný podle třídy). Responzivita raid-markeru
  (pill se jménem na širokém / jen tečka na úzkém) je čistě CSS media query (`.cal-raid-marker` v
  `globals.css`), ne JS breakpoint detekce.
- `/api/calendar/[token]` (`route.ts`) — veřejný (bez loginu) iCal feed, ověřený přes
  `user.calendar_token` (nullable, plný `UNIQUE`, migrace 0004). Obsahuje JEN raidy (žádné absence),
  rolující okno dnes−30 dní..budoucnost, mimo DRAFT/CANCELLED. Generování/regenerace
  tokenu (`src/app/actions.ts#generateCalendarToken`) používá `sql\`gen_random_uuid()\`` přímo v
  UPDATE (stejné rozšíření `pgcrypto` jako `character.id` apod.) — přegenerování okamžitě zneplatní
  starou odběrovou URL. `src/lib/ical.ts` je čistá VCALENDAR/VEVENT serializace (RFC5545 escaping
  `\`/`;`/`,`/newline, `UID` = `raid.id`, časy vždy `...Z` v UTC) oddělená od route handleru kvůli
  testovatelnosti bez DB.

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
- `/` (dashboard) + `/calendar` + `/api/calendar/[token]` — read-only přehled a měsíční kalendář
  (raidy + absence), iCal odběr do Google/Apple kalendáře. Viz „Kalendář, dashboard a iCal odběr" výše.
- Discord publikace (oznámení raidu + setup) — viz „Discord publikace" níže.
- Docházka (`attendance_record`, per `(raid_id, user_id)`) — při přechodu raidu do `DONE` se v
  `raids/[raidId]/actions.ts#setRaidStatus()` roster (distinct userId ze CONFIRMED+BENCH assignmentů)
  automaticky naseeduje: `PRESENT`, nebo `ABSENCE` + `note` má-li hráč aktivní absenci pokrývající den
  raidu (čistá funkce `attendance-seed.ts#deriveSeededAttendance`, idempotentní `on conflict do nothing`).
  RL/ADMIN pak ručně přeznačí (`setAttendance()`, 6 stavů) v panelu na detailu raidu
  (`attendance-panel.tsx`, viditelný jen v `DONE`); ostatní jen čtou.
- Poznámky vedení (`/roster`, `/roster/[userId]`) — neveřejná data o hráčích, gate v datové vrstvě
  (`canAccessNotes()` v `src/lib/auth.ts`, stejný predikát jako `canManageRaids()`), ne jen schované UI.
  `note` je subject-anchored (kotva `subjectUserId`; `characterId`/`raidId` volitelný kontext), ne
  polymorfní podle `targetType` jako předchozí skeleton — composite FK `note_character_subject_fk`
  (`MATCH SIMPLE`) vynutí, že postava patří subjektu. `visibility` `LEADERSHIP`/`PRIVATE` — `PRIVATE`
  vidí/edituje/maže jen autor, ani ADMIN ji nevidí (`src/lib/notes-query.ts#visibleNotesFilter`, čistý
  ekvivalent testovaný v `notes-visibility.ts#isNoteVisibleTo`). `pinned` je výjimka z pravidla "jen
  autor" — připnout/odepnout smí kdokoli z vedení, kdo na poznámku vidí (`togglePinned()` staví na
  `requireVisibleNote()`, ne `requireEditableNote()`), protože pin kuruje stream vedení, needituje obsah.
  Editace zakládá `note_revision` se starým tělem (transakce s UPDATE). **Nikdy nepíše do `audit_log`**
  (ten je veřejný, poznámky ne). Mazání je **soft delete** (`note.deletedAt`, stejný vzor jako
  `user`/`character`) — nikdy `db.delete`, jinak by `ON DELETE CASCADE` na `note_revision` smazal
  i historii editací a bez `audit_log` záznamu by po poznámce nezůstala žádná stopa; smazaná poznámka
  není viditelná nikomu (`isNoteVisibleTo` to kontroluje ještě před `visibility`).
  `getRosterOverview()` recykluje `attendance-query.ts#getAttendanceRowsInPeriod` +
  `attendance-stats.ts#computeAttendanceStats` — žádná nová logika metrik; poznámkovou agregaci
  (`noteCount`/`hasOpenConcern`/kategorie) filtruje na zvolené období v JS
  (`notes-visibility.ts#aggregateNotesBySubject` + `isWithinPeriod`), ne v SQL — pražská timezone má žít
  jen na jednom místě, stejně jako u docházky. `user.guildRank` (nullable enum, ručně nastavováno) řadí
  roster; sync z Battle.net API je BACKLOG. Kontextové psaní poznámky přímo z rosteru raidu
  (`raids/[raidId]/add-note-button.tsx`), ne jen ze samostatné `/roster` sekce.

Create/update/cancel/setup raidu je omezené na role `RAID_LEADER`/`ADMIN` — predikát `canManageRaids()`
v `src/lib/auth.ts`, vynucený v server actions přes lokální `requireRaidLeader()` a zrcadlený v UI
(skrytí formulářů a tlačítek ne-leaderům). Kdokoli s rolí RL smí editovat setup libovolného raidu —
"jen někteří RL na raid" je BACKLOG.

`src/lib/audit.ts#logAudit()` zapisuje do `audit_log` jen smysluplné akce (přechod stavu raidu,
přiřazení/bench/odebrání postavy ze setupu, vznik absence-konfliktu, Discord publikace) — ne každý klik.

### Discord publikace (oznámení raidu + setup)

Druhá Discord integrace vedle absence-conflict pingu (`src/lib/discord-webhook.ts` — `sendDiscordWebhook`
zůstal beze změny chování, jen teď deleguje na `postDiscordMessage`). Jeden sdílený kanál pro celou
guildu přes env `DISCORD_RAID_WEBHOOK_URL` (ne DB `discordWebhookUrl`/`discordWebhookOverride`, to zůstává
jen pro absence-conflict ping). TODO(multi-room): časem víc kanálů → přejít z env na tabulku kanálů.

- **Oznámení** — `raids/[raidId]/actions.ts#announceRaidToDiscord()`, tlačítko v `raid-header.tsx`,
  dostupné od stavu `OPEN`. `@here` + instance/datum (Europe/Prague) + statický počet přihlášených +
  odkaz na raid — pinguje se v `content` (plaintext), embed by nepingnul. Message id se ukládá do
  `raid.discordAnnouncementMessageId`; druhé a další spuštění zprávu EDITUJE (osvěží počet) místo nové.
- **Setup** — `raids/[raidId]/setup/actions.ts#publishSetupToDiscord()`, tlačítko v `setup-board.tsx`,
  jen v `LOCKED`. Embed (`setup/discord-setup-embed.ts#buildSetupEmbed`, čistá funkce): skupiny G1–8 jako
  inline fieldy (Discord si je sám poskládá 3 na řádek), bloky Bench/Late/Absence pod nimi. Jméno ve
  skupině/na benchi/Late = PŘIŘAZENÁ postava (Late bez přiřazení: SINGLE mód → postava ze signupu, ALL
  mód bez přiřazení → fallback na hlavní jméno hráče, protože ořezaný pool může mít víc postav a nejde
  jednoznačně vybrat — okomentováno v kódu). Absence = hlavní jméno (`resolveDisplayName`), nikdy
  nepinguje. Content pinguje sjednocení CONFIRMED+BENCH+LATE jako `<@discordId>`.
  Class emoji (`src/lib/discord-emoji.ts#emojiFor`) je config-driven přes `DISCORD_EMOJI_*`; prázdné
  (výchozí) = Unicode emoji podle role, plnohodnotný stav, ne placeholder.
  Message id v `raid.discordSetupMessageId`; re-publikace EDITUJE stejnou zprávu a navíc spočítá diff
  proti `raid.discordSetupSnapshot` (`discord-setup-embed.ts#diffSetupSnapshots`, jeden záznam na
  `userId`, priorita CONFIRMED > BENCH > LATE) — přidané/stažené hráče ohlásí NOVOU fire-and-forget
  zprávou (editace zprávy nepinguje), snapshot se pak přepíše.

Zatím neimplementováno (existuje jen jako schema/spec, viz `docs/spec.md` §7–8): drag-and-drop v setup
builderu, přepínač „jen někteří RL" pro setup, auto-lock raidu podle času, WCL import háčky, skutečné
DM hráčům (fáze 2 s hostovaným botem), sync guild ranku z Battle.net API.
