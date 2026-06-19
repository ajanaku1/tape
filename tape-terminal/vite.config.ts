import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Walrus Sites serves from a path prefix, so use relative asset URLs.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      // Consume the vault-agnostic SDK directly from source (browser-safe barrel).
      "tape-sdk": fileURLToPath(new URL("../tape-sdk/src/index.ts", import.meta.url)),
    },
  },
  server: {
    // allow importing the sibling tape-sdk/ package from source in dev
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
});
