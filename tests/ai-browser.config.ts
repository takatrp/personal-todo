import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock-only test server: deliberately never loads .env or real credentials.
export default defineConfig({
  cacheDir: join(tmpdir(), `totonou-ai-browser-${process.pid}`),
  plugins: [react()],
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("https://mock.supabase.co"),
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("mock-public-key"),
  },
  server: { host: "127.0.0.1", port: 4179, strictPort: true },
});
