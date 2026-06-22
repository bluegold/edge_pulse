import { renderToString } from "hono/jsx/dom/server";
import { raw } from "hono/html";
import { AppLayout } from "./app-layout.tsx";
import { renderDashboardShell, type DashboardData } from "./dashboard-page.ts";

const DashboardDocument = ({ data }: { data: DashboardData }) => (
  <AppLayout title="Edge Pulse" activeHref="/">
    {raw(renderDashboardShell(data))}
  </AppLayout>
);

export const renderDashboardPage = (data: DashboardData): Response =>
  new Response(renderToString(<DashboardDocument data={data} />), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export { renderDashboardShell } from "./dashboard-page.ts";
export type { DashboardData };
