// ==================================================
// File Processing API
// Direct communication with Backend FastAPI
// ==================================================

import { apiClient, createApiClient } from './client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiResponse } from './types'

export interface ProcessKmlOptions {
  kmlFile: File
  template?: File
  tool: 'kml-to-excel' | 'apd-hpdb' | 'check-duplicates'
}

export interface CheckDuplicatesOptions {
  kmlFiles: File[]
  maxDistance?: number
  keywords?: string[]
  outputFormat?: 'text' | 'json'
}

class FileApi {
  private client = apiClient

  setAuthClient(supabase: SupabaseClient) {
    this.client = createApiClient(supabase)
  }

  /**
   * Process KML to BOQ Excel
   */
  async processKmlToExcel(
    kmlFile: File,
    template?: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{ blob: Blob; filename: string }>> {
    const formData = new FormData()
    formData.append('kml_file', kmlFile)
    if (template) {
      formData.append('template', template)
    }

    return this.client.downloadFile('/kml-to-excel', formData, `BOQ_${kmlFile.name}.xlsx`)
  }

  /**
   * Process APD HPDB
   */
  async processApdHpdb(
    kmlFile: File,
    template?: File
  ): Promise<ApiResponse<{ blob: Blob; filename: string }>> {
    const formData = new FormData()
    formData.append('kml_file', kmlFile)
    if (template) {
      formData.append('template', template)
    }

    return this.client.downloadFile('/apd-hpdb', formData, `APD_${kmlFile.name}.xlsx`)
  }

  /**
   * Check duplicate POLE/HP across multiple KML files
   */
  async checkDuplicates(
    options: CheckDuplicatesOptions
  ): Promise<ApiResponse<{ blob: Blob; filename: string } | Record<string, unknown>>> {
    const formData = new FormData()
    
    options.kmlFiles.forEach((file, index) => {
      formData.append('kml_files', file)
    })

    if (options.maxDistance) {
      formData.append('max_distance', options.maxDistance.toString())
    }
    
    if (options.keywords && options.keywords.length > 0) {
      formData.append('keywords', options.keywords.join(','))
    }

    formData.append('output_format', options.outputFormat || 'text')

    const endpoint = options.outputFormat === 'json' 
      ? '/check-duplicates/json' 
      : '/check-duplicates'

    if (options.outputFormat === 'json') {
      return this.client.postFormData(endpoint, formData)
    }

    return this.client.downloadFile(endpoint, formData, 'duplikat_report.txt')
  }

  /**
   * Validate KML file format
   */
  async validateKml(kmlFile: File): Promise<ApiResponse<{
    valid: boolean
    filename: string
    folders?: number
    placemarks?: number
    error?: string
  }>> {
    const formData = new FormData()
    formData.append('kml_file', kmlFile)

    return this.client.postFormData('/validate-kml', formData)
  }

  /**
   * Get API configuration
   */
  async getConfig(): Promise<ApiResponse<{
    version: string
    endpoints: Array<{ path: string; method: string; description: string }>
    supported_formats: { input: string[]; output: string[] }
  }>> {
    return this.client.get('/config')
  }
}

export const fileApi = new FileApi()
