import { MetadataRoute } from "next"
import { siteConfig } from "@/lib/site-config"
import { getAllPosts } from "@/lib/blog"

export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteConfig.url || "https://ftthtools.my.id"

  // Base static routes
  const staticRoutes = ["", "/blog", "/docs", "/pricing", "/about", "/privacy", "/terms"]
  const staticEntries = staticRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: (route === "" || route === "/blog" ? "daily" : "weekly") as "daily" | "weekly",
    priority: route === "" ? 1.0 : route === "/blog" ? 0.9 : 0.7,
  }))

  // Dynamic blog routes from markdown content
  const posts = getAllPosts()
  const blogEntries = posts.map((post) => {
    // Try parsing date safely, default to current date if invalid
    let postDate = new Date()
    if (post.date) {
      const parsed = Date.parse(post.date)
      if (!isNaN(parsed)) {
        postDate = new Date(parsed)
      }
    }

    return {
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: postDate,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }
  })

  return [...staticEntries, ...blogEntries]
}
