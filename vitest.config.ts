import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only throws outside a React Server environment; tests only
      // import pure modules, so an empty stand-in is sufficient.
      "server-only": path.resolve(__dirname, "src/test/server-only.ts"),
    },
  },
});
