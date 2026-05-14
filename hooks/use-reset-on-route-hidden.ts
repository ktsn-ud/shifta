"use client";

import { useLayoutEffect, useRef } from "react";

export function useResetOnRouteHidden(reset: () => void): {
  markForResetOnRouteHidden: () => void;
} {
  const shouldResetRef = useRef(false);
  const resetRef = useRef(reset);

  useLayoutEffect(() => {
    resetRef.current = reset;
  }, [reset]);

  useLayoutEffect(() => {
    return () => {
      if (!shouldResetRef.current) {
        return;
      }

      shouldResetRef.current = false;
      resetRef.current();
    };
  }, []);

  return {
    markForResetOnRouteHidden: () => {
      shouldResetRef.current = true;
    },
  };
}
