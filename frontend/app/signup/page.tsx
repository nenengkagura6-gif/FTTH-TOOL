import type { Metadata } from "next"
import { SignInPage } from "@/components/ui/sign-in-flow-1"

export const metadata: Metadata = {
  title: "Sign Up — FTTH Tool",
  description: "Create your FTTH Tool account.",
}

export default function SignupPage() {
  return <SignInPage mode="signup" onSuccessHref="/dashboard" />
}
