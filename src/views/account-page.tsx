import { renderToString } from "hono/jsx/dom/server";
import { AppLayout } from "./app-layout.tsx";
import type { CloudflareAccessIdentity } from "../http/shared";
import type { ApiTokenRow } from "../store/api-tokens";

type AccountToken = ApiTokenRow & { status: "active" | "expired" };

const tokenStatus = (token: ApiTokenRow): AccountToken["status"] => {
  if (token.expires_at && token.expires_at <= new Date().toISOString()) return "expired";
  return "active";
};

const statusLabel: Record<AccountToken["status"], string> = {
  active: "有効",
  expired: "期限切れ",
};

const AccountPanel = ({ tokens, newToken, feedback }: { tokens: ApiTokenRow[]; newToken?: string | null; feedback?: string | null }) => (
  <section id="account-panel" class="w-full">
    <div class="shell">
      <header id="account-header" class="section-head flex flex-wrap items-end justify-between gap-4 px-6 py-6">
        <div><p class="text-sm font-bold uppercase tracking-[0.28em] text-sky-300">Account</p><h2 class="mt-2 text-3xl font-black text-slate-50">ユーザー設定</h2></div>
        <p class="text-sm text-slate-300">自分の API token を管理します。</p>
      </header>
      {feedback ? <div id="account-feedback" class="mx-6 mt-4 rounded-md border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" role="alert">{feedback}</div> : null}
      {newToken ? <div id="account-new-token" class="mx-6 mt-6 rounded-md border border-emerald-400/30 bg-emerald-500/10 p-4"><p class="font-bold text-emerald-100">token を作成しました。この値は今回だけ表示されます。</p><div class="mt-3 flex items-start gap-2"><code id="account-new-token-value" class="min-w-0 flex-1 break-all rounded bg-slate-950/70 p-3 text-sm text-emerald-200">{newToken}</code><button id="account-new-token-copy" class="glass-button shrink-0 rounded-md px-3 py-2 text-sm font-bold" type="button" data-copy-target="account-new-token-value">コピー</button></div></div> : null}
      <section id="account-token-create-section" class="mt-8 grid gap-6 border-b border-slate-700/30 px-6 pb-8 lg:grid-cols-3">
      <div id="account-token-create-card" class="lg:border-r lg:border-slate-700/30 lg:pr-6">
        <h3 class="font-black text-slate-50">API token を作成</h3>
        <form id="account-token-create-form" class="mt-4 grid gap-3" method="post" action="/account/tokens" hx-post="/account/tokens" hx-target="#account-panel" hx-swap="outerHTML">
          <input id="account-token-name" class="glass-input rounded-md px-3 py-2" name="name" placeholder="用途名" required maxlength={100} />
          <label class="grid gap-1 text-sm text-slate-300" for="account-token-expires-at">有効期限（任意）<input id="account-token-expires-at" class="glass-input rounded-md px-3 py-2" name="expires_at" type="datetime-local" /></label>
          <button id="account-token-create-submit" class="glass-button rounded-md px-3 py-2 font-bold" type="submit">作成</button>
        </form>
      </div>
      <div id="account-token-list-card" class="lg:col-span-2">
        <h3 id="account-token-list-title" class="font-black text-slate-50">発行済み token</h3>
        <div id="account-token-list" class="mt-4 grid gap-2">
          {tokens.length > 0 ? tokens.map((token) => {
            const status = tokenStatus(token);
            return <div id={`account-token-${token.id}`} class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-700/70 px-3 py-2"><div><p id={`account-token-${token.id}-name`} class="font-bold text-slate-100">{token.name}</p><p id={`account-token-${token.id}-details`} class="text-xs text-slate-400">作成: <time data-utc-time={token.created_at} data-utc-seconds="false">{token.created_at}</time>{token.expires_at ? <> / 期限: <time data-utc-time={token.expires_at} data-utc-seconds="false">{token.expires_at}</time></> : null}</p></div><div class="flex items-center gap-2"><span id={`account-token-${token.id}-status`} class="rounded-md border border-sky-300/30 bg-sky-400/10 px-2 py-1 text-xs text-sky-100">{statusLabel[status]}</span>{status === "active" ? <form method="post" action={`/account/tokens/${token.id}/delete`} hx-post={`/account/tokens/${token.id}/delete`} hx-target="#account-panel" hx-swap="outerHTML swap:250ms" data-account-token-delete="true"><button id={`account-token-${token.id}-delete`} class="glass-button rounded-md px-3 py-1 text-xs font-bold" type="submit">削除</button></form> : null}</div></div>;
          }) : <p id="account-token-empty" class="text-sm text-slate-400">発行済み token はありません。</p>}
        </div>
      </div>
      </section>
    </div>
  </section>
);

const AccountDocument = ({ tokens, identity, isSuperadmin }: { tokens: ApiTokenRow[]; identity: CloudflareAccessIdentity; isSuperadmin: boolean }) => (
  <AppLayout title="Edge Pulse / ユーザー設定" activeHref="/" footerStatus="healthy" accessIdentity={identity} isSuperadmin={isSuperadmin}>
    <AccountPanel tokens={tokens} />
  </AppLayout>
);

export const renderAccountPage = (tokens: ApiTokenRow[], identity: CloudflareAccessIdentity, isSuperadmin = false): Response => new Response(renderToString(<AccountDocument tokens={tokens} identity={identity} isSuperadmin={isSuperadmin} />), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export const renderAccountPanel = (tokens: ApiTokenRow[], feedback: string | null = null, newToken: string | null = null): string => renderToString(<AccountPanel tokens={tokens} feedback={feedback} newToken={newToken} />);
