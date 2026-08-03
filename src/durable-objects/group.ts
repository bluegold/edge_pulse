import { DurableObject } from "cloudflare:workers";
import type { GroupUpdatedEvent } from "../realtime/events";

export class GroupDurableObject extends DurableObject<Env> {
  private static readonly PENDING_UPDATE_KEY = "pending-group-update";
  private static readonly BROADCAST_DELAY_MS = 250;

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
    await this.ctx.storage.put(GroupDurableObject.PENDING_UPDATE_KEY, event);
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null) {
      await this.ctx.storage.setAlarm(Date.now() + GroupDurableObject.BROADCAST_DELAY_MS);
    }
  }

  async alarm(): Promise<void> {
    const event = await this.ctx.storage.get<GroupUpdatedEvent>(GroupDurableObject.PENDING_UPDATE_KEY);
    if (!event) return;

    await this.ctx.storage.delete(GroupDurableObject.PENDING_UPDATE_KEY);
    const message = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch (error) {
        console.warn(JSON.stringify({ message: "group event publish failed", error: String(error) }));
      }
    }
  }

  async disconnectUser(userId: number): Promise<void> {
    for (const socket of this.ctx.getWebSockets(`user:${userId}`)) {
      socket.close(4003, "group membership revoked");
    }
  }

  webSocketMessage(): void {
    // Initial WebSocket support is receive-only for clients.
  }
}
