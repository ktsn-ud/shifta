import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { GOOGLE_CALENDAR_OAUTH_SCOPES } from "@/lib/google-calendar/constants";
import { measureAuthTiming, withAuthTiming } from "@/lib/perf/auth-timing";
import { prisma } from "@/lib/prisma";
import { encryptOAuthToken } from "@/lib/security/oauth-token-crypto";

type SessionCallbackUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: Date | null;
  calendarId?: string | null;
  googleTokenExpiresAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

const adapter = PrismaAdapter(prisma);
const baseLinkAccount = adapter.linkAccount;
const baseGetSessionAndUser = adapter.getSessionAndUser;

if (!baseLinkAccount) {
  throw new Error("Prisma adapter linkAccount is not available");
}

adapter.linkAccount = (async (
  account: Parameters<NonNullable<typeof baseLinkAccount>>[0],
) => {
  if (account.provider !== "google") {
    return baseLinkAccount(account);
  }

  try {
    return await baseLinkAccount({
      ...account,
      access_token:
        encryptOAuthToken(account.access_token ?? null) ?? undefined,
      refresh_token:
        encryptOAuthToken(account.refresh_token ?? null) ?? undefined,
      id_token: encryptOAuthToken(account.id_token ?? null) ?? undefined,
    });
  } catch (error) {
    console.error(
      "Failed to encrypt oauth token on initial account link",
      error,
    );
    return baseLinkAccount(account);
  }
}) as NonNullable<typeof adapter.linkAccount>;

if (baseGetSessionAndUser) {
  // Mirror the Prisma adapter's session lookup so we can split DB read time
  // from the lightweight response assembly without changing auth behavior.
  adapter.getSessionAndUser = (async (sessionToken) =>
    measureAuthTiming("sessionResolve", async () => {
      const userAndSession = await measureAuthTiming(
        "sessionResolve:dbRead",
        () =>
          prisma.session.findUnique({
            where: { sessionToken },
            include: { user: true },
          }),
      );

      return measureAuthTiming("sessionResolve:assemble", () => {
        if (!userAndSession) {
          return null;
        }

        const { user, ...session } = userAndSession;
        return { user, session };
      });
    })) as typeof adapter.getSessionAndUser;
}
const nextAuthResult = NextAuth({
  adapter,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          scope: `openid email profile ${GOOGLE_CALENDAR_OAUTH_SCOPES.join(" ")}`,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  trustHost: true,
  callbacks: {
    signIn: async ({ user, account }) => {
      if (account?.provider !== "google" || !user.email) {
        return true;
      }

      try {
        if (account.providerAccountId) {
          const accountUpdateData: {
            scope?: string | null;
            access_token?: string | null;
            refresh_token?: string | null;
            id_token?: string | null;
            expires_at?: number | null;
          } = {};

          if (account.scope !== undefined) {
            accountUpdateData.scope = account.scope ?? null;
          }
          if (account.access_token !== undefined) {
            accountUpdateData.access_token = encryptOAuthToken(
              account.access_token ?? null,
            );
          }
          if (account.refresh_token !== undefined) {
            accountUpdateData.refresh_token = encryptOAuthToken(
              account.refresh_token ?? null,
            );
          }
          accountUpdateData.id_token = encryptOAuthToken(
            account.id_token ?? null,
          );
          if (account.expires_at !== undefined) {
            accountUpdateData.expires_at = account.expires_at ?? null;
          }

          if (Object.keys(accountUpdateData).length > 0) {
            await prisma.account.updateMany({
              where: {
                provider: "google",
                providerAccountId: account.providerAccountId,
              },
              data: accountUpdateData,
            });
          }
        }

        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true },
        });

        if (!existingUser) {
          return true;
        }

        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            googleTokenExpiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
          },
        });
      } catch (error) {
        console.error("Failed to persist google token expiry", error);
      }

      return true;
    },
    authorized: async ({ auth, request }) => {
      const isLoggedIn = !!auth;
      const pathname = request.nextUrl.pathname;
      const isLoginPage = pathname === "/login";

      if (isLoggedIn && isLoginPage) {
        return Response.redirect(new URL("/my", request.url)); // Redirect to home page
      }

      if (!isLoggedIn && !isLoginPage) {
        return Response.redirect(new URL("/login", request.url)); // Redirect to login page
      }

      return true; // Allow access to the requested page
    },
    session: async ({ session, user }) => {
      return measureAuthTiming("userHydrate", async () => {
        const sessionUser = user as SessionCallbackUser;

        session.user = {
          ...session.user,
          id: sessionUser.id,
          email: sessionUser.email,
          name: sessionUser.name ?? null,
          image: sessionUser.image ?? null,
          emailVerified: sessionUser.emailVerified ?? null,
          calendarId: sessionUser.calendarId ?? null,
          googleTokenExpiresAt: sessionUser.googleTokenExpiresAt ?? null,
          createdAt: sessionUser.createdAt,
          updatedAt: sessionUser.updatedAt,
        };

        return session;
      });
    },
  },
  pages: {
    signIn: "/login",
  },
});

const rawAuth = nextAuthResult.auth;
const rawAuthUntyped = rawAuth as (...args: unknown[]) => unknown;

export const handlers = nextAuthResult.handlers;
export const signIn = nextAuthResult.signIn;
export const signOut = nextAuthResult.signOut;
export const auth: typeof rawAuth = ((...args: unknown[]) => {
  if (args.length > 0) {
    return rawAuthUntyped(...args);
  }

  return withAuthTiming("auth", async () => rawAuth());
}) as typeof rawAuth;
