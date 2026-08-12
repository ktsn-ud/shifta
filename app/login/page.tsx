import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogIn } from "@/components/auth/login-button";
import { auth } from "@/lib/auth";
import { GOOGLE_TOKEN_EXPIRED_REASON } from "@/lib/google-calendar/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "ログイン",
};

type LoginPageSearchParams = {
  reason?: string;
};

type LoginPageProps = {
  searchParams?: LoginPageSearchParams | Promise<LoginPageSearchParams>;
};

export default function Page({ searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<LoginCard isTokenExpiredReason={false} />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

export async function LoginContent({ searchParams }: LoginPageProps) {
  const session = await auth();

  if (session) {
    redirect("/my");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const reason = resolvedSearchParams?.reason;
  const isTokenExpiredReason = reason === GOOGLE_TOKEN_EXPIRED_REASON;

  return <LoginCard isTokenExpiredReason={isTokenExpiredReason} />;
}

function LoginCard({
  isTokenExpiredReason,
}: {
  isTokenExpiredReason: boolean;
}) {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-muted/35 to-muted/60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-primary/15 blur-3xl"
      />
      <div className="relative grid w-full max-w-5xl gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/80 bg-card/95 shadow-sm backdrop-blur-sm">
          <CardHeader className="gap-3 pb-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Shift & Payroll Hub
            </p>
            <CardTitle className="text-3xl font-semibold">
              {isTokenExpiredReason
                ? "Google 連携の再ログインが必要です"
                : "Shifta へようこそ"}
            </CardTitle>
            <CardDescription className="text-sm leading-6">
              {isTokenExpiredReason
                ? "Google Calendar と再同期するため、連携済みの Google アカウントで再ログインしてください。"
                : "ログインすると、日々のシフト登録から給与確認まで一つの画面で管理できます。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pb-5">
            <p className="text-sm leading-6 text-muted-foreground">
              カレンダーと連携する Google アカウントでサインインしてください。
            </p>
            {!isTokenExpiredReason ? (
              <p className="text-sm leading-6 text-muted-foreground">
                初回は Google Calendar の初期設定があります。
              </p>
            ) : null}
            {isTokenExpiredReason ? (
              <p className="rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
                連携トークンの期限切れにより、再認証が必要です。
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="border-t border-border/70 pt-5">
            <LogIn
              label={isTokenExpiredReason ? "Google で再ログイン" : undefined}
            />
          </CardFooter>
        </Card>

        <Card className="border-border/80 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              ログイン後にできること
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>・月間カレンダーでシフトをすばやく登録・編集</p>
            <p>・勤務先ごとの給与ルールに基づく概算計算</p>
            <p>・給与サマリーと給与詳細で根拠を確認</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
