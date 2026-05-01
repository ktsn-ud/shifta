"use server";

import { signOut } from "@/lib/auth";
import { GOOGLE_TOKEN_EXPIRED_LOGIN_PATH } from "@/lib/google-calendar/constants";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function signOutForGoogleTokenExpiredAction() {
  await signOut({ redirectTo: GOOGLE_TOKEN_EXPIRED_LOGIN_PATH });
}
