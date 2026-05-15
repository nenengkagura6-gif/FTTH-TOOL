import type { Metadata } from "next"
import { SignInPage } from "@/components/ui/sign-in-flow-1"

export const metadata: Metadata = {
  title: "Login — FTTH Tool",
  description: "Sign in to your FTTH Tool account.",
}

export default function LoginPage() {
  return <SignInPage mode="signin" onSuccessHref="/dashboard" />
}
