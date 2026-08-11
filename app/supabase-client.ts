import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const GITHUB_PAGES_HOST = "takatrp.github.io";
const GITHUB_PAGES_PATH = "/personal-todo/";
const GITHUB_PAGES_URL = `https://${GITHUB_PAGES_HOST}${GITHUB_PAGES_PATH}`;

type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

let browserClient: SupabaseClient | null | undefined;

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    publishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "",
  };
}

export function hasSupabaseConfig(): boolean {
  const { url, publishableKey } = getSupabaseConfig();

  if (!url || !publishableKey) return false;
  if (url.includes("your-project") || publishableKey.includes("your-publishable-key")) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" && parsedUrl.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (browserClient !== undefined) return browserClient;

  if (!hasSupabaseConfig()) {
    browserClient = null;
    return browserClient;
  }

  const { url, publishableKey } = getSupabaseConfig();
  browserClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  return browserClient;
}

export function getMagicLinkRedirectUrl(currentUrl?: string): string {
  const sourceUrl =
    currentUrl ?? (typeof window === "undefined" ? GITHUB_PAGES_URL : window.location.href);

  try {
    const url = new URL(sourceUrl);
    url.search = "";
    url.hash = "";

    if (url.hostname === GITHUB_PAGES_HOST) {
      url.pathname = GITHUB_PAGES_PATH;
    } else if (!url.pathname) {
      url.pathname = "/";
    }

    return url.toString();
  } catch {
    return GITHUB_PAGES_URL;
  }
}

// ToDo画面側では用途が分かる名前で参照します。
export const hasTodoSupabaseConfig = hasSupabaseConfig;
export const createTodoSupabaseClient = getSupabaseBrowserClient;
export const getTodoAuthRedirectUrl = getMagicLinkRedirectUrl;
