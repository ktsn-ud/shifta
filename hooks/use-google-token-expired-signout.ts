"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSignOutScheduled, setIsSignOutScheduled] = useState(false);

  const scheduleSignOut = useCallback((): boolean => {
    if (timeoutRef.current) {
      return false;
    }

    setIsSignOutScheduled(true);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      void runGoogleTokenExpiredSignOut();
    }, GOOGLE_TOKEN_EXPIRED_SIGNOUT_DELAY_MS);

    return true;
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return {
    isSignOutScheduled,
    scheduleSignOut,
  };
}
