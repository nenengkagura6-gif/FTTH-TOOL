// ==================================================
// Job API - Async Queue Processing
// Untuk processing berat yang pakai Celery queue
// ==================================================

import { apiClient, createApiClient } from './client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiResponse } from './types'

export interface QueueJobRequest {
  job_id: string
  file_path: string
  original_filename: string
  user_id: string
  tool_name: 'kml_to_boq' | 'kml_to_database_hp' | 'kml_to_database' | 'kml_duplicate_checker'
  template_path?: string
}

export interface QueueJobResponse {
  status: 'queued'
  job_id: string
}

class JobApi {
  private client = apiClient

  setAuthClient(supabase: SupabaseClient) {
    this.client = createApiClient(supabase)
  }

  /**
   * Submit job to async queue (Celery)
   * Gunakan ini untuk processing berat
   */
  async submitJob(request: QueueJobRequest): Promise<ApiResponse<QueueJobResponse>> {
    return this.client.post<QueueJobResponse>('/api/v1/queue/job', request)
  }

  /**
   * Health check backend
   */
  async checkBackendHealth(): Promise<ApiResponse<{ status: string }>> {
    return this.client.healthCheck()
  }

  /**
   * Check if backend is reachable
   */
  async isBackendOnline(): Promise<boolean> {
    const result = await this.client.healthCheck()
    return result.success && result.data?.status === 'healthy'
  }
}

export const jobApi = new JobApi()
