import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiSubtaskSuggestions } from "../app/ai-subtask-suggestions";
import "../app/globals.css";

function Harness() {
  const [title, setTitle] = useState("架空のイベントを準備する");
  const [goal, setGoal] = useState("参加者が体験を通して理解し、次にすることを決められるようにしたい");
  const [userId, setUserId] = useState<string | null>("mock-user");
  const [existing, setExisting] = useState(["資料を確認する"]);
  const [mounted, setMounted] = useState(true);
  const [failSave, setFailSave] = useState(false);
  const client = useMemo(() => ({
    auth: {
      getSession: async () => ({ data: { session: userId ? { access_token: "mock-token", user: { id: userId } } : null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  }) as unknown as SupabaseClient, [userId]);
  return <main style={{ maxWidth: 650, margin: "24px auto", padding: 16 }}>
    <h1>子ToDoのAI提案（架空データ）</h1>
    <label>親タイトル<input aria-label="親タイトル" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>達成したいこと<textarea aria-label="達成したいこと" value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
    <div><button onClick={() => setUserId(null)}>テスト用ログアウト</button><button onClick={() => setMounted(!mounted)}>テスト用切替</button><button onClick={() => setExisting((items) => [...items, "場所を予約する"])}>並行して手動追加</button><button onClick={() => setExisting(Array.from({length: 100}, (_, i) => `既存${i}`))}>100件にする</button><button onClick={() => setFailSave(!failSave)}>保存失敗切替</button></div>
    {mounted && <AiSubtaskSuggestions title={title} goal={goal} userId={userId} client={client} existingTitles={existing} onAppend={(titles) => { if(failSave) return false; setExisting((items) => [...items, ...titles]); return true; }} />}
    <h2>確認後に追加された子ToDo</h2><ul aria-label="保存済み">{existing.map((item, i) => <li key={i}>{item}</li>)}</ul>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
