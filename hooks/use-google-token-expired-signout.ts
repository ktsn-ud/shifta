"use client";

import { useCallback, useEffect, useState } from "react";
import { GOOGLE_TOKEN_EXPIRED_LOGIN_PATH } from "@/lib/google-calendar/constants";

export const GOOGLE_TOKEN_EXPIRED_SIGNOUT_DELAY_MS = 3000;

async function runGoogleTokenExpiredSignOut(): Promise<void> {
  try {
    const { signOut } = await import("next-auth/react");
    await signOut({ redirectTo: GOOGLE_TOKEN_EXPIRED_LOGIN_PATH });
  } catch {
    window.location.assign(GOOGLE_TOKEN_EXPIRED_LOGIN_PATH);
  }
}

export function useGoogleTokenExpiredSignOut(): {
  isSignOutScheduled: boolean;
  scheduleSignOut: () => boolean;
} {
  const [isSignOutScheduled, setIsSignOutScheduled] = useState(false);

  const scheduleSignOut = useCallback((): boolean => {
    if (isSignOutScheduled) {
      return false;
    }

    setIsSignOutScheduled(true);
    return true;
  }, [isSignOutScheduled]);

  useEffect(() => {
    if (!isSignOutScheduled) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsSignOutScheduled(false);
      void runGoogleTokenExpiredSignOut();
    }, GOOGLE_TOKEN_EXPIRED_SIGNOUT_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isSignOutScheduled]);

  return {
    isSignOutScheduled,
    scheduleSignOut,
  };
}
