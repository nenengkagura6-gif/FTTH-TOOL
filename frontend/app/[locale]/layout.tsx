import { ReactNode } from "react"

export async function generateStaticParams() {
  return [{ locale: "en" }, { locale: "id" }]
}

interface LocaleLayoutProps {
  children: ReactNode
  params: Promise<{
    locale: string
  }>
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  // We can await params if needed, or just return children.
  const resolvedParams = await params
  
  return <>{children}</>
}
