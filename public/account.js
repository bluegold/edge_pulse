(() => {
  document.addEventListener("htmx:beforeRequest", (event) => {
    const form = event.detail?.elt;
    if (!form?.matches?.("[data-account-token-delete]")) return;
    const row = form.closest("[id^=account-token-]");
    if (!row) return;
    row.classList.add("account-token-removing");
    const status = row.querySelector("[id$='-status']");
    if (status) status.textContent = "削除中…";
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-target]");
    if (!button) return;
    const target = document.getElementById(button.getAttribute("data-copy-target"));
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.textContent || "");
      button.textContent = "コピーしました";
      setTimeout(() => { button.textContent = "コピー"; }, 1500);
    } catch {
      button.textContent = "コピー失敗";
      setTimeout(() => { button.textContent = "コピー"; }, 1500);
    }
  });
})();
