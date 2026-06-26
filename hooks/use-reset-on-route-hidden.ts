"use client";

import { useCallback, useEffectEvent, useLayoutEffect, useState } from "react";

export function useResetOnRouteHidden(reset: () => void): {
  markForResetOnRouteHidden: () => void;
} {
  const [shouldResetOnRouteHidden, setShouldResetOnRouteHidden] =
    useState(false);
  const runReset = useEffectEvent(reset);

  useLayoutEffect(() => {
    return () => {
      if (!shouldResetOnRouteHidden) {
        return;
      }

      runReset();
    };
  }, [shouldResetOnRouteHidden]);

  const markForResetOnRouteHidden = useCallback(() => {
    setShouldResetOnRouteHidden(true);
  }, []);

  return {
    markForResetOnRouteHidden,
  };
}
