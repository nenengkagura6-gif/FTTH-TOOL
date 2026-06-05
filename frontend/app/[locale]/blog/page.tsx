import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { getAllPosts } from "@/lib/blog"
import { BlogListClient } from "./blog-list-client"
import { translations } from "@/lib/translations"

interface PageProps {
  params: Promise<{
    locale: string
  }>
}

export default async function BlogPage({ params }: PageProps) {
  const { locale } = await params
  const posts = getAllPosts(locale)
  const t = translations[locale as "en" | "id"] || translations.en

  return (
    <>
      <SiteNavbar locale={locale} />
      <main className="relative">
        <PageHeader
          eyebrow="Blog"
          title={t.blog.title}
          description={t.blog.subtitle}
        />
        <BlogListClient posts={posts} locale={locale} />
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
