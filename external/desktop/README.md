# Desktop Notifier

公開ステータス API を polling して、ローカルのステータス表示と通知を行う常駐アプリです。

## 目的

- `GET /api/public/status` を定期取得する
- `healthy / degraded / down` をローカル表示する
- 状態変化時に通知する
- 将来的に Linux / Windows / macOS へ広げる

## 構成

```text
external/desktop/
  cmd/pulse-tray          エントリポイント
  internal/app            共通ロジック
  internal/platform       interface と factory
  internal/platform/linux Linux 向け実装
```

## ビルド

通常ビルドはトレイなしです。状態表示は標準出力、通知は `notify-send` を使います。

```bash
go build ./cmd/pulse-tray
```

Linux のトレイアイコンを有効にするには `tray` ビルドタグを付けます。

```bash
go build -tags tray ./cmd/pulse-tray
```

`tray` ビルドには `github.com/getlantern/systray` が使う AppIndicator 開発パッケージが必要です。Ubuntu 系では少なくとも次が必要です。

```bash
sudo apt install libayatana-appindicator3-dev
```

Budgie ではパネル側に System Tray / Status Notifier 対応アプレットが必要です。

## 設定

- `EDGE_PULSE_STATUS_URL`
  - 必須
  - 公開 status API の URL
- `EDGE_PULSE_DASHBOARD_URL`
  - 任意
  - `Open Dashboard` で開く管理画面 URL
  - Cloudflare Access 配下のダッシュボードを開く場合はこちらを別指定する
- `EDGE_PULSE_POLL_INTERVAL`
  - 任意
  - 既定値は `30s`

## バージョン

デフォルトのバージョン文字列は `dev` です。`Justfile` の `build-desktop` / `build-desktop-tray` は `git describe --tags --always --dirty` の結果を `main.version` に埋め込みます。
