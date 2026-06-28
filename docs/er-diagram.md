# ER diagram — Raid & Absence Planner v1

> Kontrolní bod proti `spec.md` (bod 9.1). Diagram zobrazuje entity, klíčové sloupce
> a vztahy. Postgres‑native vynucení (exclusion constraint, partial unique, composite
> FK, triggery) jsou popsané v `schema-proposal.sql` a shrnuté pod diagramem.

```mermaid
erDiagram
    User ||--o{ Character : "vlastní"
    User ||--o{ Signup : "přihlašuje se"
    User ||--o{ Absence : "deklaruje"
    User ||--o{ Assignment : "je nasazen jako"
    User ||--o{ Note : "je autorem (authorId)"
    User ||--o{ AuditLog : "je aktérem (actorId)"

    RaidTemplate ||--o{ Raid : "generuje"

    Raid ||--o{ Signup : "má"
    Raid ||--o{ Assignment : "má"

    Signup ||--o{ SignupCharacter : "nabízí pool"
    Character ||--o{ SignupCharacter : "je nabídnuta v"

    Character ||--o{ Assignment : "je nasazena jako"
    Assignment ||--o| AttendanceRecord : "má docházku"

    User {
        uuid id PK
        text discordId UK "z OAuthu, slouží i pro @mention"
        text displayName
        enum role "ADMIN | RAID_LEADER | MEMBER"
        timestamptz createdAt
        timestamptz deletedAt "nullable (soft delete, nikdy hard)"
    }

    Character {
        uuid id PK
        uuid userId FK
        text name
        text realm
        enum faction "ALLIANCE | HORDE"
        text class
        enum role "TANK | HEALER | MELEE | RANGED"
        bool isRaidReady
        text externalUrl "nullable"
        text note "nullable"
        timestamptz deletedAt "nullable (soft delete)"
    }

    RaidTemplate {
        uuid id PK
        text instance "SSC, TK, Gruul, Mag, Kara…"
        int dayOfWeek "0-6"
        time defaultStartTime
        int durationMinutes "→ Raid.endsAt"
        enum signupMode "ALL | SINGLE"
        jsonb roleQuota "nullable {TANK,HEALER,MELEE,RANGED:int}"
        int defaultCapacity
        text discordWebhookUrl
    }

    Raid {
        uuid id PK
        uuid templateId FK "nullable = jednorázový"
        text instance
        timestamptz startsAt
        timestamptz endsAt
        enum signupMode "ALL | SINGLE"
        enum status "DRAFT | OPEN | LOCKED | DONE | CANCELLED"
        int capacity
        text notes "nullable"
        text wclReportCode "nullable (fáze 2)"
        text discordWebhookOverride "nullable"
    }

    Signup {
        uuid id PK
        uuid raidId FK
        uuid userId FK
        enum status "YES | LATE | TENTATIVE | ABSENT"
        text note "nullable"
    }

    SignupCharacter {
        uuid id PK
        uuid signupId FK
        uuid characterId FK
        text lootNote "nullable (content-specifické)"
    }

    Assignment {
        uuid id PK
        uuid raidId FK
        uuid characterId FK
        uuid userId FK
        enum roleInRaid "TANK | HEALER | MELEE | RANGED"
        int groupNo "1-5 pro 25man, nullable"
        enum status "CONFIRMED | BENCH"
        timestamptz startsAt "denorm. z Raid (plní výhradně trigger)"
        timestamptz endsAt "denorm. z Raid (plní výhradně trigger)"
    }

    Absence {
        uuid id PK
        uuid userId FK
        date fromDate
        date toDate "inkluzivní"
        text note "nullable"
        timestamptz deletedAt "nullable (rušitelná)"
    }

    AttendanceRecord {
        uuid id PK
        uuid assignmentId FK UK
        enum status "PRESENT | LATE_EXCUSED | LATE_NO_EXCUSE | NO_SHOW | LEFT_EARLY"
        enum source "MANUAL | WCL_IMPORT"
        uuid recordedBy FK
        timestamptz recordedAt
    }

    Note {
        uuid id PK
        uuid authorId FK
        enum visibility "LEADERSHIP"
        enum targetType "RAID | USER | GENERAL"
        uuid targetId "nullable pro GENERAL, bez FK"
        text body
        timestamptz createdAt
    }

    AuditLog {
        uuid id PK
        uuid actorId FK
        text action
        enum targetType "RAID | USER | … "
        uuid targetId "polymorfní, bez FK"
        text description
        timestamptz timestamp
    }
```

## Vynucení nad rámec FK (kde žije který invariant)

| Invariant (spec §2) | Mechanismus | Tabulka |
|---|---|---|
| 1 — postava max v 1 CONFIRMED překrývajícím se raidu | `EXCLUDE USING gist` (partial `WHERE status='CONFIRMED'`), vyžaduje `btree_gist` | `Assignment` |
| 2 — blokace Assignmentu při Absenci majitele | `BEFORE INSERT/UPDATE` trigger | `Assignment` |
| 3 — signup jen postav s `isRaidReady` daného hráče (+ vlastnictví, ne‑smazané) | `BEFORE INSERT/UPDATE` trigger | `SignupCharacter` |
| 4 — SINGLE = právě 1 postava | trigger (počet vs. `Raid.signupMode`) | `SignupCharacter` |
| 4 — ALL = ≥1 postava (jen YES/LATE/TENTATIVE) | **aplikačně při submitu** (ne v DB) | `Signup` |
| — `Assignment.userId == Character.userId` | composite FK `(characterId,userId)→Character(id,userId)` | `Assignment` |
| — idempotence generování | partial `UNIQUE(templateId, startsAt) WHERE templateId IS NOT NULL` | `Raid` |
| — zachování historie | `User` soft delete; všechny FK na `User` `ON DELETE RESTRICT` | všechny child tabulky |

## Pozn.: proč denormalizace času na Assignment

Exclusion constraint nemůže odkazovat sloupce jiné tabulky. Spec ho píše jako
`tstzrange(startsAt, endsAt)`, ale `startsAt/endsAt` jsou na `Raid`. Aby šel
constraint postavit na `Assignment`, kopírujeme `raidStartsAt`/`raidEndsAt` na
`Assignment` a držíme je v synchronu dvěma triggery:
1. `BEFORE INSERT/UPDATE` na `Assignment` — doplní časy z napojeného `Raid`.
2. `AFTER UPDATE` na `Raid` (změna `startsAt`/`endsAt`) — propíše čas do `Assignment`.

Alternativa bez denormalizace by byla jen aplikační/trigger kontrola, ale ta
nedává tvrdou DB záruku, kterou spec u invariantu 1 chce.
