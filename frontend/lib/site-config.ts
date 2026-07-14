import {
  LayoutDashboard,
  Map,
  Database,
  ShieldCheck,
  History,
  BarChart3,
  Shield,
  Key,
  FileSpreadsheet,
  Layers,
  Globe,
  DraftingCompass,
  Compass,
  Activity,
  Palette,
  LineChart,
  Scissors,
  FolderSearch,
  MapPin,
  ArrowUpDown,
  Ruler,
  ArrowLeftRight,
  Gauge,
  Wrench,
  GitFork,
  Navigation,
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

// ==============================================
// Tool Category System
// ==============================================

export type ToolCategory = "survey" | "conversion" | "measurement" | "utility"

export interface CategoryConfig {
  id: ToolCategory
  label: { en: string; id: string }
  subtitle: { en: string; id: string }
  accentColor: string
  accentGradient: string
  icon: LucideIcon
}

export const TOOL_CATEGORIES: CategoryConfig[] = [
  {
    id: "survey",
    label: { en: "Drafter", id: "Drafter" },
    subtitle: { en: "Design & Planning", id: "Desain & Perencanaan" },
    accentColor: "violet",
    accentGradient: "from-violet-500 to-blue-500",
    icon: Ruler,
  },
  {
    id: "conversion",
    label: { en: "Format Conversion", id: "Konversi Format" },
    subtitle: { en: "Format Conversion", id: "Konversi Format" },
    accentColor: "cyan",
    accentGradient: "from-cyan-500 to-teal-500",
    icon: ArrowLeftRight,
  },
  {
    id: "measurement",
    label: { en: "Measurement & Testing", id: "Pengukuran & Testing" },
    subtitle: { en: "Measurement & Testing", id: "Pengukuran & Testing" },
    accentColor: "amber",
    accentGradient: "from-amber-500 to-orange-500",
    icon: Gauge,
  },
  {
    id: "utility",
    label: { en: "Utility", id: "Utilitas" },
    subtitle: { en: "Utility", id: "Utilitas" },
    accentColor: "emerald",
    accentGradient: "from-emerald-500 to-green-500",
    icon: Wrench,
  },
]

// ==============================================
// Dashboard Menu Items
// ==============================================

export type DashboardMenuItem = {
  title: string
  href: string
  icon: LucideIcon
  description?: string
  /** Feature key for plan gating (if undefined, always accessible) */
  featureKey?: FeatureKey
  /** Only show to admins */
  adminOnly?: boolean
  /** Tool category for sidebar grouping (undefined = system/nav item) */
  category?: ToolCategory
}

// System / navigation items (no category — shown as flat list above tools)
export const systemMenuItems: DashboardMenuItem[] = [
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
    title: "Admin Panel",
    href: "/admin",
    icon: Shield,
    description: "System administration",
    adminOnly: true,
  },
]

// Tool items (grouped by category)
export const toolMenuItems: DashboardMenuItem[] = [
  // ── Survey & Design (Drafter) ──
  {
    title: "KML to BOQ",
    href: "/dashboard/kml-boq",
    icon: Map,
    description: "Convert KML files to Bill of Quantities",
    featureKey: "kml_to_boq",
    category: "survey",
  },
  {
    title: "KML to Database HP",
    href: "/dashboard/kml-database-hp",
    icon: Database,
    description: "Build HP database from KML data",
    featureKey: "kml_to_database",
    category: "survey",
  },
  {
    title: "KML Extractor",
    href: "/dashboard/kml-extractor",
    icon: FolderSearch,
    description: "Extract elements and summarize counts by folder to Excel",
    featureKey: "kml_extractor",
    category: "survey",
  },
  {
    title: "Pole Auto-Sorter",
    href: "/dashboard/pole-sorter",
    icon: ArrowUpDown,
    description: "Urutkan penomoran tiang (New Pole & Existing Pole) secara otomatis berdasarkan posisi kabel dari FDT",
    featureKey: "kml_to_boq",
    category: "survey",
  },
  {
    title: "Insert Coding KML",
    href: "/dashboard/insert-coding",
    icon: Layers,
    description: "Rename FDT, FAT, Kabel, dan New Pole dalam KML/KMZ secara otomatis",
    featureKey: "kml_to_boq",
    category: "survey",
  },
  {
    title: "KML - APD",
    href: "/dashboard/kml-apd",
    icon: Map,
    description: "Auto-draft KML: generate FAT, cable, sling wire, HP coverage, pole numbering & styles",
    featureKey: "kml_to_boq",
    category: "survey",
  },
  {
    title: "Auto Tagging HP",
    href: "/dashboard/auto-placemark",
    icon: MapPin,
    description: "Generate house placemarks from boundary using OSM building & road data",
    featureKey: "kml_to_boq",
    category: "survey",
  },

  // ── Format Conversion (All Roles) ──
  {
    title: "KML to CSV",
    href: "/dashboard/kml-csv",
    icon: FileSpreadsheet,
    description: "Extract KML Point placemarks to a CSV file",
    category: "conversion",
  },
  {
    title: "KML to Shapefile",
    href: "/dashboard/kml-shp",
    icon: Layers,
    description: "Convert KML/KMZ network layers to ESRI Shapefile",
    category: "conversion",
  },
  {
    title: "Shapefile to KML",
    href: "/dashboard/shp-kml",
    icon: Globe,
    description: "Convert ESRI Shapefile ZIP back to KML/KMZ",
    category: "conversion",
  },
  {
    title: "KML to AutoCAD (DXF)",
    href: "/dashboard/kml-dxf",
    icon: DraftingCompass,
    description: "Convert KML/KMZ vector designs to AutoCAD DXF format",
    category: "conversion",
  },
  {
    title: "AutoCAD (DXF) to KML",
    href: "/dashboard/dxf-kml",
    icon: Compass,
    description: "Convert AutoCAD DXF metric drawings back to KML/KMZ vector data",
    category: "conversion",
  },
  {
    title: "KML Duplicate Checker",
    href: "/dashboard/kml-checker",
    icon: ShieldCheck,
    description: "Detect duplicate HP and pole points",
    featureKey: "kml_duplicate_checker",
    category: "conversion",
  },

  // ── Measurement & Testing (Technician) ──
  {
    title: "OTDR Trace Analyzer",
    href: "/dashboard/otdr-analyzer",
    icon: LineChart,
    description: "Analyze SOR traces and generate reports",
    category: "measurement",
  },
  {
    title: "OTDR Distance-to-Fault",
    href: "/dashboard/otdr-fault-locator",
    icon: MapPin,
    description: "Deteksi lokasi fisik kabel putus pada peta berdasarkan jarak OTDR",
    category: "measurement",
  },
  {
    title: "OPM Link Budget",
    href: "/dashboard/opm-calculator",
    icon: Activity,
    description: "Calculate fiber path link loss and power budget",
    category: "measurement",
  },
  {
    title: "Fiber Color Code",
    href: "/dashboard/fiber-color-code",
    icon: Palette,
    description: "Lookup tube and core colors (TIA-598-C & Telkom)",
    category: "measurement",
  },

  // ── Utility (All Roles) ──
  {
    title: "Splice Manager",
    href: "/dashboard/splice-manager",
    icon: Scissors,
    description: "Generate fiber distribution core splicing tables",
    category: "utility",
  },
  {
    title: "GPON Splitter Estimator",
    href: "/dashboard/gpon-splitter-estimator",
    icon: GitFork,
    description: "Model complex optical splitter loss, cascading configurations, and unbalanced daisy chain paths.",
    category: "utility",
  },
  {
    title: "DMS ↔ DD Converter",
    href: "/dashboard/dms-dd-converter",
    icon: Navigation,
    description: "Convert single or batch coordinates between Degrees/Minutes/Seconds (DMS) and Decimal Degrees (DD).",
    category: "utility",
  },
]

// Combined menu (backward compatible — used by sidebar & dashboard)
export const dashboardMenu: DashboardMenuItem[] = [
  ...systemMenuItems,
  ...toolMenuItems,
]

// Helper: get tools by category
export function getToolsByCategory(categoryId: ToolCategory): DashboardMenuItem[] {
  return toolMenuItems.filter((item) => item.category === categoryId)
}

export const footerLinks = {
  product: [
    { label: "Tools", href: "/#tools" },
    { label: "Pricing", href: "/pricing" },
    { label: "Documentation", href: "/docs" },
    { label: "Blog", href: "/blog" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Refund Policy", href: "/refund" },
  ],
}
