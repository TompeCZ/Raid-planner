ALTER TABLE "character" ADD COLUMN "is_main" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Max 1 hlavní postava na hráče. Drizzle partial unique (bool sloupec +
-- soft-delete podmínka) sám nevygeneruje — doplněno ručně, viz komentář u
-- character.isMain ve schema.ts.
CREATE UNIQUE INDEX "character_one_main_per_user"
    ON "character" ("user_id")
    WHERE ("is_main" AND "deleted_at" IS NULL);