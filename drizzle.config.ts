import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Supabase Postgres connection string (session pooler / direct).
    url: process.env.DATABASE_URL ?? "",
  },
  // enumy a tabulky držíme v public schématu
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
