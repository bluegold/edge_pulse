import { DurableObject } from "cloudflare:workers";
import type { GroupUpdatedEvent } from "../realtime/events";

export class GroupDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const userId = request.headers.get("X-Edge-Pulse-User-Id");
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [`user:${userId}`]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async publish(event: GroupUpdatedEvent): Promise<void> {
    const message = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch (error) {
        console.warn(JSON.stringify({ message: "group event publish failed", error: String(error) }));
      }
    }
  }

  webSocketMessage(): void {
    // Initial WebSocket support is receive-only for clients.
  }
}
