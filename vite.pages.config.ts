import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "NEXT_PUBLIC_");

  return {
    base: "./",
    plugins: [react()],
    define: {
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(
        env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      ),
      "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      ),
    },
    build: {
      outDir: "pages-dist",
      emptyOutDir: true,
    },
  };
});
