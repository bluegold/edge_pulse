(() => {
  const STORAGE_KEY = "edge-pulse:auto-reload";
  const INTERVAL_MS = 30_000;

  let active = false;
  let deadline = 0;
  let timerId = null;
  let fetching = false;

  const readState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      active = Boolean(parsed.active);
      deadline = typeof parsed.deadline === "number" ? parsed.deadline : Number(parsed.deadline || 0);
    } catch {
      active = false;
      deadline = 0;
    }
  };

  const writeState = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ active, deadline }));
    } catch {
      // ignore storage errors
    }
  };

  const controls = () => ({
    toggle: document.getElementById("dashboard-auto-reload-toggle"),
    idle: document.getElementById("dashboard-auto-reload-idle"),
    active: document.getElementById("dashboard-auto-reload-active"),
    ring: document.getElementById("dashboard-auto-reload-ring"),
  });

  const hasControls = () => Boolean(controls().toggle);
  const isHtmxRequestInFlight = () => Boolean(document.querySelector(".htmx-request"));

  const formatLocalDateTime = (date) => {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  const formatLocalDateTimeWithoutSeconds = (date) => {
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  const renderLocalTimes = (root = document) => {
    for (const element of root.querySelectorAll("[data-utc-time]")) {
      const iso = element.getAttribute("data-utc-time");
      if (!iso) continue;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) continue;
      const withSeconds = element.getAttribute("data-utc-seconds") !== "false";
      element.textContent = withSeconds ? formatLocalDateTime(date) : formatLocalDateTimeWithoutSeconds(date);
      element.title = iso;
      element.setAttribute("data-localized", "true");
    }
  };

  const render = () => {
    const { toggle, idle, active: activePane, ring } = controls();
    if (!toggle || !idle || !activePane || !ring) return;

    const now = Date.now();
    const remaining = active ? Math.max(0, deadline - now) : 0;
    const progress = active ? Math.min(100, Math.max(0, ((INTERVAL_MS - remaining) / INTERVAL_MS) * 100)) : 0;
    const seconds = Math.ceil(remaining / 1000);

    idle.classList.toggle("hidden", active);
    activePane.classList.toggle("hidden", !active);
    ring.style.setProperty("--auto-progress", String(progress));
    ring.setAttribute("aria-hidden", "true");
    const center = ring.querySelector("[data-role='center']");
    if (center) {
      center.replaceChildren(document.createTextNode(String(seconds) + "s"));
    }
    toggle.setAttribute("aria-pressed", active ? "true" : "false");
    toggle.setAttribute("data-active", active ? "true" : "false");
  };

  const stopTimer = (persist = true) => {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    if (persist) {
      active = false;
      deadline = 0;
      writeState();
    }
    render();
  };

  const startTimer = (deadlineOverride = null) => {
    active = true;
    deadline = typeof deadlineOverride === "number" ? deadlineOverride : Date.now() + INTERVAL_MS;
    writeState();
    render();
    if (timerId === null) {
      timerId = setInterval(tick, 250);
    }
  };

  const refreshContent = async () => {
    if (fetching || !hasControls()) return;
    fetching = true;
    const scrollY = window.scrollY;
    try {
      const response = await fetch(window.location.pathname + window.location.search, {
        headers: { "HX-Request": "true" },
      });
      if (!response.ok) throw new Error("auto reload failed: " + String(response.status));

      const html = await response.text();
      const template = document.createElement("template");
      template.innerHTML = html.trim();
      const nextContent = template.content.querySelector("#content");
      const currentContent = document.getElementById("content");
      if (nextContent && currentContent) {
        renderLocalTimes(nextContent);
        currentContent.replaceWith(nextContent);
        window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
      }
    } catch (error) {
      console.error("[edge-pulse:auto-reload]", error);
    } finally {
      fetching = false;
      if (active && hasControls()) {
        startTimer();
      } else {
        stopTimer(false);
      }
    }
  };

  const tick = () => {
    if (!hasControls()) {
      stopTimer(false);
      return;
    }

    if (!active) {
      render();
      return;
    }

    if (isHtmxRequestInFlight()) {
      render();
      return;
    }

    const remaining = deadline - Date.now();
    render();
    if (remaining <= 0 && !fetching) {
      void refreshContent();
    }
  };

  const sync = () => {
    if (!hasControls()) {
      stopTimer(false);
      return;
    }

    if (active && deadline <= Date.now()) {
      deadline = Date.now() + INTERVAL_MS;
      writeState();
    }

    if (active && timerId === null) {
      timerId = setInterval(tick, 250);
    }

    render();
    renderLocalTimes();
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("#dashboard-auto-reload-toggle");
    if (!button) return;
    event.preventDefault();

    if (active) {
      stopTimer();
      return;
    }

    startTimer();
  });

  document.addEventListener("htmx:afterSwap", () => {
    sync();
    renderLocalTimes();
  });

  readState();
  renderLocalTimes();
  sync();
})();
