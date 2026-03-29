export type JwtPayload = {
  sub: string;
  email: string;
  role: 'user' | 'moderator' | 'admin';
  /** Auth session id (refresh device); omitted on legacy tokens. */
  sid?: string;
};
