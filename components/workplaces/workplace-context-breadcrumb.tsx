import Link from "next/link";

type WorkplaceContextBreadcrumbProps = {
  workplaceId: string;
  workplaceName?: string | null;
  currentPage: string;
};

/**
 * Keeps the selected workplace visible inside its nested settings screens.
 * The workplace name and current page remain visible on narrow screens.
 */
export function WorkplaceContextBreadcrumb({
  workplaceId,
  workplaceName,
  currentPage,
}: WorkplaceContextBreadcrumbProps) {
  const workplaceLabel = workplaceName?.trim() || "勤務先を確認中";

  return (
    <nav aria-label="勤務先設定の現在地" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <li className="hidden shrink-0 sm:block">
          <Link href="/my/workplaces" className="hover:text-foreground">
            勤務先一覧
          </Link>
        </li>
        <li className="hidden sm:block" aria-hidden="true">
          &gt;
        </li>
        <li className="min-w-0 shrink">
          <Link
            href={`/my/workplaces/${workplaceId}/edit`}
            className="block truncate font-medium text-foreground hover:underline"
            title={workplaceName ?? undefined}
          >
            {workplaceLabel}
          </Link>
        </li>
        <li className="shrink-0" aria-hidden="true">
          &gt;
        </li>
        <li
          className="shrink-0 font-medium text-foreground"
          aria-current="page"
        >
          {currentPage}
        </li>
      </ol>
    </nav>
  );
}
