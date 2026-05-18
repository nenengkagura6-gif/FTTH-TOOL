// ==================================================
// API Types
// ==================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: ApiError
  message?: string
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

// FastAPI Backend Response Types
export interface BackendJobResponse {
  status: 'ok' | 'error' | 'queued'
  job_id?: string
  message?: string
  filename?: string
  content?: Blob
}

export interface HealthCheckResponse {
  status: string
  service: string
  version: string
}

export interface ConfigResponse {
  version: string
  endpoints: Array<{
    path: string
    method: string
    description: string
  }>
  supported_formats: {
    input: string[]
    output: string[]
  }
}

// Processing Options
export interface KmlProcessingOptions {
  tool: 'kml-to-excel' | 'apd-hpdb' | 'check-duplicates'
  template?: File
  maxDistance?: number
  keywords?: string[]
}
