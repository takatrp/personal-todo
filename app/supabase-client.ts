import {
  createClient,
  type Session,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";

const GITHUB_PAGES_HOST = "takatrp.github.io";
const GITHUB_PAGES_PATH = "/personal-todo/";
const GITHUB_PAGES_URL = `https://${GITHUB_PAGES_HOST}${GITHUB_PAGES_PATH}`;
const AUTH_STORAGE_DB_NAME = "totonou-todo-auth";
const AUTH_STORAGE_DB_VERSION = 1;
const AUTH_STORAGE_STORE_NAME = "sessions";

type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

type TodoInitialSessionResult = {
  session: Session | null;
  error: Error | null;
};

let browserClient: SupabaseClient | null | undefined;
const authMemoryStorage = new Map<string, string>();

function openAuthStorageDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = window.indexedDB.open(AUTH_STORAGE_DB_NAME, AUTH_STORAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(AUTH_STORAGE_STORE_NAME)) {
        database.createObjectStore(AUTH_STORAGE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Auth storage is blocked"));
  });
}

async function readAuthStorage(key: string): Promise<string | null> {
  const database = await openAuthStorageDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(AUTH_STORAGE_STORE_NAME, "readonly");
    const request = transaction.objectStore(AUTH_STORAGE_STORE_NAME).get(key);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function writeAuthStorage(key: string, value: string): Promise<void> {
  const database = await openAuthStorageDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(AUTH_STORAGE_STORE_NAME, "readwrite");
    transaction.objectStore(AUTH_STORAGE_STORE_NAME).put(value, key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function removeAuthStorage(key: string): Promise<void> {
  const database = await openAuthStorageDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(AUTH_STORAGE_STORE_NAME, "readwrite");
    transaction.objectStore(AUTH_STORAGE_STORE_NAME).delete(key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

function createResilientAuthStorage(): SupportedStorage {
  return {
    async getItem(key) {
      try {
        const localValue = window.localStorage.getItem(key);
        if (localValue !== null) {
          authMemoryStorage.set(key, localValue);
          return localValue;
        }
      } catch {
        // SafariでWebストレージが制限されていてもIndexedDBへフォールバックします。
      }

      try {
        const indexedDbValue = await readAuthStorage(key);
        if (indexedDbValue !== null) {
          authMemoryStorage.set(key, indexedDbValue);
          try {
            window.localStorage.setItem(key, indexedDbValue);
          } catch {
            // IndexedDBから復元できているため、通常ストレージへの複製失敗は無視します。
          }
          return indexedDbValue;
        }
      } catch {
        // 両方使えない場合も、現在のタブではメモリ上のセッションを維持します。
      }

      return authMemoryStorage.get(key) ?? null;
    },
    async setItem(key, value) {
      authMemoryStorage.set(key, value);
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // IndexedDBへの保存を続けます。
      }
      try {
        await writeAuthStorage(key, value);
      } catch {
        // 保存領域がすべて制限されても、現在のタブの認証は失敗させません。
      }
    },
    async removeItem(key) {
      authMemoryStorage.delete(key);
      try {
        window.localStorage.removeItem(key);
      } catch {
        // IndexedDB側の削除を続けます。
      }
      try {
        await removeAuthStorage(key);
      } catch {
        // 既に保存領域が利用不能なら削除済みと同等に扱います。
      }
    },
  };
}

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
      storage: createResilientAuthStorage(),
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
  } catch (error) {
    return {
      session: null,
      error: error instanceof Error ? error : new Error("ログイン状態を保存できませんでした。"),
    };
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
