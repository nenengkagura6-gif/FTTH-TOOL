import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { marked } from "marked"

const basePostsDirectory = path.join(process.cwd(), "content/blog")

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  category: string
  readTime: string
  date: string
  featured?: boolean
  contentHtml?: string
  image?: string
  cta?: string
}

export function getAllPosts(locale: string = "en"): BlogPost[] {
  const postsDirectory = path.join(basePostsDirectory, locale)
  
  // Check if directory exists
  if (!fs.existsSync(postsDirectory)) {
    return []
  }

  const fileNames = fs.readdirSync(postsDirectory)
  const allPostsData = fileNames
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => {
      const slug = fileName.replace(/\.md$/, "")
      const fullPath = path.join(postsDirectory, fileName)
      const fileContents = fs.readFileSync(fullPath, "utf8")

      // Use gray-matter to parse the post metadata section
      const { data } = matter(fileContents)

      return {
        slug,
        title: data.title || "Untitled",
        excerpt: data.excerpt || "",
        category: data.category || "General",
        readTime: data.readTime || "5 min",
        date: data.date || "",
        featured: !!data.featured,
        image: data.image || null,
        cta: data.cta || null,
      } as BlogPost
    })

  // Sort posts by date descending
  return allPostsData.sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })
}

export async function getPostBySlug(slug: string, locale: string = "en"): Promise<BlogPost | null> {
  try {
    const postsDirectory = path.join(basePostsDirectory, locale)
    const fullPath = path.join(postsDirectory, `${slug}.md`)
    if (!fs.existsSync(fullPath)) {
      return null
    }

    const fileContents = fs.readFileSync(fullPath, "utf8")

    // Use gray-matter to parse the post metadata section and content
    const { data, content } = matter(fileContents)

    // Convert markdown to HTML string
    const contentHtml = await marked(content)

    return {
      slug,
      title: data.title || "Untitled",
      excerpt: data.excerpt || "",
      category: data.category || "General",
      readTime: data.readTime || "5 min",
      date: data.date || "",
      featured: !!data.featured,
      image: data.image || null,
      cta: data.cta || null,
      contentHtml,
    }
  } catch (error) {
    console.error(`Error parsing blog post with slug ${slug} and locale ${locale}:`, error)
    return null
  }
}

