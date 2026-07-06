# cert-probe

TLS 証明書の最新情報を返す小さな HTTP API です。

## 起動

```bash
go run .
```

または Docker で起動します。

```bash
docker build -t cert-probe .
docker run --rm -p 8080:8080 cert-probe
```

待ち受けポートは `PORT` 環境変数で変更できます。未指定時は `8080` です。
例:

```bash
PORT=9000 go run .
```

## API

`GET /ping`

Cloudflare Containers の起動確認に使う簡易ヘルスチェックです。

`GET /probe`

`GET` のみ許可します。`POST` などは `405 Method Not Allowed` を返します。

### Query

- `host`: 必須
- `port`: 1 から 65535 まで。省略時 `443`
- `servername`: 省略時 `host`。制御文字や改行を含む値は拒否します

### Host validation

`/probe` は SSRF 的な使い方を避けるため、少なくとも次の host を拒否します。

- `localhost`
- `*.localhost`
- loopback
- private IPv4
- link-local IPv4
- CGNAT IPv4
- IPv6 loopback
- IPv6 unspecified
- IPv6 link-local
- IPv6 ULA
- IPv6 multicast
- IPv4-mapped IPv6 の private / loopback / special-use address

### Response

```json
{
  "host": "www.example.com",
  "port": 443,
  "servername": "www.example.com",
  "subject": "CN=www.example.com",
  "issuer": "CN=Example CA",
  "class": "RSA",
  "valid_from": "2026-01-05T00:00:00Z",
  "valid_to": "2027-01-31T00:00:00Z",
  "days_remaining": 223,
  "dns_names": ["www.example.com"],
  "error": ""
}
```

`InsecureSkipVerify` を使うため、期限切れや自己署名でも証明書情報の取得を優先します。これは証明書検証を省略するためではなく、証明書自体を取得するための設定です。
API が返す `days_remaining` は、監視側で 30 日以内の警告判定に使います。

`external/cert_probe` は HTTP サーバーの timeout も設定しています。

現状、外部から調整する設定項目はこの待ち受けポートだけです。DNS や probe 対象はリクエストの入力であり、固定設定ではありません。

## ログ

各リクエストの処理結果を標準出力へ JSONL で 1 行ずつ出します。

例:

```json
{"timestamp":"2026-06-22T08:00:00Z","event":"probe","method":"GET","path":"/probe","query":"host=www.example.com&port=443","status":200,"duration_ms":123,"result":{"host":"www.example.com","port":443,"servername":"www.example.com","subject":"CN=www.example.com","issuer":"CN=Example CA","class":"RSA","valid_from":"2026-01-05T00:00:00Z","valid_to":"2027-01-31T00:00:00Z","days_remaining":223,"dns_names":["www.example.com"]}}
```
