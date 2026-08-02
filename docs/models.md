# データモデル

## 概要

このプロジェクトの監視状態は D1 を唯一の保存先とします。Dashboard は Queue や Worker メモリを見ず、D1 の内容だけを表示します。

主要テーブル:

- `users`
- `groups`
- `group_members`
- `checks`
- `check_results`
- `status_events`
- `incidents`
- `check_runs`
- `incident_reactions`
- `api_tokens`
- `audit_logs`

テナントモデルでは、`check` は単一の `group` に所属し、`user` は複数の `group` に所属する。ユーザーと group の関連は `group_members` で表現する。membership が 0 件の user は割り当て待ちとし、superadmin は membership に関係なく全 group を管理できる。Group と WebSocket の詳細は [Group とリアルタイム通知](groups-and-realtime.md) を参照する。

`groups.slug` は一意とし、予約済み slug `orphan` を持つ system group を作成する。初期 migration では既存 check を orphan に割り当てるが、通常運用では orphan に check を残さない。check が存在する group は削除できず、orphan は削除・改名できない。

ユーザーは Cloudflare Access などの認証プロバイダーが発行する安定した subject で識別する。`identity_provider` と `identity_subject` の組み合わせに UNIQUE 制約を置き、email は識別子に使わない。Access による初回ログイン時、user は冪等に自動作成するが group membership は自動作成しない。

`users.role` は当面 `superadmin` / `member` とする。`group_members` に group 内 role は持たせない。group 作成、membership の変更、check の group 移動は superadmin のみが実行できる。

API token は user 単位で管理し、D1 には hash のみ保存する。現在の環境変数 `ADMIN_API_TOKEN` は既存の機械連携用 token として別に扱う。

## checks

監視対象 URL と現在状態を保持します。

主なカラム:

- `name`
- `url`
- `method`
- `enabled`
- `expected_status_min` / `expected_status_max`
- `timeout_ms`
- `interval_minutes`
- `next_check_at`
- `last_enqueued_at`
- `last_checked_at`
- `last_state`
- `last_status_code`
- `last_latency_ms`
- `last_error`
- `fail_threshold`
- `recovery_threshold`
- `consecutive_failures`
- `consecutive_successes`
- `first_failure_at`
- `first_success_at`
- `maintenance_enabled`
- `tls_last_checked_at`
- `tls_last_error`
- `tls_subject`
- `tls_issuer`
- `tls_public_key_class`
- `tls_valid_from`
- `tls_valid_to`
- `tls_days_remaining`（probe 時点の参考値。残日数の判定には使わない）
- `tls_dns_names`

`last_state` は `unknown` / `ok` / `fail` を想定します。

## check_results

毎回の監視結果を保存します。

主なカラム:

- `check_id`
- `check_run_id`
- `state`
- `status_code`
- `latency_ms`
- `error`
- `x_runtime_ms`
- `server_timing_json`
- `checked_at`

`check_results.state` は `ok` / `warning` / `fail` です。証明書の有効期限30日以内は `warning` として保存し、監視対象の状態遷移や incident には影響させません。

`error` には HTTP 失敗、timeout、TLS、runtime error などの結果文字列が入ります。利用者向け UI では Workers 実行基盤由来の `internal error; reference = ...` をそのまま出さず、`runtime error` として表示します。

## status_events

状態遷移だけを保存します。

- `ok -> fail`
- `fail -> ok`
- `unknown -> ok`

主なカラム:

- `check_id`
- `check_run_id`
- `from_state`
- `to_state`
- `reason`
- `status_code`
- `error`
- `latency_ms`
- `occurred_at`

`reason` は `http_ok` / `http_status` / `fetch_error` / `tls_error` / `tls_expired` などの分類名です。

## incidents

障害開始から復旧までを 1 件の incident として扱います。

主なカラム:

- `check_id`
- `started_at`
- `resolved_at`
- `start_reason`
- `end_reason`
- `start_status_code`
- `end_status_code`
- `failure_count`

### incident の開始時刻

`fail_threshold` 到達時刻ではなく、最初の失敗時刻を使います。

```text
incident.started_at = checks.first_failure_at
```

### incident の復旧時刻

最初の成功時刻を使います。

```text
incident.resolved_at = checks.first_success_at
```

## check_runs

Queue の at-least-once 実行に対応するため、現在の実装では `check_runs` を使います。

主なカラム:

- `check_id`
- `attempt_id`
- `scheduled_at`
- `started_at`
- `lease_until`
- `finished_at`
- `result_state`
- `skip_reason`
- `dispatched_at`

役割:

- `scheduled()` ごとの run を一意に記録する
- dispatch 済みかどうかを管理する
- consumer 実行中の lease を管理する
- stale lease の再 dispatch を可能にする
- `check_results` / `status_events` の重複保存を抑止する

## Queue メッセージ

1 メッセージ = 1 check を基本にします。

```ts
export type CheckJob = {
  checkId: number;
  scheduledAt: string;
  attemptId: string;
};
```

`attemptId` は `check_runs.attempt_id` の一意キーとして使います。

## 状態判定

1 回の失敗だけで `fail` にしません。

```text
現在 ok:
  fail が fail_threshold 回連続したら fail に遷移

現在 fail:
  ok が recovery_threshold 回連続したら ok に遷移

現在 unknown:
  最初の成功で ok
  最初の失敗は consecutive_failures を進め、threshold 到達で fail
```

## 保持の考え方

推奨:

- `check_results`: 30〜90 日
- `status_events`: 長期保存
- `incidents`: 長期保存

長期の稼働率が必要なら、日次または時間単位の集計テーブルへ圧縮します。
