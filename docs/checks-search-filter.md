# Checks Search Filter 仕様

`/checks` の検索は、次の 2 つの入力で構成する。

- `q`
- `filter`

`q` は人間向けの自由入力、`filter` は機械向けの構造化条件とする。
`filter` の内部表現は LDAP Search Filter 風の構文を使う。

## 方針

- `q` は単純な部分一致検索に使う
- `filter` は厳密な条件検索に使う
- 両方がある場合は `AND` として扱う
- UI は後でよいが、URL パラメータとしては `q` と `filter` を使う

## `q`

`q` は監視対象の `name` と `url` に対する部分一致検索とする。

- 大文字小文字は区別しない
- `name` または `url` のどちらかに含まれれば一致
- 空文字列なら無視

例:

- `q=api`
- `q=example.com`
- `q=payments`

## `filter`

`filter` は LDAP Search Filter 風の文字列とする。

### 参考実装

構文と評価の考え方は `../ldf/typescript/` の `parseFilter` / `evaluateFilter` に合わせる。

### 構文

基本形:

```text
(attr=value)
```

論理演算:

```text
(&(expr1)(expr2))
(|(expr1)(expr2))
(!(expr))
```

### 演算子

- `=`: 完全一致
- `*`: presence フィルタ
- `*` を含む値: ワイルドカード一致
- `>=`: 以上
- `<=`: 以下
- `~=`: 非サポート

### 文字列エスケープ

必要な場合は LDAP 風の `\xx` エスケープを使う。

例:

```text
(name=api\2dprod)
```

### 括弧

- 文字列全体を括弧で囲んでもよい
- 先頭の `(` は外側のグルーピングとして解釈する

## 検索対象

`filter` は `checks` 一覧に対して評価する。

評価対象は raw な `checks` 行だけでなく、一覧表示のための派生属性も含めてよい。

### 主な属性

#### 基本属性

- `id`
- `name`
- `url`
- `enabled`
- `last_state`
- `last_status_code`
- `last_latency_ms`
- `last_error`
- `interval_minutes`
- `fail_threshold`
- `recovery_threshold`
- `consecutive_failures`
- `consecutive_successes`
- `first_failure_at`
- `first_success_at`
- `last_checked_at`

#### 証明書属性

- `tls_days_remaining`
- `tls_last_error`
- `tls_valid_to`

#### 派生属性

- `recent_incident_24h`
  - 直近 24 時間に incident がある
- `cert_expiring_soon`
  - 証明書期限が 30 日以内
- `status_bucket`
  - `ok` / `fail` / `unknown`

## ダッシュボード数値からの遷移

ダッシュボードの数値は、`/checks` の `filter` へ遷移するショートカットとして使う。

### 監視URL

- すべての監視対象を表示
- `filter` を付けない

### 稼働中

```text
(&(enabled=1)(last_state=ok))
```

### 障害中

```text
(&(enabled=1)(last_state=fail))
```

### 証明書30日以内

```text
(&(enabled=1)(cert_expiring_soon=1))
```

`tls_days_remaining<=30` を直接使ってもよいが、UI からは派生属性 `cert_expiring_soon` を使う方が安定する。

### 24h障害件数

```text
(recent_incident_24h=1)
```

## 絞り込みの合成

`q` と `filter` が両方ある場合は、次のように合成する。

```text
q 条件 AND filter 条件
```

例:

- `q=api`
- `filter=(&(enabled=1)(last_state=fail))`

この場合は「`api` を含み、かつ有効で障害中の監視対象」を返す。

## エラー扱い

- `filter` が空文字なら無視
- 構文エラーなら検索条件としては無効
- 未知属性は一致しないものとして扱う
- `~=` は非サポートとして扱う

## 実装メモ

- `q` は `LIKE` か同等の部分一致に落とす
- `filter` は AST にパースしてから評価する
- SQL 直書きで文字列連結しない
- まずは `checks` 一覧の検索に閉じる
