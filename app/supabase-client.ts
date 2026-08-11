import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const GITHUB_PAGES_HOST = "takatrp.github.io";
const GITHUB_PAGES_PATH = "/personal-todo/";
const GITHUB_PAGES_URL = `https://${GITHUB_PAGES_HOST}${GITHUB_PAGES_PATH}`;

type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

type TodoInitialSessionResult = {
  session: Session | null;
  error: Error | null;
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
      detectSessionInUrl: false,
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

function clearAuthCallbackFromUrl(url: URL): void {
  const cleanUrl = new URL(url.toString());
  ["code", "error", "error_code", "error_description"].forEach((key) => {
    cleanUrl.searchParams.delete(key);
  });
  cleanUrl.hash = "";
  window.history.replaceState(window.history.state, "", cleanUrl.toString());
}

export async function resolveTodoInitialSession(
  client: SupabaseClient,
): Promise<TodoInitialSessionResult> {
  if (typeof window === "undefined") {
    const { data, error } = await client.auth.getSession();
    return { session: data.session, error };
  }

  const callbackUrl = new URL(window.location.href);
  const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const code = callbackUrl.searchParams.get("code");
  const callbackError =
    hashParams.get("error_description") ??
    callbackUrl.searchParams.get("error_description") ??
    hashParams.get("error") ??
    callbackUrl.searchParams.get("error");
  const hasAuthCallback = Boolean(
    accessToken ||
      refreshToken ||
      code ||
      callbackError ||
      callbackUrl.searchParams.get("error_code"),
  );

  try {
    if (callbackError) {
      return { session: null, error: new Error(callbackError) };
    }

    if (accessToken || refreshToken) {
      if (!accessToken || !refreshToken) {
        return {
          session: null,
          error: new Error("ログイン情報を正しく受け取れませんでした。"),
        };
      }

      const { data, error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return { session: data.session, error };
    }

    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      return { session: data.session, error };
    }

    const { data, error } = await client.auth.getSession();
    return { session: data.session, error };
  } finally {
    if (hasAuthCallback) {
      clearAuthCallbackFromUrl(callbackUrl);
    }
  }
}

// ToDo画面側では用途が分かる名前で参照します。
export const hasTodoSupabaseConfig = hasSupabaseConfig;
export const createTodoSupabaseClient = getSupabaseBrowserClient;
export const getTodoAuthRedirectUrl = getMagicLinkRedirectUrl;
