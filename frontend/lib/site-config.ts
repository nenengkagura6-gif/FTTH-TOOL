import {
  LayoutDashboard,
  Map,
  Database,
  ShieldCheck,
  History,
  BarChart3,
  Shield,
  Key,
  type LucideIcon,
} from "lucide-react"
import type { FeatureKey } from "@/lib/features"

export const siteConfig = {
  name: "FTTH Tool",
  shortName: "FTTH",
  description:
    "Modern FTTH and telecom engineering automation platform. Automate KML, database, and document workflows in seconds.",
  url: "https://ftthtools.my.id",
  org: "Nusa Hytoria",
}

export const mainNavItems = [
  { label: "Home", href: "/" },
  { label: "Tools", href: "/#tools" },
  { label: "Blog", href: "/blog" },
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
]

export type DashboardMenuItem = {
  title: string
  href: string
  icon: LucideIcon
  description?: string
  /** Feature key for plan gating (if undefined, always accessible) */
  featureKey?: FeatureKey
  /** Only show to admins */
  adminOnly?: boolean
}

export const dashboardMenu: DashboardMenuItem[] = [
  {
    title: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Dashboard overview",
  },
  {
    title: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    description: "Usage statistics",
  },
  {
    title: "History",
    href: "/dashboard/history",
    icon: History,
    description: "Processing history",
  },
  {
    title: "API Keys",
    href: "/dashboard/api-keys",
    icon: Key,
    description: "Manage API access",
  },
  {
    title: "KML to BOQ",
    href: "/dashboard/kml-boq",
    icon: Map,
    description: "Convert KML files to Bill of Quantities",
    featureKey: "kml_to_boq",
  },
  {
    title: "KML to Database HP",
    href: "/dashboard/kml-database-hp",
    icon: Database,
    description: "Build HP database from KML data",
    featureKey: "kml_to_database",
  },
  {
    title: "KML Duplicate Checker",
    href: "/dashboard/kml-checker",
    icon: ShieldCheck,
    description: "Detect duplicate HP and pole points",
    featureKey: "kml_duplicate_checker",
  },
  {
    title: "Admin Panel",
    href: "/admin",
    icon: Shield,
    description: "System administration",
    adminOnly: true,
  },
]

export const footerLinks = {
  product: [
    { label: "Tools", href: "/#tools" },
    { label: "Pricing", href: "/pricing" },
    { label: "Documentation", href: "/docs" },
    { label: "Blog", href: "/blog" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/about#contact" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
  ],
}
