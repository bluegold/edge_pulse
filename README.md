# Cloudflare Workers Uptime Monitor

Cloudflare Workers で作る簡易死活監視ダッシュボードです。

URL を登録し、定期的に HTTP チェックを実行し、現在状態・履歴・障害イベント・復旧イベントを D1 に保存します。チェック実行は Cron Trigger から Queue に投入し、Queue consumer が実際の URL fetch と D1 更新を行います。

## 目的

このアプリは、「登録 URL の死活監視とダッシュボード表示」を Cloudflare Workers 上で実装することを目的とします。

主な機能は次の通りです。

- URL の登録、編集、無効化
- 定期的な HTTP 死活チェック
- 現在状態の表示
- チェック履歴の保存
- `ok -> fail` / `fail -> ok` の状態遷移イベント保存
- 障害単位での incident 管理
- 短時間の false positive を抑制する連続失敗・連続成功 threshold
- ダッシュボード表示
- 将来的な通知拡張のための分離設計
- CLI からの追加・更新用 API

## 重要な前提

Cloudflare Workers の scheduled 実行は、監視地点として固定できません。

Cron Trigger は Cloudflare 側の空いている実行環境で処理されるため、「東京から見た死活」「日本国内 ISP から見た死活」のような外形監視にはなりません。このアプリで確認できるのは、原則として「Cloudflare のどこかから監視対象 URL に到達できるか」です。

そのため、ダッシュボードには次のような注記を表示することを推奨します。

```text
Checked from Cloudflare edge. Check location is not fixed.
```

日本国内や特定リージョンからの外形監視が必要な場合は、Worker は管理画面・集計・通知基盤とし、東京リージョンの VPS や Lambda ap-northeast-1 などの probe から結果を Worker API に POST する構成に拡張します。

## アーキテクチャ

基本構成は次の通りです。

```text
Cron Trigger
  ↓
scheduled()
  ↓
D1 から due な checks を取得
  ↓
Cloudflare Queues に check job を投入
  ↓
Queue consumer が URL を fetch
  ↓
D1 に結果・状態・イベント・incident を保存
  ↓
Dashboard は D1 だけを見る
```

Queue は結果を返す RPC として使いません。`schedule -> queue -> D1 更新` の一方通行にします。

D1 を状態の唯一の保存先にします。Dashboard は Queue や Worker のメモリ状態を見ず、D1 の内容だけを表示します。

## 使用する Cloudflare 機能

- Cloudflare Workers
- Cron Triggers
- Cloudflare Queues
- D1
- 必要に応じて Cloudflare Access

認証は、個人・社内用途であれば Cloudflare Access を前段に置くのが簡単です。Worker 内に独自ログインを実装するより、Access でダッシュボード全体を保護するほうが事故が少なくなります。

管理用 API は別途 `ADMIN_API_TOKEN` の Bearer token で保護します。  
Cloudflare Access とは別経路で、裏側の自動登録や運用スクリプトから使う想定です。

非 API の画面は、ローカル開発時を除いて Cloudflare Access の認証済みリクエストだけを受け付けます。
本番では `CF_ACCESS_TEAM_DOMAIN` を設定してください。`CF_ACCESS_AUDIENCE` は分かる場合だけ設定します。空なら `aud` の一致確認は省略し、署名検証だけ行います。

#### Cloudflare Access の設定

本番でダッシュボード全体を Access 配下に置く場合は、次の設定にします。

1. Cloudflare Zero Trust で Self-hosted アプリケーションを作成します。
2. ダッシュボードの公開ホスト名を対象にします。
3. 許可ポリシーを作成し、閲覧を許可するユーザーまたはグループを指定します。
4. アプリケーションの Audience / Application ID を `CF_ACCESS_AUDIENCE` に設定します。
5. Zero Trust の team domain を `CF_ACCESS_TEAM_DOMAIN` に設定します。
6. Worker の非 API ルートは `CF-Access-Jwt-Assertion` を検証するので、Access を通らない直アクセスは `403` になります。

`wrangler.jsonc` には秘密情報ではないため `vars` として置けます。例:

```jsonc
{
  "vars": {
    "CF_ACCESS_TEAM_DOMAIN": "example.cloudflareaccess.com",
    "CF_ACCESS_AUDIENCE": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

`CF_ACCESS_AUDIENCE` は Access アプリ作成時に表示される Application Audience (AUD) です。未設定のままでも動かせます。`CF_ACCESS_TEAM_DOMAIN` は Zero Trust の team domain です。

### 管理用 API

```bash
curl -X POST 'http://127.0.0.1:8787/api/checks' \
  -H 'Authorization: Bearer local-admin-token' \
  -H 'Content-Type: application/json' \
  --data '{
    "name": "payments.example.com",
    "url": "https://payments.example.com",
    "enabled": true,
    "interval_minutes": 5,
    "fail_threshold": 2,
    "recovery_threshold": 1
  }'
```

ローカル開発では `.dev.vars` に `ADMIN_API_TOKEN=...` を置きます。  
本番や共有環境では `wrangler secret put ADMIN_API_TOKEN` を使って secret として設定してください。

API は次を提供します。

- `GET /api/checks`
- `GET /api/checks/:id`
- `POST /api/checks`
- `PATCH /api/checks/:id`

`POST` と `PATCH` は JSON を受け取ります。`name`、`url`、`enabled`、`interval_minutes`、`fail_threshold`、`recovery_threshold` などを指定できます。

### 証明書プローブ

TLS 証明書の有効期限と発行者情報は、Worker の `fetch()` / `node:https` だけでは取り切れないため、外部プローブに切り出します。

Worker は Cloudflare Containers 上の `external/cert_probe` の `/probe` を呼び出し、戻ってきた最新の証明書情報を `checks` のスナップショットとして保存します。

- `external/cert_probe` は Cloudflare Containers で動かします
- `wrangler.jsonc` の `containers` で `external/cert_probe/Dockerfile` を指定しています
- `cert-probe` イメージを GHCR から直接参照するのではなく、Cloudflare Containers のビルド・配置経路を使います
- `days_remaining <= 30` は証明書警告として `fail` 扱いにします
- プローブ失敗時は直前の証明書スナップショットを残しつつ、`tls_last_error` を更新します

## データモデル

### checks

監視対象 URL と現在状態を保持します。

```sql
CREATE TABLE checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  enabled INTEGER NOT NULL DEFAULT 1,

  expected_status_min INTEGER NOT NULL DEFAULT 200,
  expected_status_max INTEGER NOT NULL DEFAULT 399,
  timeout_ms INTEGER NOT NULL DEFAULT 10000,
  interval_minutes INTEGER NOT NULL DEFAULT 5,

  next_check_at TEXT,
  last_enqueued_at TEXT,
  last_checked_at TEXT,

  last_state TEXT NOT NULL DEFAULT 'unknown',
  last_status_code INTEGER,
  last_latency_ms INTEGER,
  last_error TEXT,

  fail_threshold INTEGER NOT NULL DEFAULT 2,
  recovery_threshold INTEGER NOT NULL DEFAULT 1,

  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  consecutive_successes INTEGER NOT NULL DEFAULT 0,

  first_failure_at TEXT,
  first_success_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checks_enabled_next_check_at
ON checks(enabled, next_check_at);
```

`last_state` は `unknown` / `ok` / `fail` を想定します。

### check_results

毎回のチェック結果を保存します。これは短期保存でよいです。

```sql
CREATE TABLE check_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  check_id INTEGER NOT NULL,
  state TEXT NOT NULL, -- ok / fail
  status_code INTEGER,
  latency_ms INTEGER,
  error TEXT,
  x_runtime_ms REAL,
  server_timing_json TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (check_id) REFERENCES checks(id)
);

CREATE INDEX idx_check_results_check_id_checked_at
ON check_results(check_id, checked_at DESC);
```

保存期間は 30〜90 日程度を推奨します。長期の稼働率が必要な場合は、日次または時間単位の集計テーブルに圧縮します。

### status_events

`ok -> fail` / `fail -> ok` の状態遷移だけを保存します。

```sql
CREATE TABLE status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  check_id INTEGER NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,

  reason TEXT,
  status_code INTEGER,
  error TEXT,
  latency_ms INTEGER,

  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (check_id) REFERENCES checks(id)
);

CREATE INDEX idx_status_events_check_id_occurred_at
ON status_events(check_id, occurred_at DESC);
```

これはタイムライン表示や通知ログに使います。

### incidents

障害開始から復旧までを 1 件の incident として管理します。

```sql
CREATE TABLE incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  check_id INTEGER NOT NULL,

  started_at TEXT NOT NULL,
  resolved_at TEXT,

  start_reason TEXT,
  end_reason TEXT,

  start_status_code INTEGER,
  end_status_code INTEGER,

  failure_count INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (check_id) REFERENCES checks(id)
);

CREATE INDEX idx_incidents_check_id_started_at
ON incidents(check_id, started_at DESC);

CREATE INDEX idx_incidents_unresolved
ON incidents(check_id)
WHERE resolved_at IS NULL;
```

`status_events` と `incidents` は役割が違います。

`status_events` は状態遷移のログです。

```text
2026-06-20 21:05 ok -> fail  HTTP 500
2026-06-20 21:16 fail -> ok  HTTP 200
```

`incidents` は障害単位の集計です。

```text
障害開始: 21:05
復旧: 21:16
継続時間: 11分
失敗回数: 3回
```

## Queue メッセージ

1 メッセージ = 1 check を基本にします。

```ts
export type CheckJob = {
  checkId: number;
  scheduledAt: string;
  attemptId: string;
};
```

`attemptId` は UUID を想定します。二重処理やログ追跡に使えますが、最小実装では必須ではありません。

## scheduled() の責務

Cron Trigger で実行される `scheduled()` は、チェックそのものを実行しません。

責務は次の通りです。

1. D1 から `enabled = 1` かつ `next_check_at <= now` の checks を取得する
2. Queue に `CheckJob` を投入する
3. `last_enqueued_at` と `next_check_at` を更新する

例:

```ts
export default {
  async scheduled(event, env, ctx) {
    const now = new Date().toISOString();

    const due = await env.DB.prepare(`
      SELECT id, interval_minutes
      FROM checks
      WHERE enabled = 1
        AND (
          next_check_at IS NULL
          OR next_check_at <= ?
        )
      LIMIT 500
    `).bind(now).all();

    for (const check of due.results) {
      await env.CHECK_QUEUE.send({
        checkId: check.id,
        scheduledAt: now,
        attemptId: crypto.randomUUID(),
      });

      const next = new Date(
        Date.now() + Number(check.interval_minutes) * 60_000,
      ).toISOString();

      await env.DB.prepare(`
        UPDATE checks
        SET last_enqueued_at = ?,
            next_check_at = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(now, next, now, check.id).run();
    }
  },
};
```

この設計では、Queue consumer が完全に失敗した場合、その回のチェックは欠測になる可能性があります。小規模監視では許容します。より厳密にする場合は `check_runs` テーブルを追加します。

## Queue consumer の責務

Queue consumer は、実際の HTTP チェックと D1 更新を行います。

責務は次の通りです。

1. `checkId` から checks を取得する
2. URL を検証する
3. timeout 付きで `fetch()` する
4. `ok` / `fail` を判定する
5. `check_results` に保存する
6. threshold に基づいて `checks.last_state` を更新する
7. 状態遷移があれば `status_events` に保存する
8. 障害開始・復旧があれば `incidents` を更新する
9. D1 保存成功時のみ Queue message を ack する

HTTP 500、timeout、DNS error は「監視対象の fail」という正常な観測結果です。この場合は D1 に `fail` として保存し、Queue message は成功扱いにします。

D1 書き込み失敗や Worker 側の例外は「監視システム側の失敗」です。この場合は Queue retry の対象にします。

```text
対象サイトが 500
  → check_results に fail 保存
  → incident 判定
  → queue message は ack

D1 書き込み失敗
  → 結果保存できていない
  → queue message は retry

Worker の一時エラー
  → retry

メッセージ形式が壊れている
  → retry しても無駄
  → error 記録して ack、または DLQ
```

## 状態判定

1 回の失敗だけで障害扱いにしません。

`fail_threshold` と `recovery_threshold` を使います。

```text
現在 ok:
  fail が fail_threshold 回連続したら fail に遷移

現在 fail:
  ok が recovery_threshold 回連続したら ok に遷移
```

デフォルト値は次を推奨します。

```text
fail_threshold = 2
recovery_threshold = 1
check interval = 1〜5分
```

よりノイズを減らしたい場合は次のようにします。

```text
fail_threshold = 3
recovery_threshold = 2
```

## incident の時刻

`fail_threshold` 到達時刻を incident の開始時刻にすると、実際より遅く記録されます。

そのため、障害開始時刻は `first_failure_at` を使います。

```text
ok 状態で失敗:
  consecutive_failures += 1
  first_failure_at が null なら now を入れる

consecutive_failures >= fail_threshold:
  fail に遷移
  incident.started_at = first_failure_at

ok 状態で成功:
  consecutive_failures = 0
  first_failure_at = null
```

復旧についても同様に `first_success_at` を使えます。

```text
fail 状態で成功:
  consecutive_successes += 1
  first_success_at が null なら now を入れる

consecutive_successes >= recovery_threshold:
  ok に遷移
  incident.resolved_at = first_success_at

fail 状態で失敗:
  consecutive_successes = 0
  first_success_at = null
```

## URL 検証

任意 URL を登録可能にすると危険です。Worker は通常のサーバほど内部ネットワークへの SSRF リスクは高くありませんが、無制限に外部 URL を叩ける設計にはしないでください。

最低限、次を実装します。

```text
http / https のみ許可
localhost / 127.0.0.0/8 / ::1 を拒否
10.0.0.0/8 を拒否
172.16.0.0/12 を拒否
192.168.0.0/16 を拒否
169.254.0.0/16 を拒否
リダイレクトは manual にする、または最大回数を制限する
レスポンス本文は読まない、または先頭だけ読む
timeout を必ず設定する
登録 URL 数とチェック頻度に上限を置く
```

最小実装では、`fetch()` の `redirect` は `manual` にします。

```ts
const response = await fetch(check.url, {
  method: check.method ?? "GET",
  signal: controller.signal,
  redirect: "manual",
  headers: {
    "User-Agent": "edge-pulse/1.0",
  },
});
```

## ダッシュボード

最初に実装する画面は次の通りです。

### 一覧画面

- name
- url
- enabled
- last_state
- last_status_code
- last_latency_ms
- last_checked_at
- 未解決 incident の有無

### 詳細画面

- 現在状態
- 直近チェック履歴
- 状態遷移タイムライン
- 未解決 incident
- 過去 incident 一覧

### 登録・編集画面

- name
- url
- method
- expected status range
- timeout
- interval
- fail threshold
- recovery threshold
- enabled

## 通知

最初の実装では通知は必須にしません。

通知を追加する場合は、チェック処理と同じ consumer の中で外部通知 API を呼ばないでください。通知 API の失敗で監視結果保存まで巻き戻ると困ります。

通知は別 Queue に分離します。

```text
check-queue consumer
  ↓
D1 更新
  ↓
状態遷移があれば notification-queue に投入
  ↓
notification-queue consumer
  ↓
Slack / Discord / Email / Webhook
```

## 保持期間

`check_results` は単調増加するため、保持期間を決めます。

推奨:

```text
check_results: 30〜90日
status_events: 長期保存
incidents: 長期保存
```

古い `check_results` は Cron で削除します。

```sql
DELETE FROM check_results
WHERE checked_at < datetime('now', '-90 days');
```

長期の稼働率が必要な場合は、日次集計テーブルを追加します。

## 開発方針

最初のフェーズでは、次を完成条件にします。

1. D1 schema を作成
2. URL 登録 API
3. URL 一覧 API
4. scheduled() から Queue に投入
5. Queue consumer で HTTP チェック
6. `check_results` 保存
7. `checks.last_state` 更新
8. `status_events` 保存
9. `incidents` 保存
10. 簡易ダッシュボード表示

通知、複数地点 probe、集計テーブル、詳細な認証は後続フェーズに回します。

## 非目標

初期実装では次をやりません。

- 監視地点の固定
- 複数リージョンからの外形監視
- 高度な SLA レポート
- 複雑な通知ルール
- 任意ユーザーによる公開登録
- Worker 内での本格的なユーザー管理

## 推奨ディレクトリ構成

```text
.
├── README.md
├── AGENTS.md
├── package.json
├── wrangler.toml
├── migrations
│   └── 0001_initial.sql
├── src
│   ├── index.ts
│   ├── env.ts
│   ├── routes
│   │   ├── checks.ts
│   │   └── dashboard.ts
│   ├── scheduler.ts
│   ├── queue.ts
│   ├── monitor
│   │   ├── check.ts
│   │   ├── state.ts
│   │   └── validate-url.ts
│   └── views
│       ├── layout.ts
│       ├── dashboard.ts
│       └── checks.ts
└── test
    ├── state.test.ts
    └── validate-url.test.ts
```

## 実装上の注意

- Worker のメモリに状態を持たない
- Dashboard は D1 だけを見る
- Queue を RPC として使わない
- HTTP 500 や timeout は Queue retry ではなく、監視対象の fail として保存する
- D1 書き込み失敗は Queue retry する
- `ok -> fail` / `fail -> ok` の状態遷移は必ず DB に保存する
- false positive 抑制のため、threshold 判定を必ず入れる
- incident の開始時刻は threshold 到達時刻ではなく、最初の失敗時刻にする
- リダイレクト・timeout・URL 検証を必ず実装する
