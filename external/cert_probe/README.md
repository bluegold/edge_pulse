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

## API

`GET /probe`

### Query

- `host`: 必須
- `port`: 省略時 `443`
- `servername`: 省略時 `host`

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

`InsecureSkipVerify` を使うため、期限切れや自己署名でも証明書情報の取得を優先します。
API が返す `days_remaining` は、監視側で 30 日以内の警告判定に使います。

## ログ

各リクエストの処理結果を標準出力へ JSONL で 1 行ずつ出します。

例:

```json
{"timestamp":"2026-06-22T08:00:00Z","event":"probe","method":"GET","path":"/probe","query":"host=www.example.com&port=443","status":200,"duration_ms":123,"result":{"host":"www.example.com","port":443,"servername":"www.example.com","subject":"CN=www.example.com","issuer":"CN=Example CA","class":"RSA","valid_from":"2026-01-05T00:00:00Z","valid_to":"2027-01-31T00:00:00Z","days_remaining":223,"dns_names":["www.example.com"]}}
```
