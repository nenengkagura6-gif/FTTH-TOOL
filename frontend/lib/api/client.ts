// ==================================================
// Base API Client
// Handles auth, error handling, request/response
// ==================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase/client'
import { ApiResponse, ApiError, HealthCheckResponse } from './types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * Batas waktu setiap request. Tanpa ini, backend yang menggantung
 * membuat fetch menunggu selamanya dan UI tidak pernah keluar dari
 * status loading.
 */
const DEFAULT_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 120_000

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Permintaan melebihi batas ${Math.round(timeoutMs / 1000)} detik`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

class ApiClient {
  private baseUrl: string
  private supabase: SupabaseClient | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
  }

  setSupabaseClient(client: SupabaseClient) {
    this.supabase = client
  }

  /**
   * Ambil client Supabase yang dipakai untuk otentikasi.
   *
   * Sebelumnya hanya memakai this.supabase, yang diisi lewat setAuthClient().
   * Metode itu tidak pernah dipanggil di mana pun, sehingga header
   * Authorization tidak pernah terkirim. Sekarang jatuh balik ke singleton
   * browser supaya setiap pemanggil ikut terotentikasi secara otomatis.
   */
  private getAuthSource(): SupabaseClient | null {
    if (this.supabase) return this.supabase
    if (typeof window === 'undefined') return null

    try {
      // Import statis; aman karena hanya dijalankan di browser.
      return getSupabaseClient() as unknown as SupabaseClient
    } catch {
      return null
    }
  }

  // Get auth headers with Supabase token
  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }

    const supabase = this.getAuthSource()
    if (supabase) {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    return headers
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<HealthCheckResponse>> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/health`, {}, 10_000)
      if (!response.ok) {
        return {
          success: false,
          error: { code: 'HEALTH_CHECK_FAILED', message: 'Backend tidak tersedia' }
        }
      }
      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONNECTION_ERROR',
          message: error instanceof Error ? error.message : 'Gagal terhubung ke backend'
        }
      }
    }
  }

  // GET request
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const headers = await this.getHeaders()
      const response = await fetchWithTimeout(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers,
      }, DEFAULT_TIMEOUT_MS)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: errorData.detail || errorData.message || `Error ${response.status}`,
            details: errorData
          }
        }
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Request gagal'
        }
      }
    }
  }

  // POST request (JSON)
  async post<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    try {
      const headers = await this.getHeaders()
      const response = await fetchWithTimeout(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }, DEFAULT_TIMEOUT_MS)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: errorData.detail || errorData.message || `Error ${response.status}`,
            details: errorData
          }
        }
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Request gagal'
        }
      }
    }
  }

  // POST with FormData (file upload)
  async postFormData<T>(
    endpoint: string,
    formData: FormData,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<T>> {
    try {
      const headers = await this.getHeaders()
      delete headers['Content-Type'] // Let browser set Content-Type with boundary

      const response = await fetchWithTimeout(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      }, UPLOAD_TIMEOUT_MS)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: errorData.detail || errorData.message || `Error ${response.status}`,
            details: errorData
          }
        }
      }

      // Handle file download response
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/octet-stream') || 
          contentType?.includes('spreadsheet') ||
          contentType?.includes('text/plain')) {
        const blob = await response.blob()
        const filename = this.getFilenameFromResponse(response)
        return { 
          success: true, 
          data: { blob, filename, contentType } as T 
        }
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Request gagal'
        }
      }
    }
  }

  // Download file
  async downloadFile(
    endpoint: string,
    formData: FormData,
    filename?: string
  ): Promise<ApiResponse<{ blob: Blob; filename: string }>> {
    try {
      const headers = await this.getHeaders()
      delete headers['Content-Type']

      const response = await fetchWithTimeout(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      }, UPLOAD_TIMEOUT_MS)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: errorData.detail || errorData.message || `Error ${response.status}`,
            details: errorData
          }
        }
      }

      const blob = await response.blob()
      const actualFilename = filename || this.getFilenameFromResponse(response) || 'download'

      return {
        success: true,
        data: { blob, filename: actualFilename }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DOWNLOAD_FAILED',
          message: error instanceof Error ? error.message : 'Download gagal'
        }
      }
    }
  }

  private getFilenameFromResponse(response: Response): string | null {
    const disposition = response.headers.get('content-disposition')
    if (disposition) {
      const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
      if (filenameMatch && filenameMatch[1]) {
        return filenameMatch[1].replace(/['"]/g, '')
      }
    }
    return null
  }
}

// Singleton instance
export const apiClient = new ApiClient(API_BASE_URL)

// Factory function with Supabase auth
export function createApiClient(supabase: SupabaseClient) {
  const client = new ApiClient(API_BASE_URL)
  client.setSupabaseClient(supabase)
  return client
}
