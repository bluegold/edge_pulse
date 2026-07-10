# セキュリティ

## 基本方針

- D1 以外を監視状態の保存先にしない
- 任意 URL を無制限に叩かない
- 画面と API の認証経路を分ける
- 秘密情報は `wrangler secret` を使う

## Cloudflare Access

非 API の画面は、ローカル開発時を除いて Cloudflare Access の認証済みリクエストだけを受け付けます。

主な設定:

- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUDIENCE`

画面リクエストでは `CF-Access-Jwt-Assertion` を検証し、Access を通らない直アクセスは拒否します。

## 管理用 API

`/api/*` は Cloudflare Access ではなく Bearer token で保護します。

secret:

- `ADMIN_API_TOKEN`

用途:

- 自動登録
- 運用スクリプト
- 外部の管理経路

## CSRF

ブラウザのフォーム POST は `hono/csrf` で保護します。

現在の適用先:

- `/checks`
- `/checks/*`

意図:

- 画面からの登録・編集・再確認 POST を cross-site form submit から守る
- Access 認証済みブラウザであっても、別サイトからの POST をそのまま通さない

一方で `/api/*` は cookie session ベースではなく Bearer token 前提なので、同じ CSRF ミドルウェアは掛けていません。

## URL 検証

URL は登録時と実行時の両方で検証します。

最低限拒否するもの:

```text
localhost
127.0.0.0/8
::1
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.0.0/16
file:
ftp:
data:
javascript:
```

許可する scheme は `http:` と `https:` のみです。

補足:

- `redirect: "manual"` を使う
- レスポンス本文は読まない
- timeout を必ず設定する
- DNS rebinding を完全に防ぐものではない

## Secrets

secret は source や `vars` に置きません。

例:

- `ADMIN_API_TOKEN`
- `DISCORD_WEBHOOK_URL`
- `WEBHOOK_URL`

設定は `wrangler secret put` を使います。

## 実行基盤エラーの表示

Workers 実行基盤由来の `internal error; reference = ...` は、利用者向け画面ではそのまま表示しません。

理由:

- reference は利用者に意味がない
- 内部実装や調査用 ID を UI に出しても判断材料にならない

そのため UI では `runtime error` として固定表示します。
