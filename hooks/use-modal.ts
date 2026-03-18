"use client";

import { useCallback, useState } from "react";

export function useModal(defaultOpen = false) {
  const [open, setOpen] = useState(defaultOpen);

  const openModal = useCallback(() => {
    setOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  const toggleModal = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  return {
    open,
    setOpen,
    openModal,
    closeModal,
    toggleModal,
  };
}
