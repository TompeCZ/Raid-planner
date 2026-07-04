import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Stejný alias jako v tsconfig.json ("@/*" -> "src/*").
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  test: {
    environment: "node",
  },
});
