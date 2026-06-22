import { renderToString } from "hono/jsx/dom/server";
import { raw } from "hono/html";
import { AppLayout } from "./app-layout.tsx";
import { renderChecksShell, type ChecksPageData } from "./checks-page.ts";

const ChecksDocument = ({ data }: { data: ChecksPageData }) => (
  <AppLayout title="Edge Pulse / 監視一覧" activeHref="/checks">
    {raw(renderChecksShell(data))}
  </AppLayout>
);

export const renderChecksPage = (data: ChecksPageData): Response =>
  new Response(renderToString(<ChecksDocument data={data} />), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export { renderChecksShell } from "./checks-page.ts";
export type { ChecksPageData };
