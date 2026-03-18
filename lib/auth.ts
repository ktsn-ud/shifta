import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  CALENDAR_SETUP_PATH,
  CALENDAR_SETUP_SKIP_COOKIE,
  GOOGLE_CALENDAR_SCOPE,
} from "@/lib/google-calendar/constants";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          scope: `openid email profile ${GOOGLE_CALENDAR_SCOPE}`,
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
