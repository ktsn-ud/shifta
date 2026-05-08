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
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {isTokenExpiredReason
              ? "Google 連携の再ログインが必要です"
              : "Shifta へようこそ"}
          </CardTitle>
          <CardDescription>
            {isTokenExpiredReason
              ? "Google Calendar と同期するため、Google アカウントで再ログインしてください。"
              : "ログインすると、シフト登録と給与の確認を始められます。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            カレンダーと連携する Google アカウントでサインインしてください。
          </p>
        </CardContent>
        <CardFooter>
          <LogIn
            label={isTokenExpiredReason ? "Google で再ログイン" : undefined}
          />
        </CardFooter>
      </Card>
    </main>
  );
}
