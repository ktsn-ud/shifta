import type { Metadata } from "next";
import { Suspense } from "react";
import { LogIn } from "@/components/auth/login-button";
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

async function LoginContent({ searchParams }: LoginPageProps) {
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
        className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-primary/10 blur-3xl"
      />
      <Card className="relative w-full max-w-lg border-border/80 bg-card/95 shadow-sm backdrop-blur-sm">
        <CardHeader className="flex flex-col gap-2 pb-4">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {isTokenExpiredReason
              ? "Google 連携の再ログインが必要です"
              : "Shifta へようこそ"}
          </CardTitle>
          <CardDescription className="text-sm leading-6">
            {isTokenExpiredReason
              ? "Google Calendar と同期するため、Google アカウントで再ログインしてください。"
              : "ログインすると、シフト登録と給与の確認を始められます。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-sm leading-6 text-muted-foreground">
            カレンダーと連携する Google アカウントでサインインしてください。
          </p>
        </CardContent>
        <CardFooter className="border-t border-border/70 pt-5">
          <LogIn
            label={isTokenExpiredReason ? "Google で再ログイン" : undefined}
          />
        </CardFooter>
      </Card>
    </main>
  );
}
