import { NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase/client"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")

  if (code) {
    const supabase = getSupabaseClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL("/dashboard", requestUrl.origin))
}