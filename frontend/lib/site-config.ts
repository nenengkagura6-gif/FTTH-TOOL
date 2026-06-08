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
    title: "KML Extractor",
    href: "/dashboard/kml-extractor",
    icon: FolderSearch,
    description: "Extract elements and summarize counts by folder to Excel",
    featureKey: "kml_extractor",
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
    title: "KML to CSV",
    href: "/dashboard/kml-csv",
    icon: FileSpreadsheet,
    description: "Extract KML Point placemarks to a CSV file",
  },
  {
    title: "KML to Shapefile",
    href: "/dashboard/kml-shp",
    icon: Layers,
    description: "Convert KML/KMZ network layers to ESRI Shapefile",
  },
  {
    title: "Shapefile to KML",
    href: "/dashboard/shp-kml",
    icon: Globe,
    description: "Convert ESRI Shapefile ZIP back to KML/KMZ",
  },
  {
    title: "KML to AutoCAD (DXF)",
    href: "/dashboard/kml-dxf",
    icon: DraftingCompass,
    description: "Convert KML/KMZ vector designs to AutoCAD DXF format",
  },
  {
    title: "AutoCAD (DXF) to KML",
    href: "/dashboard/dxf-kml",
    icon: Compass,
    description: "Convert AutoCAD DXF metric drawings back to KML/KMZ vector data",
  },
  {
    title: "Pole Auto-Sorter",
    href: "/dashboard/pole-sorter",
    icon: ArrowUpDown,
    description: "Urutkan penomoran tiang (New Pole & Existing Pole) secara otomatis berdasarkan posisi kabel dari FDT",
    featureKey: "kml_to_boq",
  },
  {
    title: "Insert Coding KML",
    href: "/dashboard/insert-coding",
    icon: Layers,
    description: "Rename FDT, FAT, Kabel, dan New Pole dalam KML/KMZ secara otomatis",
    featureKey: "kml_to_boq",
  },
  {
    title: "OPM Link Budget",
    href: "/dashboard/opm-calculator",
    icon: Activity,
    description: "Calculate fiber path link loss and power budget",
  },
  {
    title: "Fiber Color Code",
    href: "/dashboard/fiber-color-code",
    icon: Palette,
    description: "Lookup tube and core colors (TIA-598-C & Telkom)",
  },
  {
    title: "OTDR Trace Analyzer",
    href: "/dashboard/otdr-analyzer",
    icon: LineChart,
    description: "Analyze SOR traces and generate reports",
  },
  {
    title: "OTDR Distance-to-Fault",
    href: "/dashboard/otdr-fault-locator",
    icon: MapPin,
    description: "Deteksi lokasi fisik kabel putus pada peta berdasarkan jarak OTDR",
  },
  {
    title: "Splice Manager",
    href: "/dashboard/splice-manager",
    icon: Scissors,
    description: "Generate fiber distribution core splicing tables",
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
    { label: "Contact", href: "/contact" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Refund Policy", href: "/refund" },
  ],
}
