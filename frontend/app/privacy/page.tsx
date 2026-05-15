import type { Metadata } from "next"
import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { LegalContent, type LegalSection } from "@/components/site/legal-layout"

export const metadata: Metadata = {
  title: "Privacy Policy — FTTH Tool",
  description: "How FTTH Tool collects, processes, and protects your data.",
}

const sections: LegalSection[] = [
  {
    id: "data-collection",
    title: "1. Data collection",
    body: [
      "We collect only the information necessary to operate the platform: account details (email, name), workspace settings, and metadata about uploaded files.",
      "We do not sell, rent, or share your personal information with third parties for marketing purposes.",
    ],
  },
  {
    id: "file-processing",
    title: "2. File processing",
    body: [
      "Files you upload (KML, KMZ, XLSX) are processed inside isolated workers. Processing logs include only the filename, size, and timing — never the content.",
      "Outputs are encrypted at rest and accessible only to your account.",
    ],
  },
  {
    id: "temporary-uploads",
    title: "3. Temporary uploads",
    body: [
      "Uploaded files are retained for 24 hours by default and then permanently deleted. Pro accounts can configure shorter retention.",
      "We never use your files to train any models.",
    ],
  },
  {
    id: "cookies",
    title: "4. Cookies",
    body: [
      "We use a minimal set of essential cookies for authentication and session management.",
      "Analytics cookies are only set with your consent and are anonymized.",
    ],
  },
  {
    id: "security",
    title: "5. Security",
    body: [
      "All data is encrypted in transit via TLS 1.2+ and at rest via AES-256.",
      "We follow the principle of least privilege internally and audit access regularly.",
    ],
  },
  {
    id: "third-parties",
    title: "6. Third-party services",
    body: [
      "We use trusted infrastructure partners (cloud hosting, email delivery, analytics). All partners are bound by data processing agreements.",
      "A full list of subprocessors is available on request.",
    ],
  },
  {
    id: "advertising",
    title: "7. Advertising",
    body: [
      "Some pages of our public website may show display advertising. Ad networks may set their own cookies, governed by their privacy policies.",
      "Authenticated dashboard pages never show third-party ads.",
    ],
  },
  {
    id: "user-rights",
    title: "8. Your rights",
    body: [
      "You can access, export, or delete your data at any time from your dashboard settings.",
      "For GDPR or CCPA requests, contact privacy@nusahytoria.com.",
    ],
  },
]

export default function PrivacyPage() {
  return (
    <>
      <SiteNavbar />
      <main className="relative">
        <PageHeader
          eyebrow="Legal"
          title="Privacy Policy"
          description="Last updated: May 1, 2026"
        />
        <LegalContent sections={sections} />
      </main>
      <SiteFooter />
    </>
  )
}
