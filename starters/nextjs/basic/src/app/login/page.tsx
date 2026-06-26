import { redirect } from "next/navigation";

/** Auth disabled — old bookmarks still hit /login. */
export default function LoginPage() {
  redirect("/");
}
