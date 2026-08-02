import type { AuthenticatedUser } from "./types";

export const isSuperadmin = (user: AuthenticatedUser): boolean => user.role === "superadmin";

export const visibleGroupIds = (user: AuthenticatedUser): number[] | null => {
  return isSuperadmin(user) ? null : user.groupIds;
};

export const canAccessGroup = (user: AuthenticatedUser, groupId: number): boolean => {
  return isSuperadmin(user) || user.groupIds.includes(groupId);
};
