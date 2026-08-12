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

## 4. メールリンク認証を設定する

Supabase DashboardのAuthenticationでEmail providerを有効にし、Redirect URLsへ次を追加します。

```text
http://localhost:3000/
https://takatrp.github.io/personal-todo/
```

`app/supabase-client.ts` の `getMagicLinkRedirectUrl()` は、GitHub Pagesではクエリ文字列とハッシュを除き、必ず `/personal-todo/` へ戻します。
公開先を `/junkai-junbi/` など別のパスへ変更する場合は、この関数とSupabase側のRedirect URLを同時に変更してください。

### iPhoneのホーム画面版でログインする

iOSでは、Safariとホーム画面へ追加したWebアプリが別々の保存領域を使うため、Safariのセッションはホーム画面版へ引き継がれません。本アプリでは次の手順で同じSupabaseユーザーへログインします。

1. Safari版へメールリンクでログインする
2. 「その他の操作」または「データ管理」から、12文字以上のホーム画面アプリ用パスワードを設定する
3. Safariの共有メニューからホーム画面へ追加する
4. ホーム画面版を開き、同じメールアドレスとパスワードでログインする

パスワード設定には `supabase.auth.updateUser()`、ホーム画面版のログインには `supabase.auth.signInWithPassword()` を使います。パスワードはSupabase Authへ直接送信し、ToDoデータ、IndexedDB、localStorageには保存しません。`public/manifest.webmanifest` とApple向けmetaタグにより、ホーム画面版は独立したWebアプリとして起動します。

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
