# Raid & Absence Planner — Specifikace v1

Webová aplikace pro sloučenou WoW TBC Classic (Anniversary) guildu. Nahrazuje Raid‑Helper (Discord) a tabulku dovolených jedním nástrojem. Jeden sloučený roster, žádné dělení po guildách.

**Klíčový princip:** jednotkou přihlášení je **hráč (User)**, ne postava. Hráč deklaruje dostupnost a nabídne pool použitelných postav; raid leader z poolu staví setup ručně. Dlouhodobá absence automaticky vyřazuje hráčovy postavy z raidů v daném termínu.

> **Stav dokumentu:** v1, korekce po review zapracovány (endsAt, trigger vs. constraint, partial unique, UTC, composite FK, deletedAt, roleQuota typ, CONFIRMED‑only zámek). Tech stack zafixován: Supabase + Drizzle + Discord OAuth.

---

## 1. Datový model

Konvence napříč modelem:
- **Časy:** vše `timestamptz` ukládané v **UTC**, převod na lokální čas až na klientu.
- **Soft delete:** jednotně `deletedAt timestamptz NULL` (žádné `active` booly).

### User
Účet, identita přes Discord OAuth.
- `discordId` — z OAuthu, slouží i pro @mention
- `displayName`
- `role` — `ADMIN` | `RAID_LEADER` | `MEMBER`

### Character
Postava patří Userovi.
- `userId` (FK)
- `name`, `realm`, `faction`
- `class`
- `role` — `TANK` | `HEALER` | `MELEE` | `RANGED`
- `isRaidReady` (bool) — ruční zaškrtátko = eligibilita
- `externalUrl` (nullable) — odkaz na armory/logs jako vodítko pro leadera
- `note` (nullable)
- `deletedAt` (nullable) — soft delete
- **UNIQUE(id, userId)** — kvůli composite FK z Assignmentu (viz invarianty)

### RaidTemplate
Šablona pro opakované raidy (střední cesta místo plné RRULE).
- `instance` — SSC, TK, Gruul, Mag, Kara…
- `dayOfWeek` + `defaultStartTime` — pro generování instancí
- `durationMinutes` — z něj se dopočítá `Raid.endsAt`
- `signupMode` — `ALL` | `SINGLE` (default pro generované raidy)
- `roleQuota` (nullable) — **JSONB pevného tvaru**, klíče = enum role: `{ "TANK": int, "HEALER": int, "MELEE": int, "RANGED": int }`
- `defaultCapacity`
- `discordWebhookUrl` — kanál pro tento den/tým (kanály po raid dnech; tři 10man RL mají vlastní)

Generování instancí: 2–3 týdny dopředu, případně tlačítko „vypiš příští termín". Signupy i absence se vyhodnocují **per‑instance**.

### Raid
Konkrétní instance raidu.
- `templateId` (nullable FK) — null = jednorázový raid
- `instance`
- `startsAt` (timestamptz), **`endsAt` (timestamptz)** — endsAt nutný pro exclusion constraint a pro UI („už v raidu X, od–do")
- `signupMode` — `ALL` | `SINGLE`
- `status` — `DRAFT` | `OPEN` | `LOCKED` | `DONE` | `CANCELLED`
- `capacity`, `notes`
- `wclReportCode` (nullable) — háček pro fázi 2 (WCL import)
- `discordWebhookOverride` (nullable) — jednorázové přesměrování jinam než template
- **UNIQUE(templateId, startsAt) partial `WHERE templateId IS NOT NULL`** — idempotence generování, brání duplicitám

Signup deadline / přechod do `LOCKED` = **ručně RL**.

### Signup
Odpověď **hráče** na raid (úroveň dostupnosti hráče).
- `raidId`, `userId`
- `status` — `YES` | `LATE` | `TENTATIVE` | `ABSENT`
- `note`

### SignupCharacter
Které postavy hráč do signupu nabízí (pool po ořezu).
- `signupId` (FK)
- `characterId` (FK)
- `lootNote` (nullable) — preference itemu je content‑specifická, proto patří sem, ne na Character

`SINGLE` mód → právě jeden řádek. `ALL` mód → jeden a více.

### Assignment
Reálný setup — leader vloží konkrétní postavu do raidu. Na téhle tabulce drží zámky.
- `raidId`, `characterId`, `userId`
- `roleInRaid`
- `group` (1–5 pro 25man)
- `status` — `CONFIRMED` | `BENCH`
- **composite FK `(characterId, userId) → Character(id, userId)`** — DB sama vynutí, že `Assignment.userId == Character.userId` (žádný trigger)

### Absence
- `userId`
- `fromDate`, `toDate` (DATE, **`toDate` inkluzivní** — absence 1.–5. pokrývá i celý 5.)
- `note`
- `deletedAt` (nullable) — rušitelná

Zobrazuje se v kalendáři. Pokrývá‑li termín raidu, hráčovy postavy se v setupu automaticky zašednou — hráč se **nemusí** přihlašovat jako ABSENT.

### AttendanceRecord
Ground‑truth docházky. RL značí během/po raidu.
- `assignmentId` (FK) — váže hráče i postavu
- `status` — `PRESENT` | `LATE_EXCUSED` | `LATE_NO_EXCUSE` | `NO_SHOW` | `LEFT_EARLY`
- `source` — `MANUAL` | `WCL_IMPORT` (háček pro fázi 2)
- `recordedBy`, `recordedAt`

### Note
Subjektivní poznámky vedení (druhá rovina historie).
- `authorId`
- `visibility` — zatím vždy `LEADERSHIP`
- `targetType` — `RAID` | `USER` | `GENERAL`
- `targetId` (nullable pro GENERAL)
- `body`, `createdAt`

### AuditLog
Veřejný, append‑only, jen smysluplné akce.
- `actorId`, `action`, `targetType`, `targetId` (polymorfní, **bez FK** — záměr)
- `description` (lidsky čitelný)
- `timestamp`
- **index na `(targetType, targetId)`**

Loguje se: raid vytvořen/zrušen, hráč benchnut, přepsaná cizí absence, setup odeslán do Discordu, změněn `signupMode`, označena docházka. **Neloguje se** každý drag‑drop postavy mezi groupami.

> Kalendář **není entita** — je to pohled nad Raidy + Absencemi.

---

## 2. Invarianty

1. **Jedna postava max v jednom CONFIRMED Assignmentu mezi časově se překrývajícími raidy.**
   - Vynuceno PostgreSQL **exclusion constraintem**: `EXCLUDE USING gist (characterId WITH =, tstzrange(startsAt, endsAt) WITH &&) WHERE (status = 'CONFIRMED')`.
   - Vyžaduje `CREATE EXTENSION IF NOT EXISTS btree_gist` (kvůli rovnosti na `characterId` v GIST indexu).
   - **Zámek platí jen na `CONFIRMED`, ne na `BENCH`** — bench je „možná", RL si stejnou postavu smí tužkou hodit do dvou raidů a rozhodnout se. Časový rozsah bere z `startsAt`/`endsAt`.
   - V setupu se obsazená (CONFIRMED) postava leaderovi zašedne s důvodem („už v raidu X, od–do").

2. **Assignment se zablokuje, pokud má majitel Absenci překrývající termín raidu.**
   - Cross‑table pravidlo → **BEFORE INSERT/UPDATE trigger** na Assignment (ne čistý constraint, ten tu nejde). Plus aplikační zašednutí pro UX.
   - Překryv: `Absence` (DATE, toDate inkluzivní) vs. `Raid.startsAt`.

3. **Signup smí nabídnout jen postavy s `isRaidReady = true`** daného hráče (aplikační + trigger kontrola).

4. **SINGLE** mód: signup nabízí právě jednu postavu. **ALL** mód: jednu a více (hráč může pool ořezat — „s tímhle altem nechci").

5. Hráč může jít na více raidů týdně přes různé postavy; per‑postava platí jen pravidlo č. 1.

---

## 3. Role a práva

- **ADMIN** — vše.
- **RAID_LEADER** — vytváří a edituje **jakýkoliv** raid i setup, značí docházku, píše a čte Notes, posílá setup do Discordu. Všechny zásahy leadera jdou do **veřejného** AuditLogu.
- **MEMBER** — spravuje vlastní postavy, přihlašuje se, nastavuje vlastní absence, vidí veřejnou historii a audit log. **Nevidí Notes.**

---

## 4. Historie — dvě roviny

- **Veřejná = počítaná data** (dotazy nad AttendanceRecord/Signup/Absence): docházka, spolehlivost, no‑show %, frekvence absencí.
- **Rovina vedení = Notes** (subjektivní).

**Profil hráče** agreguje obojí (Notes jen pro vedení). Filtry: hráč / časový rozsah / instance‑raid / typ poznámky / **stav docházky** (filtr NO_SHOW přes všechny).

---

## 5. Discord integrace

- **OAuth** — přihlášení a identita (řeší i fake signupy). Nativní Supabase provider.
- **Webhook push setupu** — visí na `RaidTemplate` (kanál per raid den; tři 10man RL = tři kanály), volitelný per‑raid override. Formát jako Raid‑Helper: roster (`CONFIRMED`) + bench + tentative + late + absence. Bez hostovaného bota.
- **Benched notifikace** — `@mention` (`<@discordId>`) ve veřejném kanálu přes webhook, když je benchnut někdo dříve zapsaný/nasazený. Webhook DM neumí → DM je fáze 2.

---

## 6. Tech stack (zafixováno)

- **Next.js (React) + Supabase (PostgreSQL)**
- **Drizzle ORM** — model je hodně Postgres‑native (exclusion constraint, partial indexy, triggery, composite FK); Drizzle nechá psát raw SQL migrace bez boje (Prisma se s tímhle pere).
- **Discord OAuth** přes Supabase auth providera.
- **Přístup k DB přes Next.js server vrstvu (server actions).** RLS nasadit jen jako pojistku na citlivé tabulky (**Notes = LEADERSHIP**), ne jako primární autorizační model.
- **Realtime** (Supabase) na živý setup/signupy/kalendář — víc RL edituje současně.
- Kalendářová komponenta: **FullCalendar** nebo **react‑big‑calendar**.
- Discord push přes **webhooky**, žádný hostovaný bot ve v1.
- Free tier pokryje guildu (~40–60 lidí).

---

## 7. v1 scope

- Discord OAuth login
- Správa postav (vč. `externalUrl`, `isRaidReady`)
- RaidTemplate + idempotentní generování instancí (2–3 týdny dopředu)
- Signup flow s `ALL`/`SINGLE` a ořezem poolu
- Setup builder (Assignment) se zámky dle invariantů 1–3
- Absence (od–do, rušitelné) s automatickým zašednutím
- Ruční značení docházky (5 stavů)
- Veřejný AuditLog (jen smysluplné akce)
- Veřejná statistika + Notes vedení, s filtry
- Discord webhook push setupu
- Benched `@mention`
- **WCL háčky**: pole `Raid.wclReportCode` a `AttendanceRecord.source` existují (bez import logiky)

---

## 8. Backlog (fáze 2+, přidatelné bez přepisu)

- **WCL import** — GraphQL API v2, OAuth client‑credentials (limit 3 600 bodů/h), report dle kódu → párování na postavy přes name+realm. Předvyplní `PRESENT`/`NO_SHOW`, RL potvrdí; `LATE_*` a `LEFT_EARLY` zůstávají ruční.
- **DM notifikace** (vyžaduje hostovaného bota) — diskrétnější benched alert, kombinace s @mention.
  Vyžaduje připnutý Gateway/WebSocket bot (ne jen webhook) pro plnou obousměrnou integraci.
- **Import postav z Discord serveru** — načíst/napárovat postavy hráčů přímo z Discord guildy.
- **Připomínky** X h před startem.
- **Auto‑import gearu** z komunitního armory (scrape) — křehké.
- **Guild entita / multi‑roster filtr** — zatím netřeba.
- **Loot systém** — loot council zůstává mimo systém, jen `lootNote` jako vodítko. Promyslet import
  výsledku loot council a archivaci pro přehled, kdo už má jaké itemy — především setovky (tier sety).
- **Discord setup embed — sumář rolí nahoře** — na začátek embedu (před skupiny G1–8) přidat součty
  Tank/Healer/DPS; pořadí zůstává sumář rolí → skupiny → přehled Late/Bench/Absence.
- **Ikony specializací** — sada ikon per specializace (ne jen per role jako dosud u
  `discord-emoji.ts#emojiFor`) pro použití v Discord setup embedu.
- **Absence přehled — vizuál a řazení** — na `/absences` zobrazit proběhlé absence šedě (stejný vzor
  jako zašednutí postav v setup builderu), řadit od nejnovější po nejstarší.
- **Drag-and-drop v Setup Builderu** (vysoká priorita) — náhrada dnešního click-click přiřazování.
- **Auto-lock raidu** podle času startu (dnes jen ruční přechod LOCKED).
- **Per-raid přepínač „nech ostatní RL editovat"** — dnes smí setup libovolného raidu editovat
  kdokoli s rolí RL.
- **Upgrade class emoji** — až bude mít guild vlastní custom emoji (test server zatím ne), doplnit
  `DISCORD_EMOJI_*`; do té doby běží Unicode fallback (`discord-emoji.ts#emojiFor`).
- **Migrace dat z Raid Helperu** přes jejich REST API.
- **Discord oznámení raidu — rozpad podle role** — `announceRaidToDiscord`/`buildAnnouncementContent`
  dnes ukazuje jen celkový počet přihlášených; rozdělit na ikona Tank + počet, ikona Healer + počet,
  ikona DPS + počet (stejné ikony jako `discord-emoji.ts#emojiFor`). Jiné místo než „Discord setup
  embed — sumář rolí nahoře" výše — tohle je oznámení při `OPEN`, ne setup embed při `LOCKED`.
- **Setup builder — filtr rolí i na „mimo přihlášené"** — `setup-board.tsx`: `roleFilter` (tlačítka
  TANK/HEALER/MELEE/RANGED) dnes filtruje jen `filteredRoster` (přihlášené postavy), ne
  `filteredOther`/`eligibleOtherCharacters` (sekce „Přidat postavu mimo přihlášené") — ta se filtruje
  jen textovým hledáním. Aplikovat stejný `roleFilter` na obě sekce.
- **Kalendář — detail dne jen na klik, ne na hover** — `calendar-grid.tsx`: buňka dne má
  `onMouseEnter={() => setSelectedDay(...)}`, což na desktopu ukáže detail bez kliknutí; sjednotit
  chování s mobilním rozložením (jen `onClick`), zbavit se `onMouseEnter`.
- **Kalendář — klik na raid v mřížce dne rovnou na detail raidu** — `calendar-grid.tsx`: `RaidMarkerPill`
  přímo v buňce dne (ne v rozbaleném detailu pod mřížkou) není `Link`, jen součást tlačítka dne, takže
  klik jen vybere den. Proklik na `/raids/[raidId]` dnes funguje až v rozbaleném detailu dole — přidat
  ho i přímo na pill v mřížce.

---

## 9. Poznámky k implementaci pro Code

- **První session = jen schema + migrace + ER diagram (Mermaid). Žádné featury ani UI.** ER diagram slouží jako kontrolní bod proti tomuto specu.
- Exclusion constraint: nezapomenout `CREATE EXTENSION IF NOT EXISTS btree_gist` a partial `WHERE status = 'CONFIRMED'`.
- Composite FK `(characterId, userId)` vyžaduje `UNIQUE(id, userId)` na Character.
- Generování raidů idempotentní díky `UNIQUE(templateId, startsAt)` partial indexu.
- Triggery: blokace Assignmentu při Absenci (inv. 2), kontrola `isRaidReady` (inv. 3).
- AuditLog a AttendanceRecord od začátku s `actor`/`source` poli, ať fáze 2 (WCL) nevyžaduje migraci dat.
- Po vygenerování schématu přegenerovat ER diagram a nechat zkontrolovat, než se staví první vertikála (doporučené pořadí: postavy → signup → setup builder, protože setup builder testuje všechny tři zámky naráz).
