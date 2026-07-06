# Check 実行フロー

この文書は、`scheduled()` から Queue enqueue、consumer の dequeue、`runCheck()` の実行までのデータの流れをまとめたものです。

## 全体像

```text
scheduled()
  ↓
check_runs の未送信レコードを再送
  ↓
due checks を取得
  ↓
check_runs を claim
  ↓
Queue に CheckJob を送信
  ↓
check_runs.dispatched_at を更新
  ↓
consumer が dequeue
  ↓
check_runs を lease claim
  ↓
check_runs.started_at / lease_until を更新
  ↓
未完了なら実行
  ↓
HTTP fetch
  ↓
D1 に check_results / checks / status_events / incidents を保存
  ↓
check_runs.finished_at / result_state を更新
```

## 登場するデータ

### `CheckJob`

Queue に流す job です。

```ts
export type CheckJob = {
  checkId: number;
  scheduledAt: string;
  attemptId: string;
};
```

- `checkId`
  - 対象の check
- `scheduledAt`
  - その回の scheduled 時刻
- `attemptId`
  - その回を一意に識別する ID

### `check_runs`

実行単位の進行状況を保存するテーブルです。

主な列:

- `attempt_id`
  - job の一意 ID
- `scheduled_at`
  - scheduled の基準時刻
- `dispatched_at`
  - Queue 送信済み時刻
- `started_at`
  - claim 時に最初に入る処理開始時刻
- `lease_until`
  - その worker が run を処理する権利の期限
- `finished_at`
  - 実行完了時刻
- `result_state`
  - 最終結果 `ok` / `fail`
- `skip_reason`
  - `skipped` の理由

### `check_results`

各 run の HTTP 結果を保存します。

- `check_run_id`
  - 対応する `check_runs.id`
- `check_id`
  - 対象の check
- `state`
  - `ok` / `fail`

## `scheduled()` の流れ

`scheduled()` は check を実行しません。Queue に投げるだけです。

### 1. 未送信の `check_runs` を再送する

`dispatched_at IS NULL` かつ `finished_at IS NULL` の `check_runs` を先に拾います。

これは次のケースを回収するためです。

- `check_runs` は作られた
- しかし Queue 送信前に worker が落ちた

この場合、次回 `scheduled()` でその run を再送します。

### 2. due checks を取得する

`checks.next_check_at <= now` のものを取得します。

### 3. `check_runs` を claim する

各 check について、`attemptId` と `scheduledAt` を使って `check_runs` を作ります。

同じ `check_id + scheduled_at` は一意制約で弾かれます。

### 4. Queue に送る

claim に成功したものだけ `pulse-queue.send()` します。

### 5. `dispatched_at` と `next_check_at` を更新する

送信後に次を更新します。

- `check_runs.dispatched_at`
- `checks.last_enqueued_at`
- `checks.next_check_at`

## consumer の流れ

Queue consumer は `runCheck()` を呼びます。

### 1. `check_runs` を確認する

`attempt_id` で `check_runs` を確認します。

- `finished_at` がある
  - 既に完了済みなので no-op
- `finished_at` がない
  - 実行対象

### 2. check を再取得して URL を再検証する

登録済み URL でも、実行時に再度 `validateMonitorUrl()` を通します。

### 3. HTTP fetch を行う

`redirect: "manual"` で fetch します。

HTTP 500、404、timeout、DNS error、TLS error は監視対象の fail として扱います。

### 4. 結果を保存する

`persistCheckResult()` が次を保存します。

- `check_results`
- `checks` の state / failure count
- `status_events`
- `incidents`
- `check_results.check_run_id` で run と結果を 1 対 1 で追える

保存は `attemptId` を前提に行い、同じ attempt の重複実行では二重保存しません。

### 5. `check_runs` を完了させる

保存成功後に次を更新します。

- `check_runs.finished_at`
- `check_runs.result_state`

## 重複抑止の考え方

### Queue の重複配送

Cloudflare Queues は at-least-once delivery なので、同じ job が複数回届きうります。

そのため、consumer 側では `attemptId` を見て冪等に処理します。

### 同じ scheduled 回の二重投入

`UNIQUE(check_id, scheduled_at)` で抑止します。

### 初回投入欠測の回収

`dispatched_at IS NULL` の `check_runs` を次回 `scheduled()` が拾うことで、Queue 送信前に落ちた run を再送できます。

## 実装上の注意

- `scheduled()` は結果を受け取らない
- `Queue` を RPC として使わない
- `check_runs` は状態の補助記録であり、D1 が唯一の保存先である方針は変えない
- `started_at` は claim 時に最初に入る
- `lease_until` は同じ attempt の並行実行を防ぐための実行権期限
