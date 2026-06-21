# DASHBOARD.md

Cloudflare Workers Uptime Monitor のダッシュボード設計メモです。

この画面は、登録済み URL の現在状態と、過去から現在までの障害発生・復旧状況を把握するためのものです。

## 方針

ダッシュボードの主役は「1 本の障害タイムライン」です。

監視対象ごとに複数行のガントチャートを並べるのではなく、画面中央に 1 本の時間軸を置き、その上に incident の注釈を表示します。

現在も継続中の障害だけは、タイムライン上の注釈に加えて、別枠の警告エリアで強調表示します。

## なぜ 1 本のタイムラインにするか

監視対象ごとの横棒タイムラインは、監視対象が少ないうちは便利です。

しかし、監視対象が増えると次の問題が出ます。

- 行数が増えて一覧性が落ちる
- 「いつ障害が起きたか」が見えにくい
- 同時期に複数サービスで障害が起きたかを判断しづらい
- ciao 的な軽量監視ダッシュボードとしては情報量が重い

このダッシュボードでは、個々の監視対象の詳細な状態推移よりも、incident の時系列把握を優先します。

## 画面構成

```text
┌─────────────────────────────────────────────────────────────┐
│ Uptime Monitor                         [検索] [24h][7日][30日] [更新] [+新規監視] │
├─────────────────────────────────────────────────────────────┤
│ [監視URL 6] [稼働中 4] [障害中 2] [24h障害件数 5] [平均応答 280ms] │
├─────────────────────────────────────────────────────────────┤
│ 現在の障害                                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ⚠ payments.example.com 障害中  開始 12:42  継続 1h18m       │ │
│ │ ⚠ admin.example.com    障害中  開始 14:05  継続 55m         │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ 障害タイムライン                                  左が過去 / 右が現在 │
│                                                             │
│  24h前          12h前             6h前          1h前       現在 │
│    |-------------|----------------|-------------|----------|    │
│        ↑ api.example.com 障害 19m                              │
│             ↑ db-proxy.example.com 障害 23m                    │
│                       ↑ app.example.com 障害 26m               │
│                                      ↑ payments.example.com 障害開始 │
│                                                  ↑ admin.example.com 障害開始 │
│                                                             │
│  ※ 復旧済みは短い注釈、継続中は上の警告欄で強調表示              │
├─────────────────────────────────────────────────────────────┤
│ 監視対象一覧                         │ 障害履歴                 │
│ ...                                  │ ...                      │
└─────────────────────────────────────────────────────────────┘
```

## 表示優先順位

1. 現在障害中のものがすぐ分かる
2. 障害が現在も続いているか、復旧済みかが分かる
3. いつ障害が発生したかが分かる
4. 障害継続時間が分かる
5. 複数サービスの障害が同時期に起きたか分かる
6. 詳細は下部テーブルで確認する

## セクション

### Header

画面上部の操作エリアです。

項目:

- アプリ名: `Uptime Monitor`
- 検索ボックス
- 期間フィルタ: `24h` / `7日` / `30日`
- 更新ボタン
- 新規監視ボタン

### Summary Cards

現在状態の概要を横並びで表示します。

表示項目:

- 監視URL
- 稼働中
- 障害中
- 24h障害件数
- 平均応答

例:

```text
[監視URL 6] [稼働中 4] [障害中 2] [24h障害件数 5] [平均応答 280ms]
```

### Current Incidents

現在も継続中の障害だけを表示します。

表示条件:

```sql
incidents.resolved_at IS NULL
```

表示内容:

- 監視対象名
- 状態
- 開始時刻
- 継続時間
- 直近エラー
- 最終確認時刻

例:

```text
⚠ payments.example.com
  障害中 / 開始 12:42 / 継続 1h 18m / HTTP 500 / 最終確認 15:00:27

⚠ admin.example.com
  障害中 / 開始 14:05 / 継続 55m / timeout / 最終確認 15:00:28
```

現在の障害は対応対象なので、履歴テーブルより上に出します。

### Incident Timeline

1 本の時間軸で、表示期間内の incident を表示します。

表示対象:

```sql
incidents.started_at が表示期間内
または incidents.resolved_at が表示期間内
または incidents.resolved_at IS NULL
```

横軸:

- 24h
  - `24h前`
  - `12h前`
  - `6h前`
  - `1h前`
  - `現在`

- 7日
  - `7日前`
  - `5日前`
  - `3日前`
  - `1日前`
  - `現在`

- 30日
  - `30日前`
  - `21日前`
  - `14日前`
  - `7日前`
  - `現在`

表示ルール:

- 復旧済み incident は、発生から復旧までの範囲を短い線で表示する
- 継続中 incident は、発生位置から現在方向への線を表示する
- 継続中 incident の詳細は Current Incidents に表示する
- 注釈ラベルには `監視対象名 + 障害 + 継続時間` を表示する
- ラベル衝突を避けるため、注釈は 3〜5 レーンに分散する

例:

```text
障害タイムライン
左が過去 / 右が現在

24h前          12h前              6h前          1h前       現在
 |--------------|-----------------|-------------|----------|
      ┌ api.example.com 障害 19m
      └─────

          ┌ db-proxy.example.com 障害 23m
          └──────

                         ┌ app.example.com 障害 26m
                         └───────

                                      ┌ payments.example.com 障害開始
                                      │
                                      └────────────── 現在も継続中

                                                 ┌ admin.example.com 障害開始
                                                 │
                                                 └──── 現在も継続中
```

### Monitor List

監視対象の現在状態一覧です。

列:

- 名称
- URL
- 状態
- 応答
- 最終確認
- 直近障害

用途:

- 各監視対象の現在状態を確認する
- 詳細画面への入口にする
- 監視停止中の対象も分かるようにする

状態表示:

- `OK`
- `障害中`
- `未確認`
- `停止中`

### Incident History

障害履歴テーブルです。

列:

- 監視対象
- 発生
- 復旧
- 継続時間
- 原因
- 状態

状態:

- `復旧`
- `継続中`
- `無視`

このテーブルは詳細確認用です。ダッシュボードの主役ではありません。

## 状態の分離

監視状態と incident の管理状態は分けます。

### 監視状態

`checks.last_state` に保存します。

```text
unknown
ok
fail
```

### incident 管理状態

初期実装では `incidents.resolved_at` の有無だけで判定します。

```text
resolved_at IS NULL     => 継続中
resolved_at IS NOT NULL => 復旧
```

将来、人的対応ステータスが必要な場合は `incidents.status` を追加します。

```text
open
investigating
resolved
ignored
```

`調査中` は監視状態ではありません。監視状態としては `fail` のまま、人間側の対応状態が `investigating` です。

## タイムライン描画データ

Worker 側で、incident を UI 用に整形して渡します。

```ts
type TimelineItem = {
  id: number;
  checkName: string;
  startedAt: string;
  resolvedAt: string | null;
  durationLabel: string;
  status: "resolved" | "open";
  reason: string | null;
  lane: number;
  startPercent: number;
  endPercent: number;
};
```

`startPercent` と `endPercent` は表示期間の左端を 0、右端を 100 として計算します。

```text
startPercent = (startedAt - rangeStart) / (rangeEnd - rangeStart) * 100
endPercent   = (resolvedAt or now - rangeStart) / (rangeEnd - rangeStart) * 100
```

表示期間より前から継続している incident は、`startPercent = 0` に丸めます。

表示期間より後の時刻は、`endPercent = 100` に丸めます。

## ラベル衝突

初期実装では単純なレーン分散でよいです。

```ts
lane = index % 4;
```

より正確にするなら、直前の item と横方向に近い場合は別レーンへ逃がします。

## 推奨 CSS 構造

### 全体

```text
.dashboard
  .topbar
  .summary-grid
  .current-incidents
  .timeline-card
  .bottom-grid
```

### Timeline

```text
.timeline
  .timeline-axis
  .timeline-ticks
  .timeline-items
    .timeline-item
      .timeline-line
      .timeline-marker
      .timeline-label
```

Timeline は CSS の absolute positioning で描画します。

```css
.timeline-items {
  position: relative;
  height: 220px;
}

.timeline-item {
  position: absolute;
  left: var(--start);
  width: var(--width);
  top: var(--top);
}
```

## SQL

### 現在障害

```sql
SELECT
  i.id,
  c.name,
  c.url,
  i.started_at,
  i.start_reason,
  i.start_status_code,
  c.last_checked_at,
  c.last_error
FROM incidents i
JOIN checks c ON c.id = i.check_id
WHERE i.resolved_at IS NULL
ORDER BY i.started_at ASC;
```

### タイムライン

```sql
SELECT
  i.id,
  c.name,
  c.url,
  i.started_at,
  i.resolved_at,
  i.start_reason,
  i.end_reason,
  i.failure_count
FROM incidents i
JOIN checks c ON c.id = i.check_id
WHERE i.started_at >= ?
   OR i.resolved_at >= ?
   OR i.resolved_at IS NULL
ORDER BY i.started_at ASC;
```

### 監視対象一覧

```sql
SELECT
  c.id,
  c.name,
  c.url,
  c.enabled,
  c.last_state,
  c.last_status_code,
  c.last_latency_ms,
  c.last_checked_at,
  c.last_error
FROM checks c
ORDER BY c.name ASC;
```

### 障害履歴

```sql
SELECT
  i.id,
  c.name,
  i.started_at,
  i.resolved_at,
  i.start_reason,
  i.end_reason,
  i.failure_count
FROM incidents i
JOIN checks c ON c.id = i.check_id
ORDER BY i.started_at DESC
LIMIT 50;
```

## 実装時の注意

- タイムラインは `incidents` から描画する
- `check_results` を直接タイムライン描画に使わない
- 現在障害中のものは Current Incidents で強調する
- 継続中 incident はタイムライン上にも開始点を出す
- `調査中` を監視状態に混ぜない
- 画面更新は手動更新ボタン + 必要なら一定間隔の軽い auto refresh
- 監視地点は固定されないため、画面内に注記を出す

## 監視地点に関する注記

Cloudflare Workers の Cron Trigger は、監視地点として固定できません。

画面下部またはタイムライン付近に次の注記を出すことを推奨します。

```text
Checked from Cloudflare edge. Check location is not fixed.
```
