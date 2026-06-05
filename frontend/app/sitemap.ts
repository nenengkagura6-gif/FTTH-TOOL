import { MetadataRoute } from "next"
import { siteConfig } from "@/lib/site-config"
import { getAllPosts } from "@/lib/blog"

export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteConfig.url || "https://ftthtools.my.id"
  const locales = ["en", "id"]

  // 1. Localized static routes
  const staticRoutes = ["", "/blog", "/docs", "/pricing", "/about", "/privacy", "/terms"]
  const staticEntries: MetadataRoute.Sitemap = []

  for (const locale of locales) {
    for (const route of staticRoutes) {
      const path = route === "" ? `/${locale}` : `/${locale}${route}`
      staticEntries.push({
        url: `${baseUrl}${path}`,
        lastModified: new Date(),
        changeFrequency: (route === "" || route === "/blog" ? "daily" : "weekly") as "daily" | "weekly",
        priority: route === "" ? 1.0 : route === "/blog" ? 0.9 : 0.7,
      })
    }
  }

  // 2. Localized dynamic blog routes from markdown content
  const blogEntries: MetadataRoute.Sitemap = []

  for (const locale of locales) {
    const posts = getAllPosts(locale)
    for (const post of posts) {
      // Try parsing date safely, default to current date if invalid
      let postDate = new Date()
      if (post.date) {
        const parsed = Date.parse(post.date)
        if (!isNaN(parsed)) {
          postDate = new Date(parsed)
        }
      }

      blogEntries.push({
        url: `${baseUrl}/${locale}/blog/${post.slug}`,
        lastModified: postDate,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      })
    }
  }

  return [...staticEntries, ...blogEntries]
}
