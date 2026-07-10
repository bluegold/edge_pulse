# アーキテクチャ

## 基本フロー

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

Queue は RPC として使いません。`scheduled()` 側へ結果を返さず、一方通行にします。

## scheduled() の責務

`scheduled()` はチェックそのものを実行しません。

責務:

1. `enabled = 1` かつ `next_check_at <= now` の `checks` を取得する
2. `check_runs` を作成する
3. Queue に `CheckJob` を投入する
4. `last_enqueued_at` と `next_check_at` を更新する

補助動作:

- undispatched run の再 dispatch
- stale lease の requeue

## Queue consumer の責務

責務:

1. `check_runs` の lease を取得する
2. 対象 `check` を取得する
3. URL を検証する
4. timeout 付きで `fetch()` する
5. 必要に応じて証明書スナップショットを取得する
6. `ok` / `fail` を判定する
7. `check_results` を保存する
8. `checks` を更新する
9. 必要なら `status_events` / `incidents` を更新する
10. `check_runs.finished_at` を更新する

状態更新・event 保存・incident 更新は、できる限り同じ処理単位で `D1.batch()` にまとめます。

## Queue ack / retry

### retry しないもの

監視対象の失敗は正常な観測結果として保存し、Queue retry しません。

- 対象 URL の HTTP 500 / 404
- timeout
- DNS error
- TLS error

### retry するもの

監視システム側の失敗だけ retry します。

- D1 書き込み失敗
- 予期しない例外
- 一時的な Cloudflare 側実行失敗

## URL fetch の方針

- `http:` / `https:` のみ許可
- `redirect: "manual"` を使う
- レスポンス本文は読まない
- 必ず timeout を設定する

Workers 実行基盤の `fetch()` から `internal error; reference = ...` が返る場合があります。このとき JS 側で詳細原因を取得できないことがあるため、利用者向け UI では `runtime error` として扱います。

## 証明書プローブ

TLS 証明書情報は Worker の `fetch()` だけでは取り切れないため、別プローブで取得します。

利用経路:

- `CertProbeContainer` binding
- `CERT_PROBE_URL`

保存先は `checks` の証明書スナップショット列です。

`days_remaining <= 30` は証明書警告として `fail` 扱いにします。

## 通知

現在は状態遷移時に webhook / Discord 通知を dispatch します。

- 通知失敗でチェック結果保存を巻き戻さない
- `ctx.waitUntil()` または catch で本処理から切り離す
- 送信失敗は structured log に残す

将来、配信量や retry 制御が必要になれば `notification-queue` に分離します。

## ダッシュボード集計方針

無効な監視対象は少なくとも次に含めません。

- `障害中`
- `現在の障害`
- `最近の監視対象`

Dashboard は Queue 状態や Worker メモリに依存せず、D1 の内容だけを見て表示します。
