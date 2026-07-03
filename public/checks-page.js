(() => {
  let pendingRow = null;

  const getControls = () => ({
    toggle: document.getElementById("checks-create-toggle"),
    panel: document.getElementById("checks-create-form-wrap"),
    close: document.getElementById("checks-create-close"),
  });

  const rememberRowPosition = (target) => {
    if (!(target instanceof Element)) return;
    const row = target.closest('tr[id^="check-item-"]');
    if (!row) return;

    if (!target.closest("[id^='check-item-']")) return;

    const rect = row.getBoundingClientRect();
    pendingRow = {
      id: row.id,
      top: rect.top,
    };
  };

  const restoreRowPosition = () => {
    if (!pendingRow) return;
    const row = document.getElementById(pendingRow.id);
    if (!row) {
      pendingRow = null;
      return;
    }

    requestAnimationFrame(() => {
      const nextTop = row.getBoundingClientRect().top;
      const delta = nextTop - pendingRow.top;
      if (delta !== 0) {
        window.scrollBy({ top: delta, left: 0 });
      }
      pendingRow = null;
    });
  };

  const resetScrollTop = () => {
    if (pendingRow) return;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const syncState = () => {
    const { toggle, panel } = getControls();
    if (!toggle || !panel) return;
    toggle.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
  };

  const openPanel = () => {
    const { panel, toggle } = getControls();
    if (!panel || !toggle) return;
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };

  const closePanel = () => {
    const { panel, toggle } = getControls();
    if (!panel || !toggle) return;
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    rememberRowPosition(target);

    if (target.closest("#checks-create-toggle")) {
      event.preventDefault();
      const { panel } = getControls();
      if (!panel) return;
      panel.hidden ? openPanel() : closePanel();
      return;
    }

    if (target.closest("#checks-create-close")) {
      event.preventDefault();
      closePanel();
    }
  });

  document.addEventListener("htmx:afterSwap", syncState);
  document.addEventListener("htmx:beforeSwap", resetScrollTop);
  document.addEventListener("htmx:afterSwap", restoreRowPosition);
  syncState();
})();
