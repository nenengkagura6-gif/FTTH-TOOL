import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Clock, Calendar, ArrowRight, Sparkles, HelpCircle } from "lucide-react"
import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { getPostBySlug, getAllPosts } from "@/lib/blog"

interface PageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateStaticParams() {
  const posts = getAllPosts()
  return posts.map((post) => ({
    slug: post.slug,
  }))
}

export async function generateMetadata({ params }: PageProps) {
  const resolvedParams = await params
  const post = await getPostBySlug(resolvedParams.slug)
  if (!post) {
    return {
      title: "Post Not Found",
    }
  }
  return {
    title: `${post.title} | FTTH Engineer Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
    },
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const resolvedParams = await params
  const post = await getPostBySlug(resolvedParams.slug)

  if (!post) {
    notFound()
  }

  // Get related/recent posts (excluding current post)
  const allPosts = getAllPosts()
  const relatedPosts = allPosts
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2)

  return (
    <>
      <SiteNavbar />
      <main className="relative min-h-screen pt-24 pb-20 overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] pointer-events-none select-none overflow-hidden -z-10 opacity-30">
          <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-[-10%] right-[10%] w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-3xl" />
        </div>

        <div className="mx-auto max-w-5xl px-6">
          {/* Back button */}
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors group cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to articles
          </Link>

          {/* Article Header */}
          <div className="mb-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 ring-1 ring-primary/20 mb-4">
              {post.category}
            </span>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-balance leading-[1.15] mb-6">
              {post.title}
            </h1>
            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground border-y border-white/10 py-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{post.date}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{post.readTime} read</span>
              </div>
            </div>
          </div>

          {/* Article Layout Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12 items-start">
            {/* Main Content Area */}
            <article 
              className="blog-prose w-full"
              dangerouslySetInnerHTML={{ __html: post.contentHtml || "" }}
            />

            {/* Sidebar with CTAs */}
            <aside className="space-y-6 lg:sticky lg:top-28">
              {/* Tool CTA Card */}
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card/60 p-6 backdrop-blur-sm">
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
                
                <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 mb-4">
                  <Sparkles className="h-5 w-5" />
                </div>
                
                <h3 className="text-base font-semibold mb-2">Automate Your KMLs</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Stop counting cables and poles manually. Upload your KML/KMZ design and generate a complete BOQ Excel sheet instantly.
                </p>

                <div className="space-y-2">
                  <Link
                    href="/dashboard/kml-boq"
                    className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/95 transition-all group cursor-pointer"
                  >
                    KML to BOQ Tool
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/dashboard/kml-checker"
                    className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-xs font-medium border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-foreground transition-all group cursor-pointer"
                  >
                    KML Duplicate Checker
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>

              {/* Need help Card */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.01] p-6 text-center">
                <HelpCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <h4 className="text-sm font-medium mb-1">Feedback or Question?</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Have questions about FTTH network mapping or need custom formatting for your BOQ sheets?
                </p>
                <Link
                  href="/about"
                  className="inline-flex text-xs text-primary hover:underline"
                >
                  Contact support team
                </Link>
              </div>
            </aside>
          </div>

          {/* Related Articles Footer */}
          {relatedPosts.length > 0 && (
            <div className="mt-20 pt-10 border-t border-white/10">
              <h2 className="text-xl font-semibold mb-8">Related Articles</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {relatedPosts.map((relatedPost) => (
                  <Link
                    key={relatedPost.slug}
                    href={`/blog/${relatedPost.slug}`}
                    className="group block rounded-2xl border border-white/10 bg-card/30 p-5 hover:border-white/20 transition-all hover:bg-card/50"
                  >
                    <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                      {relatedPost.category}
                    </span>
                    <h3 className="text-base font-semibold group-hover:text-primary transition-colors mt-2 mb-2 line-clamp-1">
                      {relatedPost.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                      {relatedPost.excerpt}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground group-hover:underline">
                      Read article <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
