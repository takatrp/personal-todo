# Supabase同期のセットアップ

この手順では、現在のToDoデータをPCとスマートフォンで同期するためのSupabase基盤を準備します。
`junkai-junbi` と同じSupabaseプロジェクトへ追加しても、既存の巡回準備テーブルは削除・変更しません。

## 1. データベースとStorageを追加する

SupabaseのSQL Editorで [`supabase/schema.sql`](../supabase/schema.sql) を実行します。

追加されるものは次のとおりです。

- `public.todo_sync_states`: ユーザーごとのToDo全体データ
- `todo-attachments`: 添付ファイル用の非公開Storage bucket
- `todo_sync_states` のRealtime配信設定

SQLは再実行できるように作成しています。既存の `clients`、`meetings`、`agenda_items` などは削除しません。

## 2. 本人だけがデータを扱える仕組み

`todo_sync_states` は `user_id` がログイン中のユーザーIDと一致する行だけ、表示・追加・更新・削除できます。
添付ファイルも次のようにユーザーIDから始まるパスへ保存してください。

```text
ログインユーザーID/ToDo-ID/ファイル-ID
```

`todo-attachments` は非公開です。表示やダウンロードには、ログイン済みクライアントでの取得または期限付き署名URLを使います。

## 3. 環境変数を設定する

`.env.example` を `.env.local` にコピーし、既存SupabaseプロジェクトのProject URLとpublishable keyを設定します。

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

`NEXT_PUBLIC_` の値は静的なGitHub Pages用JavaScriptにも含まれます。publishable keyはブラウザ利用を前提としたキーですが、secret keyやservice role keyは絶対に設定・コミットしないでください。データ保護はRow Level Securityで行います。

## 4. メールOTP認証を設定する

Supabase DashboardのAuthenticationでEmail providerを有効にします。続いて、Authentication → Emails → TemplatesのMagic Linkテンプレートを、リンクではなく6桁コードを表示する内容へ変更します。

```html
<h2>ととのうToDo ログインコード</h2>
<p>次の6桁コードをToDo画面へ入力してください。</p>
<p style="font-size: 28px; font-weight: bold; letter-spacing: 0.2em;">{{ .Token }}</p>
<p>このコードを他の人へ共有しないでください。</p>
```

`{{ .ConfirmationURL }}` をテンプレートから外し、`{{ .Token }}` を含めることで、リンクではなくOTPコードが送られます。アプリは `verifyOtp()` でコードを検証します。iPhoneのメールアプリによるリンクプレビューでワンタイムリンクが先に消費される問題も回避できます。

## 5. 同期時のデータ構造

`todo_sync_states` はユーザーごとに1行を持ちます。

- `payload`: タブ、ToDo、子ToDo、タグ、添付メタデータ、テンプレートのJSON
- `revision`: 更新のたびに自動で1増える版番号
- `updated_at`: 更新日時

保存前に取得済みの `revision` を条件に含めると、PCとスマートフォンからの同時更新による上書きを検出できます。競合した場合は最新データを再取得し、利用者に確認してから再保存してください。

## 6. GitHub Pagesビルド

`vite.pages.config.ts` は `.env.local` または実行環境から、上記2つの `NEXT_PUBLIC_` 値だけを静的ビルドへ渡します。

```powershell
npm.cmd run build:pages
```

生成された `pages-dist` を公開する前に、ログイン、別端末からの同期、添付ファイルの表示・削除、ログアウト後にデータへアクセスできないことを確認してください。

## 7. 置き換え前の注意

- 現在の `junkai-junbi` のDBと公開ブランチをバックアップする
- ToDo同期が安定するまで既存テーブルを削除しない
- ブラウザ内の既存ToDoを初回移行する場合は、二重登録を防ぐ移行済みフラグを設ける
- Supabaseプロジェクトが停止状態でないことを確認する
