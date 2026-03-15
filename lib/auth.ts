import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  trustHost: true,
  callbacks: {
    authorized: async ({ auth, request }) => {
      const isLoggedIn = !!auth;
      const isLoginPage = request.nextUrl.pathname === "/login";

      if (!isLoggedIn && !isLoginPage) {
        return false; // Redirect to login page
      }

      return true; // Allow access to the requested page
    },
  },
  pages: {
    signIn: "/login",
  },
});
