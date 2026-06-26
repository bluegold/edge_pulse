# Local Testing

このプロジェクトは `wrangler dev` を前提に、ローカルで D1 と Queue を使って確認できます。

## 事前準備

```bash
npm install
```

## 初回 migration

```bash
npm run db:migrate:local
```

`wrangler.jsonc` で `migrations_dir` を指定してあるので、D1 の schema は `migrations/` から管理します。

## 通常のローカル起動

```bash
npm run dev
```

## scheduled のローカル確認

```bash
npm run dev:scheduled
```

`scheduled()` は due な check を Queue に積むだけで、実際の URL fetch は queue consumer が行います。

別ターミナルで `scheduled()` だけを fire する場合:

```bash
npm run scheduled:fire
```

これは `wrangler dev --test-scheduled` で起動した dev server に対して、`/cdn-cgi/handler/scheduled` を叩きます。必要なら `SCHEDULED_FIRE_URL` で送信先を上書きできます。

## テスト

```bash
npm test
```

## ルール

- D1 を唯一の状態保存先にする
- Queue は RPC にしない
- dev では認証なしで表示する
- binding 名は `pulse-db` / `pulse-queue` を使う
