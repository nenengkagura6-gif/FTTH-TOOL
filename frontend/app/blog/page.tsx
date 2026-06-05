import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { getAllPosts } from "@/lib/blog"
import { BlogListClient } from "./blog-list-client"

export const metadata = {
  title: "Blog - Field notes from FTTH engineers",
  description: "Tutorials, case studies, and tooling deep-dives for fiber engineering teams.",
}

export default function BlogPage() {
  const posts = getAllPosts()

  return (
    <>
      <SiteNavbar />
      <main className="relative">
        <PageHeader
          eyebrow="Blog"
          title="Field notes from FTTH engineers"
          description="Tutorials, case studies, and tooling deep-dives for fiber engineering teams."
        />
        <BlogListClient posts={posts} />
      </main>
      <SiteFooter />
    </>
  )
}
