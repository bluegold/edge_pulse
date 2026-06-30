# AGENTS.md

このプロジェクトは Cloudflare Workers で実装する死活監視ダッシュボードです。

Coding agent は、この文書の制約を優先して実装してください。

## 最重要方針

D1 を状態の唯一の保存先にすること。

Worker のグローバル変数、メモリ、Queue の未処理状態、Cron の実行状態を、アプリケーション状態として扱ってはいけません。

Dashboard は D1 の内容だけを見て表示してください。

## アーキテクチャの固定

初期実装は次の一方通行です。

```text
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
終了
```

Queue を RPC のように使わないでください。scheduled 側に結果を戻す実装は不要です。

## 実装対象

初期実装で必要なもの:

- `checks` テーブル
- `check_results` テーブル
- `status_events` テーブル
- `incidents` テーブル
- URL 登録・編集・一覧
- `scheduled()` による Queue 投入
- Queue consumer による HTTP チェック
- `ok` / `fail` 判定
- 連続失敗・連続成功 threshold
- `ok -> fail` / `fail -> ok` の status event 保存
- incident 開始・復旧処理
- 簡易ダッシュボード

初期実装で不要なもの:

- 複数地点監視
- 通知
- SLA レポート
- ユーザー管理
- 高度な UI
- check_runs テーブル
- 外部 probe API

## 状態遷移の仕様

状態は原則として次の 3 つです。

```text
unknown
ok
fail
```

1 回の失敗だけで `fail` にしないでください。

`checks.fail_threshold` と `checks.recovery_threshold` を使います。

```text
現在 ok:
  fail が fail_threshold 回連続したら fail に遷移

現在 fail:
  ok が recovery_threshold 回連続したら ok に遷移

現在 unknown:
  最初の成功で ok
  最初の失敗は consecutive_failures を進め、threshold 到達で fail
```

障害開始時刻は threshold 到達時刻ではなく、最初の失敗時刻です。

```text
incident.started_at = checks.first_failure_at
```

復旧時刻は最初の成功時刻を使います。

```text
incident.resolved_at = checks.first_success_at
```

## Queue ack / retry のルール

HTTP 500、HTTP 404、timeout、DNS error、TLS error などは「監視対象の fail」です。

これらは Queue retry してはいけません。D1 に fail として保存し、message は ack してください。

Queue retry するのは、監視システム側の失敗だけです。

retry する例:

- D1 書き込み失敗
- コード上の予期しない例外
- 一時的な Cloudflare 側の実行失敗

retry しない例:

- 対象 URL が 500 を返した
- 対象 URL が timeout した
- 対象 URL の DNS 解決に失敗した
- 対象 URL の TLS が壊れていた

## URL 検証

URL 登録時とチェック実行時の両方で検証してください。

最低限、次を拒否します。

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

`fetch()` では原則として `redirect: "manual"` を指定してください。リダイレクト追跡を実装する場合は最大回数を必ず制限してください。

レスポンス本文は原則として読まないでください。本文確認を実装する場合も、最大読み取りサイズを制限してください。

## DB 更新

状態更新・event 保存・incident 更新は、可能な限り同じ処理単位で行ってください。

D1 の `batch()` を使って、一連の更新が途中で分裂しにくいようにしてください。ただし、D1 で完全な複雑トランザクションに依存しすぎないでください。

未解決 incident は次のクエリで取得します。

```sql
SELECT id
FROM incidents
WHERE check_id = ?
  AND resolved_at IS NULL
ORDER BY started_at DESC
LIMIT 1;
```

`checks.current_incident_id` は初期実装では使わないでください。D1 で INSERT した ID を後続処理へ渡す実装が複雑になりやすいためです。

## 時刻

時刻は ISO 8601 UTC 文字列で保存してください。

```ts
const now = new Date().toISOString();
```

ローカルタイムに依存しないでください。

## scheduled() の注意

scheduled() はチェックを実行しません。

scheduled() は Queue に job を投入し、`last_enqueued_at` と `next_check_at` を更新するだけです。

Queue 投入後に `next_check_at` を進める設計で構いません。この場合、Queue consumer が完全に失敗するとその回のチェックは欠測します。初期実装では許容します。

## 型定義

最低限、次の型を用意してください。

```ts
export type CheckState = "unknown" | "ok" | "fail";

export type CheckJob = {
  checkId: number;
  scheduledAt: string;
  attemptId: string;
};

export type CheckResult = {
  state: "ok" | "fail";
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  reason: string | null;
  checkedAt: string;
};
```

## テスト対象

最低限、次をテストしてください。

- URL validation
- `ok -> fail` の threshold 判定
- `fail -> ok` の recovery threshold 判定
- `unknown` からの初期遷移
- incident.started_at が threshold 到達時刻ではなく first_failure_at になること
- HTTP 500 が Queue retry ではなく fail 保存になること
- D1 書き込み失敗が Queue retry になること

## UI 方針

初期 UI は簡素で構いません。

優先順位は次です。

1. 現在状態が見える
2. 未解決 incident が見える
3. 直近履歴が見える
4. 状態遷移イベントが見える
5. URL を登録・編集できる

見た目より状態管理の正確性を優先してください。

## 禁止事項

- Worker のグローバル変数に監視状態を持つ
- Queue を RPC として使う
- HTTP 500 や timeout を Queue retry する
- 1 回の失敗だけで即 incident にする
- incident.started_at に threshold 到達時刻を使う
- URL 検証なしで任意 URL を fetch する
- リダイレクトを無制限に追跡する
- レスポンス本文を無制限に読む
- Dashboard が D1 以外の状態に依存する
- 通知 API の失敗でチェック結果保存を巻き戻す

## 将来拡張

後続フェーズで検討するもの:

- notification-queue
- Slack / Discord / Email / Webhook 通知
- 複数地点 probe
- 外部 probe からの結果 POST API
- hourly / daily aggregation
- Cloudflare Access 前提の管理画面
- read-only public status page
- maintenance window
- per-check custom headers
- expected body text
- TLS certificate expiry check

将来拡張でも、D1 を状態の唯一の保存先にする原則は維持してください。
