"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./supabase-client";
import {
  AiSuggestionError, aiSuggestionErrorMessage, isValidAiTitle,
  MAX_AI_CHILDREN, MAX_AI_PARENT_LENGTH, requestAiSubtasks, selectAiTitles,
} from "./ai-subtasks";

type Props = {
  title: string;
  existingTitles: string[];
  userId: string | null;
  client: SupabaseClient | null;
  onAppend: (titles: string[]) => Promise<boolean> | boolean;
  disabled?: boolean;
};
type Candidate = { title: string; selected: boolean };

export function AiSubtaskSuggestions(props: Props) {
  // A different title/account owns an entirely new suggestion session.
  return <SuggestionSession key={JSON.stringify([props.title, props.userId])} {...props} />;
}

function SuggestionSession({ title, existingTitles, userId, client, onAppend, disabled = false }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(false);
  const canGenerate = !disabled && !!client && !!userId
    && isValidAiTitle(title.trim(), MAX_AI_PARENT_LENGTH) && existingTitles.length < MAX_AI_CHILDREN;
  const selected = candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.title);
  const invalidSelection = selected.some((candidate) => !isValidAiTitle(candidate));
  const appendable = selectAiTitles(selected, existingTitles);

  function cancel() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    setCandidates([]);
    setMessage("");
  }

  useEffect(() => {
    mountedRef.current = true;
    const dismiss = () => {
      if (!savingRef.current) cancel();
    };
    window.addEventListener("popstate", dismiss);
    const subscription = client?.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) dismiss();
    }).data.subscription;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
      window.removeEventListener("popstate", dismiss);
      subscription?.unsubscribe();
    };
  }, [client, userId]);

  async function generate() {
    if (!canGenerate || !client || !userId || controllerRef.current || savingRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setCandidates([]);
    setMessage("");
    const timer = window.setTimeout(() => {
      if (controllerRef.current !== controller) return;
      controller.abort();
      controllerRef.current = null;
      setBusy(false);
      setMessage(aiSuggestionErrorMessage(new AiSuggestionError(408)));
    }, 25_000);
    try {
      const titles = await requestAiSubtasks({
        title, userId, ...getSupabaseConfig(),
        getSession: () => client.auth.getSession(), signal: controller.signal,
      });
      if (!mountedRef.current || controllerRef.current !== controller || controller.signal.aborted) return;
      const next = selectAiTitles(titles, existingTitles);
      setCandidates(next.map((candidate) => ({ title: candidate, selected: true })));
      if (!next.length) setMessage("新しく追加できる候補がありませんでした。手動で追加できます。");
    } catch (error) {
      if (mountedRef.current && controllerRef.current === controller && !controller.signal.aborted) {
        setMessage(aiSuggestionErrorMessage(error));
      }
    } finally {
      window.clearTimeout(timer);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (mountedRef.current) setBusy(false);
      }
    }
  }

  async function append() {
    if (disabled || busy || savingRef.current || invalidSelection || !appendable.length || !userId) return;
    savingRef.current = true;
    setSaving(true);
    setMessage("");
    try {
      const saved = await onAppend(appendable);
      if (!mountedRef.current) return;
      if (saved) {
        setCandidates([]);
        setMessage("選んだ候補を子ToDoに追加しました。");
      } else setMessage("追加できませんでした。内容と保存状態を確認してください。");
    } catch {
      if (mountedRef.current) setMessage("追加できませんでした。内容と保存状態を確認してください。");
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  return (
    <div className="ai-subtask-suggestions" aria-label="AIによる子ToDoの提案">
      <p className="ai-subtask-disclosure">ボタンを押すと、親ToDoのタイトルだけをOpenAIへ送信します。メモ・添付・依頼先・既存の子ToDoは送信しません。</p>
      <div className="ai-subtask-actions">
        <button type="button" onClick={() => void generate()} disabled={!canGenerate || busy || saving}>
          {busy ? "AIが候補を作成中…" : "AIで子ToDoを提案"}
        </button>
        {(busy || candidates.length > 0) && <button type="button" onClick={cancel} disabled={saving}>キャンセル</button>}
      </div>
      {!userId && <small>AI提案にはログインが必要です。手動追加は引き続き利用できます。</small>}
      {existingTitles.length >= MAX_AI_CHILDREN && <small>子ToDoは100件までです。</small>}
      {candidates.length > 0 && (
        <div className="ai-subtask-candidates">
          <p>必要な候補を選び、内容を確認・編集してから追加してください。既存の子ToDoは置き換えません。</p>
          {candidates.map((candidate, index) => (
            <div className="ai-subtask-candidate" key={index}>
              <input type="checkbox" aria-label={`候補${index + 1}を追加する`} checked={candidate.selected} disabled={saving || disabled}
                onChange={(event) => setCandidates((current) => current.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} />
              <input type="text" aria-label={`子ToDo候補${index + 1}`} maxLength={160} value={candidate.title} disabled={saving || disabled}
                onChange={(event) => setCandidates((current) => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} />
            </div>
          ))}
          <small>重複する候補は追加しません。残り{Math.max(0, MAX_AI_CHILDREN - existingTitles.length)}件まで追加できます。</small>
          {invalidSelection && <p role="alert">選択した候補のタイトルを1〜160文字で入力してください。</p>}
          <button type="button" onClick={() => void append()} disabled={disabled || busy || saving || invalidSelection || !appendable.length}>
            {saving ? "追加中…" : `選んだ${appendable.length}件を追加`}
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
