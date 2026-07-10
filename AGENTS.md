# AGENTS.md

このプロジェクトは Cloudflare Workers で実装する死活監視ダッシュボードです。

Coding agent は、この文書の制約を優先して実装してください。

設計や実装の詳細は次を参照してください。

- [README.md](README.md)
- [docs/models.md](docs/models.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/security.md](docs/security.md)

## 最重要方針

- D1 を状態の唯一の保存先にする
- Worker のグローバル変数、メモリ、Queue の未処理状態、Cron の実行状態をアプリケーション状態として扱わない
- Dashboard は D1 の内容だけを見て表示する

## 実装制約

- Queue を RPC のように使わない
- `scheduled()` はチェックを実行せず、Queue 投入と enqueue 系更新だけを行う
- Queue consumer が URL fetch と D1 更新を担当する
- HTTP 500 / timeout / DNS error / TLS error は監視対象の `fail` として保存し、Queue retry しない
- D1 書き込み失敗や予期しない例外だけを Queue retry 対象にする
- `ok -> fail` / `fail -> ok` の状態遷移は必ず DB に保存する
- incident の開始時刻は threshold 到達時刻ではなく `first_failure_at` を使う
- incident の復旧時刻は `first_success_at` を使う
- `checks.current_incident_id` は使わない
- URL は登録時と実行時の両方で検証する
- `fetch()` は原則 `redirect: "manual"` を使い、レスポンス本文を無制限に読まない

## UI 制約

- 見た目より状態管理の正確性を優先する
- 無効な監視対象は `障害中` / `現在の障害` / `最近の監視対象` に含めない
- Workers 実行基盤由来の `internal error; reference = ...` は利用者向け画面でそのまま表示しない

## 変更方針

- 既存の命名、構成、保存先の原則を崩さない
- D1 以外に新しい状態源を増やさない
- 設計変更が README / docs とずれる場合は、実装と一緒に文書も更新する
