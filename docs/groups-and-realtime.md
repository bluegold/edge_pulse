# Group とリアルタイム通知

## 目的

監視対象をテナント単位の `group` に所属させ、同じ group のユーザーが incident の状況をリアルタイムに共有できるようにする。

Durable Object (DO) は group ごとの WebSocket 接続とイベント配信を担当する。監視状態、ユーザー、所属関係、reaction などの永続状態は D1 に保存する。

## ドメインモデル

```text
user ──< group_members >── group ──< checks
```

- `group` はテナント、つまり会社や運用対象システムの境界とする
- `check` は必ず 1 つの group に所属する
- `user` は複数の group に所属できる
- ユーザーが複数 group を横断して表示できることを許可する
- group 間で incident、reaction、WebSocket 接続を共有しない

check を複数 group に所属させる多対多関係は採用しない。テナント境界と権限判定を単純に保ち、誤配信を防ぐためである。

### 想定テーブル

```text
users
  id
  identity_provider
  identity_subject
  display_name
  created_at

groups
  id
  name
  slug
  created_at

group_members
  group_id
  user_id
  role
  created_at

checks
  group_id NOT NULL

incident_reactions
  id
  incident_id
  user_id
  reaction_key
  created_at
```

`group_members(group_id, user_id)` は一意とする。`incident_reactions(incident_id, user_id, reaction_key)` も一意とし、同じユーザーが同じ reaction を重複して付けられないようにする。

ユーザー識別には表示用メールアドレスではなく、Cloudflare Access などの認証プロバイダーが発行する安定した subject を使う。

## Group Durable Object

DO は group ごとに deterministic に作成する。

```text
env.GROUPS.getByName(`group:${groupId}`)
```

Group DO の責務:

- group に所属するユーザーの WebSocket 接続を受け付ける
- 接続ごとの認証済みユーザー情報を保持する
- group 内のイベントを接続中のユーザーへ broadcast する
- 再接続・権限削除・購読解除を処理する

Group DO が担当しないこと:

- check や incident の現在状態を唯一の場所として保持する
- reaction のカウントをメモリだけで管理する
- membership の永続化
- D1 の代わりに dashboard の状態を返す

WebSocket は Hibernatable WebSocket API を使用する。接続単位のユーザー情報は、DO の休止・再初期化後も復元できるようにする。DO の通信は group という協調単位に限定し、全テナントを 1 つの DO に集約しない。

## イベントの流れ

### 監視結果・incident

```text
Queue consumer が監視結果を処理
  ↓
D1 に check / incident / status_event を保存
  ↓
関連 group の DO に publish
  ↓
同じ group の WebSocket 接続へ broadcast
  ↓
クライアントが必要に応じて D1 ベースの画面/API を再取得
```

D1 の保存を先に完了させる。DO への publish が失敗しても、監視結果の保存を巻き戻さない。WebSocket は表示の即時性を高めるための配信経路であり、状態の正しさを保証する経路ではない。

イベントには少なくとも次を含める。

```json
{
  "type": "incident.opened",
  "eventId": "...",
  "groupId": 10,
  "incidentId": 123,
  "occurredAt": "2026-08-01T00:00:00.000Z"
}
```

`eventId` を使って、再接続や複数 group 購読時の重複イベントをクライアント側で抑止できるようにする。イベントを受信したクライアントは、必要に応じて現在の D1 状態を HTTP で再取得する。

### Reaction

「調査中」「対応中」は incident の状態ではなく、Slack の reaction に近い協力状況として扱う。

```text
incident #123
  👀 調査中  2
  🛠 対応中  3
```

reaction の追加・削除の流れ:

```text
ユーザーが reaction を操作
  ↓
Worker が group membership と権限を確認
  ↓
D1 に reaction を追加または削除
  ↓
D1 から確定した count を取得
  ↓
Group DO が reaction.changed を broadcast
```

reaction イベントの例:

```json
{
  "type": "incident.reaction_changed",
  "eventId": "...",
  "groupId": 10,
  "incidentId": 123,
  "reaction": "responding",
  "count": 3,
  "occurredAt": "2026-08-01T00:00:00.000Z"
}
```

reaction の count は D1 の一意制約と保存結果を基準にする。DO のメモリ上の count を正として扱わない。

reaction は通常、Discord や webhook などの外部通知対象にしない。incident の発生・復旧は外部通知し、reaction は group 内のリアルタイム共有に限定する。

初期の reaction は allowlist で管理する。

```text
investigating = 👀
responding    = 🛠️
acknowledged  = 👍
```

## 認証・権限

- WebSocket handshake 時に group membership を確認する
- incident の閲覧・reaction 操作は、incident の check が所属する group の membership を要求する
- membership を削除したときは、該当 group DO に通知して既存 WebSocket を切断する
- group をまたいだイベント broadcast は行わない
- 複数 group を購読するユーザーは group ごとに WebSocket 接続を持つ
- 接続切断後は指数バックオフで再接続し、再接続時に D1 ベースの最新状態を取得する

## 実装順序

1. `users` / `groups` / `group_members` を追加する
2. `checks.group_id` と group 単位の認可を追加する
3. `incident_reactions` と reaction 操作 API を追加する
4. D1 更新後に発行するイベント形式を定義する
5. Group DO と Hibernatable WebSocket を追加する
6. dashboard に複数 group 表示と reaction UI を追加する
7. desktop notifier など複数 group 購読クライアントへ拡張する

