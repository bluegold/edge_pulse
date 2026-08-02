export type GroupUpdateReason = "check.updated" | "check.status_changed" | "membership.changed" | "incident.reaction_changed";

export type GroupUpdatedEvent = {
  type: "group.updated";
  eventId: string;
  groupId: number;
  reason: GroupUpdateReason;
  occurredAt: string;
};

export const publishGroupUpdated = async (
  env: Env,
  groupId: number,
  eventId: string,
  reason: GroupUpdateReason,
  occurredAt: string,
): Promise<void> => {
  const stub = env.GROUPS.getByName(`group:${groupId}`) as unknown as { publish(event: GroupUpdatedEvent): Promise<void> };
  await stub.publish({ type: "group.updated", eventId, groupId, reason, occurredAt });
};

export const disconnectGroupUser = async (env: Env, groupId: number, userId: number): Promise<void> => {
  const stub = env.GROUPS.getByName(`group:${groupId}`) as unknown as { disconnectUser(userId: number): Promise<void> };
  await stub.disconnectUser(userId);
};
