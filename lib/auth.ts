import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  CALENDAR_SETUP_PATH,
  CALENDAR_SETUP_SKIP_COOKIE,
  GOOGLE_CALENDAR_OAUTH_SCOPES,
} from "@/lib/google-calendar/constants";
import { prisma } from "@/lib/prisma";
import { encryptOAuthToken } from "@/lib/security/oauth-token-crypto";

const adapter = PrismaAdapter(prisma);
const baseLinkAccount = adapter.linkAccount;

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

export const { handlers, auth, signIn, signOut } = NextAuth({
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

      const isMyRoute = pathname.startsWith("/my");
      if (isLoggedIn && isMyRoute) {
        const isCalendarSetupPage = pathname === CALENDAR_SETUP_PATH;
        const skipSetup =
          request.cookies.get(CALENDAR_SETUP_SKIP_COOKIE)?.value === "1";

        if (!skipSetup) {
          const email = auth?.user?.email;
          if (email) {
            const currentUser = await prisma.user.findUnique({
              where: { email },
              select: { calendarId: true },
            });

            const hasCalendar = Boolean(currentUser?.calendarId);
            if (!hasCalendar && !isCalendarSetupPage) {
              return Response.redirect(
                new URL(CALENDAR_SETUP_PATH, request.url),
              );
            }

            if (hasCalendar && isCalendarSetupPage) {
              return Response.redirect(new URL("/my", request.url));
            }
          }
        }
      }

      return true; // Allow access to the requested page
    },
  },
  pages: {
    signIn: "/login",
  },
});
