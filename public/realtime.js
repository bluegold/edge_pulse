(() => {
  let sockets = [];
  let reconnectTimer = null;
  let refreshTimer = null;
  let refreshing = false;
  let connectionGeneration = 0;

  const getDashboard = () => document.getElementById("dashboard-shell");

  const formatLocalDateTime = (date, withSeconds) => {
    const values = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
    ];
    if (withSeconds) values.push(String(date.getSeconds()).padStart(2, "0"));
    return withSeconds
      ? `${values[0]}-${values[1]}-${values[2]} ${values[3]}:${values[4]}:${values[5]}`
      : `${values[0]}-${values[1]}-${values[2]} ${values[3]}:${values[4]}`;
  };

  const renderLocalTimes = (root = document) => {
    for (const element of root.querySelectorAll("[data-utc-time]")) {
      const iso = element.getAttribute("data-utc-time");
      if (!iso) continue;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) continue;
      const withSeconds = element.getAttribute("data-utc-seconds") !== "false";
      element.textContent = formatLocalDateTime(date, withSeconds);
      element.title = iso;
      element.setAttribute("data-localized", "true");
    }
  };

  const setStatus = (text) => {
    const status = document.getElementById("dashboard-realtime-status");
    if (status) status.textContent = text;
  };

  const closeSockets = () => {
    for (const socket of sockets) socket.close();
    sockets = [];
  };

  const refreshContent = async () => {
    if (refreshing || !getDashboard()) return;
    refreshing = true;
    const scrollY = window.scrollY;
    try {
      const response = await fetch(window.location.pathname + window.location.search, {
        headers: { "HX-Request": "true" },
      });
      if (!response.ok) throw new Error("realtime refresh failed: " + String(response.status));

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
      console.error("[edge-pulse:realtime]", error);
    } finally {
      refreshing = false;
      connect();
    }
  };

  const scheduleRefresh = () => {
    if (refreshTimer !== null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshContent();
    }, 200);
  };

  const connect = () => {
    const generation = ++connectionGeneration;
    const dashboard = getDashboard();
    if (!dashboard) {
      closeSockets();
      return;
    }

    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    closeSockets();
    const ids = (dashboard.getAttribute("data-realtime-group-ids") || "")
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    if (ids.length === 0) {
      setStatus("リアルタイム対象なし");
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    sockets = ids.map((groupId) => {
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/groups/${groupId}`);
      socket.addEventListener("open", () => setStatus("リアルタイム接続中"));
      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === "group.updated") scheduleRefresh();
        } catch {
          // Ignore malformed events and keep the connection alive.
        }
      });
      socket.addEventListener("close", () => {
        if (generation !== connectionGeneration) return;
        setStatus("リアルタイム再接続待ち");
        if (reconnectTimer === null) reconnectTimer = setTimeout(connect, 5000);
      });
      socket.addEventListener("error", () => setStatus("リアルタイム再接続待ち"));
      return socket;
    });
  };

  document.addEventListener("htmx:afterSwap", () => setTimeout(connect, 0));
  renderLocalTimes();
  connect();
})();
