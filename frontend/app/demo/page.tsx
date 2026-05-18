// ==================================================
// API Integration Demo Page
// ==================================================

import { ApiDemo } from '@/components/api-demo'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'API Demo - Backend Integration',
  description: 'Test KML processing API integration',
}

export default function DemoPage() {
  return (
    <main className="container py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Backend API Integration</h1>
        <p className="text-muted-foreground mt-2">
          Test direct connection to FastAPI backend at{' '}
          <code className="bg-muted px-1 py-0.5 rounded">
            {process.env.NEXT_PUBLIC_API_URL}
          </code>
        </p>
      </div>
      <ApiDemo />
    </main>
  )
}
