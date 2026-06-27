"use server";

import { auth, signOut } from "@/lib/auth";

export async function signOutAction() {
  const session = await auth();
  if (!session?.user) {
    return;
  }

  await signOut({ redirectTo: "/login" });
}
