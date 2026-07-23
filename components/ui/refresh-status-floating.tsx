import { Spinner } from "@/components/ui/spinner";

function RefreshStatusFloating() {
  return (
    <aside
      aria-label="更新中"
      className="pointer-events-none fixed bottom-4 right-4 z-20 rounded-md border border-border/80 bg-card/95 px-3 py-2 shadow-lg backdrop-blur sm:bottom-6 sm:right-6"
    >
      <Spinner label="更新中" />
    </aside>
  );
}

export { RefreshStatusFloating };
