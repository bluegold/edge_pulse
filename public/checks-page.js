(() => {
  const getControls = () => ({
    toggle: document.getElementById("checks-create-toggle"),
    panel: document.getElementById("checks-create-form-wrap"),
    close: document.getElementById("checks-create-close"),
  });

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
  syncState();
})();
