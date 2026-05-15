import type { Metadata } from "next"
import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { LegalContent, type LegalSection } from "@/components/site/legal-layout"

export const metadata: Metadata = {
  title: "Terms of Service — FTTH Tool",
  description: "The legal terms governing your use of FTTH Tool.",
}

const sections: LegalSection[] = [
  {
    id: "usage",
    title: "1. Usage policy",
    body: [
      "By accessing FTTH Tool, you agree to use the platform for lawful purposes only and in accordance with these terms.",
      "You are responsible for maintaining the confidentiality of your account credentials.",
    ],
  },
  {
    id: "files",
    title: "2. File restrictions",
    body: [
      "Uploaded files must not contain malware, illegal content, or personal data that you do not have rights to process.",
      "We reserve the right to remove files that violate this policy and suspend accounts repeatedly in violation.",
    ],
  },
  {
    id: "fair-use",
    title: "3. Fair use",
    body: [
      "Free plan limits exist to ensure quality of service for all users. Excessive automated requests may be rate-limited.",
      "Pro plans include generous limits and priority queue access.",
    ],
  },
  {
    id: "liability",
    title: "4. Liability limitations",
    body: [
      "FTTH Tool is provided on an as-is basis. We make no warranties about the accuracy of automated outputs and recommend manual review for critical deliverables.",
      "To the fullest extent permitted by law, our liability for any claim is limited to the fees paid in the prior 12 months.",
    ],
  },
  {
    id: "suspension",
    title: "5. Account suspension",
    body: [
      "We may suspend or terminate accounts that violate these terms, attempt to compromise platform security, or engage in abusive behavior.",
      "Suspended users may export their data within 30 days of notice.",
    ],
  },
  {
    id: "ip",
    title: "6. Intellectual property",
    body: [
      "You retain all rights to the files and outputs you produce on the platform.",
      "FTTH Tool, including the platform, brand, and software, remains the intellectual property of Nusa Hytoria.",
    ],
  },
  {
    id: "changes",
    title: "7. Changes to these terms",
    body: [
      "We may update these terms periodically. Material changes will be communicated via email or in-product notice at least 30 days before taking effect.",
    ],
  },
]

export default function TermsPage() {
  return (
    <>
      <SiteNavbar />
      <main className="relative">
        <PageHeader
          eyebrow="Legal"
          title="Terms of Service"
          description="Last updated: May 1, 2026"
        />
        <LegalContent sections={sections} />
      </main>
      <SiteFooter />
    </>
  )
}
