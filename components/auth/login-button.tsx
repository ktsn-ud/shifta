import { signIn } from "@/lib/auth";

export function LogIn() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/my" });
      }}
    >
      <button type="submit">Log in</button>
    </form>
  );
}
