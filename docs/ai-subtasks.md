# AIによる子ToDo候補（任意機能）

## 動作と送信範囲

「AIで子ToDoを提案」を押すと、親ToDoのタイトルと「達成したいこと」をSupabase Edge Function経由でOpenAIへ送信します。タイトルは最大120文字、達成したいことは最大2,000文字です。メモ、添付、依頼元・依頼先、既存の子ToDo、ユーザーIDはOpenAIへ送りません。ログイン認証のため、Supabaseにはアクセストークンが送信されます。

「達成したいこと」はタイトルの下に入力できます。新規・編集画面ではToDoと一緒に保存し、右側パネルでは枠外を押すかCtrl＋Enterで保存します。PC・スマホ間の同期、バックアップ、テンプレートにも含まれます。空欄でも利用でき、既存のToDoでは空欄として表示します。

AIはタイトルと達成したい状態を読み、目的に必要な作業を提案します。タイトルや目的を変更すると、変更前の候補と実行中の提案を破棄します。再度ボタンを押すと、変更後の内容で提案します。

1〜8件の候補を表示し、利用者が編集・選択・確認したものだけ追加します。AIはDBを更新しません。既存の子ToDoは置換しません。手動追加は引き続き利用できます。子ToDoの同期は既存の親ToDo単位の競合解決を利用するため、別端末の同時編集について子単位の完全なマージを保証する変更ではありません。

## まだ実施していない本番準備（別途承認が必要）

以下は初期導入手順です。今回の承認済み環境への適用・検証状況は [`ai-subtasks-runtime-validation.md`](ai-subtasks-runtime-validation.md) を参照してください。秘密値はリポジトリに含めません。

1. OpenAIで利用するプロジェクトとモデルを決めます。Responses APIのStructured Outputs（JSON Schema）に対応するモデルを選び、契約・現在の料金・データ取扱条件を確認してください。モデルIDの既定値はなく、未設定時は機能が停止します。専用プロジェクト/キーと利用通知・予算管理を推奨します。OpenAI側の予算通知だけを強制的な支出上限とみなさないでください。
2. Supabaseで対象の本人ユーザーUUIDと公開サイトのoriginを確認します。クライアントから送られるユーザーIDやuser_metadataで権限を判定しません。
3. 検証環境で [`supabase/ai-subtasks.sql`](../supabase/ai-subtasks.sql) をレビューして実行します。専用の利用回数テーブルとRPCだけを追加します。既存のToDo・Auth・Storage・RLSは変更しません。新テーブルはRLS有効、anon/authenticatedにはアクセス不可。SECURITY INVOKERのRPCもservice_role専用です。Data APIでRPCが利用可能か確認し、既存テーブルの権限は拡大しないでください。
4. Edge Functionのサーバー環境だけに次を設定します。秘密値をチャット、Git、NEXT_PUBLIC_、ブラウザに入れないでください。

   | 環境変数 | 値・用途 |
   | --- | --- |
   | `TODO_OPENAI_API_KEY` | 承認されたOpenAIプロジェクトのキー |
   | `TODO_OPENAI_SUBTASK_MODEL` | 確認済みの対応モデルID（必須） |
   | `TODO_AI_ALLOWED_USER_IDS` | 許可する本人のSupabase UUID。カンマ区切り、最大10名。通常1名 |
   | `TODO_AI_ALLOWED_ORIGINS` | 本番は `https://takatrp.github.io` （パスなし）。開発originは必要な検証時のみ追加 |
   | `SUPABASE_URL` | 同じSupabaseプロジェクトのURL（通常自動提供） |
   | `SUPABASE_ANON_KEY` | Auth問い合わせ用の公開キー（通常自動提供されるlegacy anonキー） |
   | `SUPABASE_SERVICE_ROLE_KEY` | quota RPC専用のサーバーキー（通常自動提供）。フロントへは出さない |

5. Supabase CLIの現在の `--help` と公式手順を確認し、`suggest-subtasks` を配置します。`supabase/config.toml` は `verify_jwt = true`。さらにハンドラー内でAuthサーバーに問い合わせ、許可UUIDと匿名ユーザーでないことを確認します。プロジェクトのJWT署名方式とgateway検証の互換性は検証環境で確認してください。エラー回避だけを目的に認証を解除しないでください。
6. 検証環境で未認証401、許可外403、許可ユーザーの成功、quota超過429、quota障害時の停止、CORS、実際のモデルのJSON Schema対応を検証します。DBではanon/authenticatedがテーブル・RPCを操作できないこと、並列要求で上限を超えないこと、時刻境界をまたぐ遅延要求が古いカウンター枠へ巻き戻さないことも確認します。課金の伴う試験は承認後にダミーの作業名で実施します。
7. 承認後にフロントのビルド・公開。未配置の間も手動追加は使えますが、AI操作はエラーになります。

## 上限・障害時の挙動

- サーバー側で1ユーザー毎分3回、UTC日付毎20回の固定枠。DBの単一行UPSERTで並列・複数Edgeインスタンス間も共有します。固定枠の境界では短時間に隣接枠の合計回数が発生し得ます。
- 許可リストは最大10名なので、同じ設定で最大200試行/UTC日。1試行はタイトル120文字と達成したいこと2,000文字、最大2,048出力トークン、外部処理25秒。実費上限は選択モデルの料金次第であり、金額の保証ではありません。許可ユーザー追加・上限変更はコスト再確認が必要です。
- quotaはOpenAI呼び出し前に消費します。失敗・キャンセルも回数に含め、返却・自動再試行はしません。quota保存失敗時はOpenAIを呼びません。
- キャンセルは表示や保存を抑止しますが、既に送信済みのリクエストや料金の取消は保証しません。
- 入力16 KiB、API出力64 KiBまで。達成したいことには改行とタブを使えます。候補の件数・型・長さ・制御文字・正規化後の重複を検証し、不正な候補は採用しません。モデル拒否・途中出力もエラー扱いです。
- `store: false` を送信しますが、これだけでOpenAIの不正利用監視等を含むゼロ保持を保証するものではありません。アプリ側はタイトル・達成したいこと・キー・providerエラー本文をログ出力しません。Supabase/OpenAI側の運用ログ設定は別途確認してください。
- ToDoのAIだけを緊急停止するには `TODO_AI_ALLOWED_USER_IDS` を空にします。既存ToDoや手動追加に影響しません。OpenAIキー自体を無効化すると、同じキーを共有する他アプリも止まるため、影響確認なしに無効化しないでください。

## ローカル確認

```sh
node --test tests/ai-subtasks-backend.test.mjs
```

fetch・Auth・quota・OpenAIはすべてモックです。実際のDB権限・SQL実行・Edgeランタイム・gateway・OpenAIモデルへの疎通はこのテストでは検証できません。

## 参照した公式仕様

- [Supabase Edge Function認証](https://supabase.com/docs/guides/functions/auth)
- [Supabase getUser（Authサーバーで検証）](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Supabase changelog](https://supabase.com/changelog)（2026-10-25確認。新規テーブルのData API公開権限に注意）
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)

## 2026-10-25の導入候補（未設定・未配置）

- 対象は確認済みの `junkai-junbi`（`lmuofqshnasvcofmmivf`）。既存の会議支援Functionと共用のため、既存Function・テーブル・秘密設定には触れません。`suggest-subtasks`、`todo_ai_quotas`、`todo_ai_consume_quota` の同名衝突は読取専用メタデータ確認で見つかりませんでした。
- 独自環境変数はすべて `TODO_` 接頭辞にしました。既存 `OPENAI_API_KEY` を読み出したり上書きしたりせず、本人が承認したキーを `TODO_OPENAI_API_KEY` に登録します。ただしSupabaseのEdge秘密設定はプロジェクト共有で、名前分けはFunction単位のアクセス隔離ではありません。同プロジェクト内の他Functionも技術的には読めるため、この共有範囲の承認が必要です。
- 利用モデル候補は `TODO_OPENAI_SUBTASK_MODEL=gpt-5.6-luna`。公式仕様でResponses/Structured Outputs対応を確認済み。このモデルでは推論を `none` に固定し、2,048出力トークンと25秒の上限を維持します。実モデル品質・疎通は未検証です。環境変数未設定時の既定モデルはありません。
- [公式モデル仕様・料金](https://developers.openai.com/api/docs/models/gpt-5.6-luna) は100万トークン当たり入力$0.20・出力$1.20。20回すべて2,048出力トークンでも出力分は$0.049152/日。別途入力・Supabase・税等があり、総額の強制上限の保証ではありません。最初は本人1名のみ許可、ダミータイトルの有料試験は最大3回を提案します。
- キーは[対象プロジェクトのEdge Function Secrets](https://supabase.com/dashboard/project/lmuofqshnasvcofmmivf/functions/secrets)へ本人が入力します。チャット・ソースコード・フロント設定には貼りません。[公式手順](https://supabase.com/docs/guides/functions/secrets)ではOwner/Administrator権限が必要です。現在の接続ツールに秘密設定操作はなく、ユーザー入力の引継ぎが必要です。
- 承認対象を分けます：(1)上記共有範囲へのキー永続保存と利用、(2)専用quotaテーブル/RPC追加とサービスロール権限、(3)新Functionの配置と最大3回のダミー疎通、(4)ブラウザ検証後のGitHub push/公開。既存ToDo/顧客行やAuthユーザー一覧は今回の確認では読んでいません。
