import { renderToString } from "hono/jsx/dom/server";
import { AppLayout, DashboardDivider } from "./app-layout.tsx";
import type { AdminData } from "../store/admin";
import type { CloudflareAccessIdentity } from "../http/shared";

const userGroups = (data: AdminData, groupIds: number[]) => data.groups.filter((group) => groupIds.includes(group.id));

const AdminUserRow = ({ data, user }: { data: AdminData; user: AdminData["users"][number] }) => (
  <tr id={`admin-user-${user.id}`}>
    <td class="border-b border-slate-700/30 px-3 py-3 align-top">
      <p class="font-bold text-slate-100">{user.display_name} <span class="text-xs text-sky-300">{user.role}</span></p>
      <p id={`admin-user-${user.id}-identity`} class="mt-1 text-xs text-slate-400">{user.email ?? user.identity_subject}</p>
    </td>
    <td id={`admin-user-${user.id}-groups`} class="border-b border-slate-700/30 px-3 py-3 align-top">
      <div id={`admin-user-${user.id}-group-list`} class="flex flex-wrap gap-2">
        {userGroups(data, user.group_ids).length > 0 ? userGroups(data, user.group_ids).map((group) => (
          <form id={`admin-user-${user.id}-group-${group.id}`} method="post" action={`/admin/users/${user.id}/groups`} hx-post={`/admin/users/${user.id}/groups`} hx-target="#admin-panel" hx-swap="outerHTML" class="inline-flex">
            <input type="hidden" name="group_id" value={group.id} />
            <button id={`admin-user-${user.id}-group-${group.id}-remove`} class="inline-flex items-center gap-1 rounded-md border border-sky-300/30 bg-sky-400/10 py-1 pl-2 pr-1 text-xs text-sky-100 hover:border-sky-200/60" type="submit" title={`${group.name} の所属を解除`} aria-label={`${group.name} の所属を解除`}>
              <span>{group.name} <span class="text-sky-300/70">({group.slug})</span></span><span aria-hidden="true">×</span>
            </button>
          </form>
        )) : <span id={`admin-user-${user.id}-group-pending`} class="text-sm text-amber-200">割当待ち</span>}
      </div>
    </td>
    <td class="border-b border-slate-700/30 px-3 py-3 align-top">
      <form id={`admin-user-${user.id}-add-form`} method="post" action={`/admin/users/${user.id}/groups`} hx-post={`/admin/users/${user.id}/groups`} hx-target="#admin-panel" hx-swap="outerHTML" class="flex min-w-[15rem] gap-2">
        <select id={`admin-user-${user.id}-group`} class="glass-input min-w-0 flex-1 rounded-md px-2 py-2 text-sm" name="add_group_id" required><option value="">group を選択</option>{data.groups.filter((group) => group.slug !== "orphan").map((group) => <option value={group.id}>{group.name} ({group.slug})</option>)}</select>
        <button id={`admin-user-${user.id}-add`} class="glass-button rounded-md px-3 py-2 text-sm font-bold" name="operation" value="add" type="submit">追加</button>
      </form>
    </td>
  </tr>
);

const AdminPanel = ({ data, feedback = null }: { data: AdminData; feedback?: string | null }) => (
  <section id="admin-panel" class="w-full">
    <div class="shell">
      <header id="admin-header" class="section-head flex flex-wrap items-end justify-between gap-4 px-6 py-6">
        <div><p class="text-sm font-bold uppercase tracking-[0.28em] text-sky-300">Administration</p><h2 class="mt-2 text-3xl font-black text-slate-50">管理者機能</h2></div>
        <p class="text-sm text-slate-300">group、ユーザー、監視対象の割り当てを管理します。</p>
      </header>
      <div id="admin-feedback" class={feedback ? "mx-6 mt-4 rounded-md border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" : "sr-only"} role={feedback ? "alert" : undefined}>{feedback ?? ""}</div>

      <section id="admin-groups-section" class="mt-8 grid gap-6 px-6 pb-8 lg:grid-cols-3">
      <div id="admin-group-create-card" class="lg:border-r lg:border-slate-700/30 lg:pr-6">
        <h3 class="font-black text-slate-50">group 作成</h3>
        <form id="admin-group-create-form" class="mt-4 grid gap-3" method="post" action="/admin/groups" hx-post="/admin/groups" hx-target="#admin-panel" hx-swap="outerHTML">
          <input id="admin-group-name" class="glass-input rounded-md px-3 py-2" name="name" placeholder="表示名" required />
          <input id="admin-group-slug" class="glass-input rounded-md px-3 py-2" name="slug" placeholder="slug" required pattern="[a-z0-9-]+" />
          <button id="admin-group-create-submit" class="glass-button rounded-md px-3 py-2 font-bold" type="submit">作成</button>
        </form>
      </div>
      <div id="admin-groups-panel" class="lg:col-span-2">
        <h3 id="admin-groups-title" class="font-black text-slate-50">group 一覧</h3>
        <div id="admin-groups-list" class="mt-4 grid gap-2 sm:grid-cols-2">
          {data.groups.map((group) => <div id={`admin-group-${group.id}`} class="flex items-center justify-between gap-3 rounded-md border border-slate-700/70 px-3 py-2"><div id={`admin-group-${group.id}-info`}><p class="font-bold text-slate-100">{group.name}</p><p id={`admin-group-${group.id}-details`} class="text-xs text-slate-400">{group.slug} / #{group.id}</p></div><span id={`admin-group-${group.id}-check-count`} class="shrink-0 rounded-full border border-sky-300/30 bg-sky-400/10 px-2 py-1 text-xs text-sky-100">監視対象 {group.check_count}件</span></div>)}
        </div>
      </div>
    </section>

      <DashboardDivider />

      <section id="admin-assignment-section" class="mt-8 px-6 pb-8">
      <div id="admin-users-panel"><h3 id="admin-users-title" class="font-black text-slate-50">ユーザー割り当て</h3><div id="admin-users-list" class="mt-4 overflow-x-auto"><table id="admin-users-table" class="w-full min-w-[44rem] border-collapse text-left"><thead><tr class="border-b border-slate-700/50 text-xs uppercase tracking-wide text-slate-400"><th scope="col" class="px-3 py-2 font-bold">ユーザー</th><th scope="col" class="px-3 py-2 font-bold">所属グループ</th><th scope="col" class="px-3 py-2 font-bold">追加</th></tr></thead><tbody>{data.users.map((user) => <AdminUserRow data={data} user={user} />)}</tbody></table></div></div>
      </section>
    </div>
  </section>
);

const AdminDocument = ({ data, identity }: { data: AdminData; identity: CloudflareAccessIdentity }) => (
  <AppLayout title="Edge Pulse / 管理者" activeHref="/" footerStatus="healthy" accessIdentity={identity} isSuperadmin>
    <AdminPanel data={data} />
  </AppLayout>
);

export const renderAdminPanel = (data: AdminData, feedback: string | null = null): string => renderToString(<AdminPanel data={data} feedback={feedback} />);

export const renderAdminPage = (data: AdminData, identity: CloudflareAccessIdentity): Response => new Response(renderToString(<AdminDocument data={data} identity={identity} />), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
