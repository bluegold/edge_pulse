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
- group membership が 0 件の user は、管理者による割り当て待ちとする
- `superadmin` は group membership に関係なく全 group を管理できる
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
  role
  created_at

groups
  id
  name
  slug
  created_at

group_members
  group_id
  user_id
  created_at

checks
  group_id NOT NULL

incident_reactions
  id
  incident_id
  user_id
  reaction_key
  created_at

api_tokens
  id
  user_id
  token_hash
  name
  last_used_at
  expires_at
  revoked_at
  created_at

audit_logs
  id
  actor_user_id
  action
  target_type
  target_id
  details_json
  created_at
```

`group_members(group_id, user_id)` は一意とする。`incident_reactions(incident_id, user_id, reaction_key)` も一意とし、同じユーザーが同じ reaction を重複して付けられないようにする。

ユーザー識別には表示用メールアドレスではなく、Cloudflare Access などの認証プロバイダーが発行する安定した subject を使う。`identity_provider` と `identity_subject` の組み合わせを一意にする。email や表示名は表示・更新用の属性であり、識別子には使わない。

`users.role` は当面 `superadmin` / `member` の 2 種類とする。`group_members` に group 内 role は持たせない。group 単位の viewer や administrator が必要になった場合に、別途追加する。

初期 migration では予約済みの `groups.slug = 'orphan'` を作成し、既存 check を一時的に所属させる。通常運用では orphan に check を残さない。orphan group は削除・改名できず、superadmin だけが閲覧・操作できる。コード上の判定は数値 ID `1` ではなく予約済み slug などで行う。

Access で認証された user は D1 に冪等に自動作成するが、初回作成時に group membership は作成しない。membership が 0 件の間は「管理者がグループを割り当てるのをお待ちください」と表示する。

group の作成、user の membership 追加・削除、check の group 移動は superadmin のみが実行できる。check が存在する group は削除できない。user がすべての group から削除された場合は、割り当て待ちに戻る。

管理者画面は group 作成と user の membership 管理を主な責務とする。check の group 移動は対象の状態を確認しながら操作できるよう、監視一覧または監視対象の編集画面で行う。superadmin にだけ group 選択欄を表示し、orphan は superadmin だけが選択できる。通常 user には group 情報と移動操作を表示しない。

check の group 移動は監査ログに保存し、監査ログは superadmin のみが閲覧できる。incident、reaction、status event は check に紐づくため、移動後は移動先 group の履歴として扱う。

API token は user 単位で管理する。認証済みユーザーは `/account` から自分の token を発行・削除でき、平文は発行時のレスポンスで一度だけ返す。superadmin は管理画面の管理用操作として対象 user の token も発行・削除できる。D1 には hash のみを保存し、有効期限、最終利用日時を管理する。削除した token は復元できない。現在の環境変数 `ADMIN_API_TOKEN` は既存の機械連携用 token として別扱いにする。

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

初期実装の WebSocket は、現在の Dashboard の「自動更新」ポーリングを置き換える更新通知の受信専用とする。クライアントから DO へのイベント送信、reaction 操作、WebSocket 経由の状態変更は行わない。クライアントは `group.updated` を受信したら、現在表示している画面を HTTP API または D1 ベースで再取得する。WebSocket の payload に画面の状態を含めず、通知は再取得の契機として扱う。

Group DO が担当しないこと:

- check や incident の現在状態を唯一の場所として保持する
- reaction のカウントをメモリだけで管理する
- membership の永続化
- D1 の代わりに dashboard の状態を返す

WebSocket は Hibernatable WebSocket API を使用する。接続単位のユーザー情報は、DO の休止・再初期化後も復元できるようにする。DO の通信は group という協調単位に限定し、全テナントを 1 つの DO に集約しない。

初期段階ではサーバーからクライアントへの一方向通知だけを実装し、クライアントからの WebSocket message handler は設けない。

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
  "type": "group.updated",
  "eventId": "...",
  "groupId": 10,
  "reason": "check.status_changed",
  "occurredAt": "2026-08-01T00:00:00.000Z"
}
```

`group.updated` は check 状態、incident、membership など group に属する D1 の更新をまとめて通知する。`reason` はログ・デバッグ用の補助情報であり、クライアントの状態判定には使わない。`eventId` を使って、再接続や複数 group 購読時の重複イベントをクライアント側で抑止できるようにする。イベントを受信したクライアントは、現在表示している URL を HTTP で再取得する。

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
- `superadmin` は group membership に関係なく handshake と API の group 権限確認を通過できる
- incident の閲覧・reaction 操作は、incident の check が所属する group の membership を要求する
- orphan に所属する check は通常 user には表示せず、superadmin だけが扱える
- membership を削除したときは、該当 group DO に通知して既存 WebSocket を切断する
- group をまたいだイベント broadcast は行わない
- 複数 group を購読するユーザーは group ごとに WebSocket 接続を持つ
- 接続切断後は一定時間後に再接続し、再接続に成功したときは D1 ベースの最新状態を取得する
- 受信済み `eventId` はクライアント側で保持し、重複通知による再取得を抑止する

Access の JWT から取得する安定した subject を user の識別に使う。初回ログイン処理は `identity_provider + identity_subject` をキーに冪等に行い、同時ログインでも user を重複作成しない。

### 開発時の user identity

localhost では Cloudflare Access の JWT 検証を行わず、環境変数で開発用 user identity を指定する。Access JWT を開発用に生成したり、リクエストヘッダーを信頼したりしない。

```text
DEV_ACCESS_SUBJECT  必須。開発用 user の subject
DEV_ACCESS_EMAIL    任意。表示用 email
DEV_ACCESS_NAME     任意。表示用 name
DEV_ACCESS_ROLE     任意。既定値は member。superadmin の動作確認時だけ指定する
```

開発用 identity も本番と同じ初回ログイン処理を通り、`identity_provider = 'cloudflare-access-dev'` と `DEV_ACCESS_SUBJECT` の組み合わせで user を冪等に作成・更新する。localhost 以外では `DEV_ACCESS_*` を無視し、通常の Cloudflare Access 検証を行う。API の動作確認には既存の `ADMIN_API_TOKEN` または user token を使う。

## 実装状況と今後の順序

1. `users` / `groups` / `group_members`、orphan group、group 単位の認可を追加済み
2. superadmin による group・membership・check 移動と監査ログを追加済み
3. D1 更新後の `group.updated` 通知、Group DO、受信専用 WebSocket を追加済み
4. `api_tokens` と user 単位の API token 管理を追加済み
5. `incident_reactions` と reaction 操作 API を追加する
6. dashboard に reaction UI を追加する
7. desktop notifier など複数 group 購読クライアントへ拡張する

check の group 移動と作成時の group 選択は、監視一覧または監視対象編集画面に実装する。未選択で作成された check は orphan に入り、superadmin が後から移動する。

## 実装計画

実装は次の順序で進める。

1. 認証コンテキストと開発用 identity 注入を追加する（完了）
2. `users` / `groups` / `group_members`、group 境界、superadmin 管理を追加する（完了）
3. D1 更新後に発行するイベント形式と Group Durable Object / Hibernatable WebSocket を追加する（完了）
4. user 単位 API token を追加し、既存の `ADMIN_API_TOKEN` と併存させる（完了）
5. `incident_reactions` と reaction 操作 API、Dashboard の reaction UI を追加する
6. migration、認証、認可、越境防止、token、WebSocket のテストを拡充する

各段階で D1 を唯一の状態保存先とし、既存の監視 Queue・incident 状態遷移を維持する。
