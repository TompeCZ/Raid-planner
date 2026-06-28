# Raid & Absence Planner — Specifikace v1

Webová aplikace pro sloučenou WoW TBC Classic (Anniversary) guildu. Nahrazuje Raid‑Helper (Discord) a tabulku dovolených jedním nástrojem. Jeden sloučený roster, žádné dělení po guildách.

**Klíčový princip:** jednotkou přihlášení je **hráč (User)**, ne postava. Hráč deklaruje dostupnost a nabídne pool použitelných postav; raid leader z poolu staví setup ručně. Dlouhodobá absence automaticky vyřazuje hráčovy postavy z raidů v daném termínu.

---

## 1. Datový model

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
- `role` — `TANK` | `HEALER` | `MELEE` | `RANGED` (pro stavbu setupu a quoty)
- `isRaidReady` (bool) — ruční zaškrtátko = eligibilita
- `externalUrl` (nullable) — odkaz na armory/logs jako vodítko pro leadera
- `note` (nullable) — volná poznámka / preference
- `active` (bool) — soft delete

### RaidTemplate
Šablona pro opakované raidy (střední cesta místo plné RRULE).
- `instance` — SSC, TK, Gruul, Mag, Kara…
- `defaultStartTime` + `dayOfWeek` (nebo cron‑like) — pro generování instancí
- `signupMode` — `ALL` | `SINGLE` (default pro generované raidy)
- `roleQuota` (nullable) — počet tank/heal/dps
- `defaultCapacity`
- `discordWebhookUrl` — kanál pro tento den/tým (kanály po raid dnech; tři 10man RL mají vlastní)

Generování instancí: 2–3 týdny dopředu, případně tlačítko „vypiš příští termín". Signupy i absence se vyhodnocují **per‑instance**.

### Raid
Konkrétní instance raidu.
- `templateId` (nullable FK) — null = jednorázový raid
- `instance`, `startsAt` (datetime)
- `signupMode` — `ALL` | `SINGLE`
- `status` — `DRAFT` | `OPEN` | `LOCKED` | `DONE` | `CANCELLED`
- `capacity`, `notes`
- `wclReportCode` (nullable) — háček pro fázi 2 (WCL import)
- `discordWebhookOverride` (nullable) — jednorázové přesměrování jinam než template

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

### Absence
- `userId`
- `fromDate`, `toDate` (zatím jen rozsah od–do)
- `note`
- soft delete (rušitelná)

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
- `actorId`, `action`, `targetType`, `targetId`
- `description` (lidsky čitelný)
- `timestamp`

Loguje se: raid vytvořen/zrušen, hráč benchnut, přepsaná cizí absence, setup odeslán do Discordu, změněn `signupMode`, označena docházka. **Neloguje se** každý drag‑drop postavy mezi groupami (jinak se log utopí v šumu).

> Kalendář **není entita** — je to pohled nad Raidy + Absencemi.

---

## 2. Invarianty (vynucené modelem/DB, ne jen UI)

1. **Jedna postava max v jednom Assignmentu** mezi raidy s překrývajícím se časem. Ideálně DB constraint, ne jen kontrola v appce. V setupu se obsazená postava leaderovi zašedne s důvodem („už v raidu X").
2. **Assignment se zablokuje**, pokud má majitel Absenci překrývající `Raid.startsAt`.
3. **Signup smí nabídnout jen postavy s `isRaidReady = true`** daného hráče.
4. **SINGLE** mód: signup nabízí právě jednu postavu. **ALL** mód: jednu a více (hráč může pool ořezat — „s tímhle altem nechci").
5. Hráč může jít na více raidů týdně přes různé postavy; per‑postava platí jen pravidlo č. 1 (překryv času).

---

## 3. Role a práva

- **ADMIN** — vše.
- **RAID_LEADER** — vytváří a edituje **jakýkoliv** raid i setup (ne jen vlastní), značí docházku, píše a čte Notes, posílá setup do Discordu. Všechny zásahy leadera jdou do **veřejného** AuditLogu → tlak nedělat naschvály; spory si RL řeší mezi sebou.
- **MEMBER** — spravuje vlastní postavy, přihlašuje se, nastavuje vlastní absence, vidí veřejnou historii a audit log. **Nevidí Notes.**

---

## 4. Historie — dvě roviny

- **Veřejná = počítaná data** (žádná autorská entita, dotazy nad AttendanceRecord/Signup/Absence): docházka, spolehlivost, no‑show %, frekvence absencí.
- **Rovina vedení = Notes** (subjektivní „kdo co dělá dobře").

**Profil hráče** agreguje obojí na jednom místě (Notes jen pro vedení). Filtry: hráč / časový rozsah / instance‑raid / typ poznámky / **stav docházky** (ať jde vyfiltrovat NO_SHOW přes všechny).

---

## 5. Discord integrace

- **OAuth** — přihlášení a identita (řeší i fake signupy).
- **Webhook push setupu** — visí na `RaidTemplate` (kanál per raid den; tři 10man RL = tři kanály), volitelný per‑raid override. Formát jako Raid‑Helper: roster (`CONFIRMED`) + bench + tentative + late + absence. Bez hostovaného bota — stačí webhook.
- **Benched notifikace** — `@mention` ve veřejném kanálu, když je benchnut někdo, kdo byl předtím zapsaný/nasazený.

---

## 6. v1 scope

- Discord OAuth login
- Správa postav (vč. `externalUrl`, `isRaidReady`)
- RaidTemplate + generování instancí (2–3 týdny dopředu)
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

## 7. Backlog (fáze 2+, přidatelné bez přepisu)

- **WCL import** — GraphQL API v2, OAuth client‑credentials (limit 3 600 bodů/h), report dle kódu → párování na postavy přes name+realm. Předvyplní `PRESENT`/`NO_SHOW`, RL potvrdí; `LATE_*` a `LEFT_EARLY` zůstávají ruční.
- **DM notifikace** (vyžaduje hostovaného bota) — diskrétnější benched alert, kombinace s @mention.
- **Připomínky** X h před startem.
- **Auto‑import gearu** z komunitního armory (scrape) — křehké, ne dřív než ověřené.
- **Guild entita / multi‑roster filtr** — zatím netřeba.
- **Loot systém** — loot council zůstává mimo systém, jen `lootNote` jako vodítko.

---

## 8. Doporučený tech stack

- **Next.js (React) + PostgreSQL**
- **Discord OAuth** na auth
- Kalendářová komponenta: **FullCalendar** nebo **react‑big‑calendar**
- Zvážit **Supabase** (Postgres + auth + realtime v jednom) — pro ~40–60 lidí ušetří kód i údržbu
- Discord push přes **webhooky**, žádný hostovaný bot ve v1

### Poznámky k implementaci pro Code
- Invariant č. 1 řešit primárně na úrovni DB (exclusion constraint na překryv času pro stejný `characterId`), ne jen v aplikační vrstvě.
- Generování raidů z template by mělo být idempotentní (opakované spuštění nevytvoří duplicitní instance).
- AuditLog a AttendanceRecord od začátku s `source`/`actor` poli, ať fáze 2 (WCL) nevyžaduje migraci dat.
