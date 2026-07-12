# Cloudflare Workers Uptime Monitor

Cloudflare Workers で作る死活監視ダッシュボードです。

登録した URL を定期的にチェックし、現在状態・履歴・状態遷移イベント・incident を D1 に保存します。`scheduled()` は due check を Queue に積み、Queue consumer が実際の HTTP チェックと D1 更新を行います。

## 現在の機能

- URL の登録、編集、無効化
- 定期的な HTTP 死活チェック
- `ok` / `fail` / `unknown` の状態管理
- 連続失敗・連続成功 threshold
- `status_events` と `incidents` の保存
- `check_runs` による Queue 実行追跡
- ダッシュボード、一覧、詳細画面
- Cloudflare Access による画面保護
- 管理用 API の Bearer token 認証
- 証明書スナップショット取得と再確認
- webhook / Discord 通知 dispatch

## アーキテクチャ概要

```text
Cron Trigger
  ↓
scheduled()
  ↓
D1 から due checks を取得
  ↓
Queue に CheckJob を投入
  ↓
Queue consumer が URL を fetch
  ↓
D1 に結果・状態・イベント・incident を保存
  ↓
Dashboard は D1 だけを見る
```

- Queue は RPC として使いません
- D1 を状態の唯一の保存先にします
- HTTP 500 / timeout / DNS error / TLS error は監視対象の `fail` として保存し、Queue retry しません
- D1 書き込み失敗や Worker 側の例外だけを retry 対象にします

## ドキュメント

- [データモデル](docs/models.md)
  `checks` / `check_results` / `status_events` / `incidents` / `check_runs` の役割、状態判定、保持方針
- [アーキテクチャ](docs/architecture.md)
  `scheduled()` と Queue consumer の責務、ack / retry、証明書プローブ、通知、ダッシュボード集計方針
- [セキュリティ](docs/security.md)
  Cloudflare Access、管理 API、CSRF、URL 検証、secret、runtime error 表示方針
- [ローカル動作確認](docs/local-testing.md)
  `wrangler dev` での起動、ローカル検証、手元での確認手順
- [チェック実行フロー](docs/check-execution-flow.md)
  check 実行時の保存順序、状態遷移、incident 更新の流れ
- [検索フィルタ](docs/checks-search-filter.md)
  一覧画面の検索・filter・sort の仕様

## Cloudflare 機能

- Workers
- Cron Triggers
- Queues
- D1
- Containers
- Cloudflare Access

## 設定

主な設定は [wrangler.jsonc](wrangler.jsonc) にあります。

- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUDIENCE`
- `CHECKS_PER_PAGE`

主な secret:

- `ADMIN_API_TOKEN`
- `DISCORD_WEBHOOK_URL` / `DISCORD_WEBHOOK_URLS`
- `WEBHOOK_URL` / `WEBHOOK_URLS`

証明書プローブは次のどちらかで動かします。

- `CertProbeContainer` binding
- `CERT_PROBE_URL`

## Task Runner

`just` を使うと、Workers 側と desktop 側のコマンドをまとめて実行できます。

- `just check`
- `just test`
- `just verify`
- `just build-desktop`
- `just build-desktop-tray`
- `just test-desktop`
- `just test-desktop-tray`
- `just build-cert-probe`
- `just test-cert-probe`

## API

管理用 API は Bearer token で保護されています。

- `GET /api/checks`
- `GET /api/checks/:id`
- `POST /api/checks`
- `PATCH /api/checks/:id`
- `POST /api/notifications/test`

例:

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

## 実装上の注意

- Worker のメモリに監視状態を持たない
- Dashboard は D1 だけを見て表示する
- 無効な監視対象は `障害中` / `現在の障害` / `最近の監視対象` に含めない
- Workers 実行基盤由来の `internal error; reference = ...` は利用者向け画面では `runtime error` として表示する

## 将来拡張

- 複数地点監視
- `notification-queue` への分離
- hourly / daily aggregation
- read-only public status page
- maintenance window の時刻帯制御
- per-check custom headers
- expected body text
- 外部 probe からの結果 POST API
