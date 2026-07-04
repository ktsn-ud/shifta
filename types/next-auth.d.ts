import type { DefaultSession } from "next-auth";

type SessionDateValue = string | Date | null;

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id?: string;
      emailVerified?: SessionDateValue;
      calendarId?: string | null;
      googleTokenExpiresAt?: SessionDateValue;
      createdAt?: string | Date | null;
      updatedAt?: string | Date | null;
    };
  }
}
