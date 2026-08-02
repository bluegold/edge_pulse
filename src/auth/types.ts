export type AuthenticatedUser = {
  id: number;
  identityProvider: string;
  identitySubject: string;
  displayName: string;
  email: string | null;
  role: "member" | "superadmin";
  groupIds: number[];
};

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: AuthenticatedUser;
  };
};
