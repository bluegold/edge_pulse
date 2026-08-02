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

Access の安定した subject を `identity_provider + identity_subject` として user の識別に使います。email や表示名は識別子に使いません。初回ログイン時は D1 に user を冪等に自動作成しますが、group membership は自動作成せず、membership がない user は割り当て待ちとします。

`users.role = 'superadmin'` を全 group に対する管理権限の正本とします。group の作成、user の membership 変更、check の group 移動、orphan check の閲覧は superadmin のみ許可します。superadmin の初回作成方法は bootstrap 用の Access subject allowlist などで別途設定します。

### 開発時の認証

localhost では Cloudflare Access の JWT 検証を省略し、次の環境変数から開発用 user identity を注入します。

```text
DEV_ACCESS_SUBJECT  必須
DEV_ACCESS_EMAIL    任意
DEV_ACCESS_NAME     任意
DEV_ACCESS_ROLE     任意。既定値は member
```

開発用 identity の provider は固定値 `cloudflare-access-dev` とし、本番の user と混同しないようにします。`DEV_ACCESS_ROLE=superadmin` は localhost での管理機能確認に限って使用します。localhost 以外ではこれらの環境変数を認証情報として扱わず、通常の Access JWT 検証を必須とします。API token の検証は別経路のため、開発時も `ADMIN_API_TOKEN` または user token を必要とします。

## 管理用 API

`/api/*` は Cloudflare Access ではなく Bearer token で保護します。

secret:

- `ADMIN_API_TOKEN`

用途:

- 自動登録
- 運用スクリプト
- 外部の管理経路

将来の user 向け API token は user 単位で管理します。token の平文は保存せず hash のみを D1 に保存し、失効・有効期限・最終利用日時を管理します。group 単位の共有 token は採用しません。既存の `ADMIN_API_TOKEN` は機械連携用の環境変数 token として別扱いにします。

API token による操作でも、token 所有 user の `superadmin` または対象 check の group membership を毎回確認します。

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
