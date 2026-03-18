import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function LogIn() {
  return (
    <form
      className="w-full"
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/my" });
      }}
    >
      <Button type="submit" variant="outline" size="lg" className="w-full">
        <svg
          data-icon="inline-start"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <path
            fill="#EA4335"
            d="M24 9.5c3.15 0 6 1.12 8.24 3.3l6.16-6.16C34.65 3.2 29.62 1 24 1 14.63 1 6.57 6.4 2.6 14.26l7.17 5.56C11.72 13.32 17.39 9.5 24 9.5Z"
          />
          <path
            fill="#4285F4"
            d="M46.5 24.5c0-1.56-.14-2.72-.44-3.94H24v7.47h12.95c-.25 1.85-1.58 4.64-4.53 6.51l6.99 5.41C43.58 36.1 46.5 30.86 46.5 24.5Z"
          />
          <path
            fill="#FBBC05"
            d="M9.77 28.18A14.6 14.6 0 0 1 9 23.5c0-1.6.28-3.15.77-4.68L2.6 13.26A23.17 23.17 0 0 0 1 23.5c0 3.67.88 7.14 2.44 10.24l6.33-5.56Z"
          />
          <path
            fill="#34A853"
            d="M24 47c6.48 0 11.92-2.13 15.89-5.79l-6.99-5.41c-1.88 1.31-4.4 2.23-8.9 2.23-6.6 0-12.27-3.82-14.23-10.32L2.6 33.26C6.57 41.1 14.63 47 24 47Z"
          />
        </svg>
        Google でログイン
      </Button>
    </form>
  );
}
