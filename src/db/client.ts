import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __dbQueryClient: ReturnType<typeof postgres> | undefined;
}

// Cache na globalThis, ne jen modulovou proměnnou — v `next dev` HMR znovu
// vykoná top-level kód tohoto modulu při každé uložené změně souboru, což by
// jinak otevíralo nové Postgres spojení a nechávalo stará viset, dokud
// nevyprší Supabase pooler (session mode, limit 15 klientů). `globalThis`
// přežívá modul-cache reload, takže se klient vytvoří jen jednou za proces.
const queryClient =
  globalThis.__dbQueryClient ?? postgres(process.env.DATABASE_URL!, { prepare: false });
globalThis.__dbQueryClient = queryClient;

export const db = drizzle(queryClient, { schema });
