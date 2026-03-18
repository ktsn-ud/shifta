import type { Metadata } from "next";
import { LogIn } from "@/components/auth/login-button";
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

export default function Page() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Shifta へようこそ</CardTitle>
          <CardDescription>
            ログインすると、シフト登録と給与の確認を始められます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            カレンダーと連携する Google アカウントでサインインしてください。
          </p>
        </CardContent>
        <CardFooter>
          <LogIn />
        </CardFooter>
      </Card>
    </main>
  );
}
