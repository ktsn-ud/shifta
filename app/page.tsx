import { redirect } from "next/navigation";

// This redirect-only segment cannot render NEXT_REDIRECT, so opt out of instant validation to preserve the 307 redirect.
export const instant = false;

export default function Home() {
  redirect("/my");
}
