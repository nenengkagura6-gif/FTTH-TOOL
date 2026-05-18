// ==================================================
// React Hook untuk API Backend
// ==================================================

'use client'

import { useState, useCallback } from 'react'
import { fileApi, jobApi } from '@/lib/api'
import type { ApiResponse } from '@/lib/api/types'

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface UseApiReturn<T> extends UseApiState<T> {
  execute: (...args: unknown[]) => Promise<ApiResponse<T>>
  reset: () => void
}

// Generic API hook
export function useApi<T>(
  apiFunction: (...args: unknown[]) => Promise<ApiResponse<T>>
): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  })

  const execute = useCallback(
    async (...args: unknown[]) => {
      setState({ data: null, loading: true, error: null })
      
      try {
        const result = await apiFunction(...args)
        
        if (result.success && result.data) {
          setState({ data: result.data, loading: false, error: null })
        } else {
          setState({ 
            data: null, 
            loading: false, 
            error: result.error?.message || 'Terjadi kesalahan' 
          })
        }
        
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setState({ data: null, loading: false, error: errorMessage })
        return { success: false, error: { code: 'EXCEPTION', message: errorMessage } }
      }
    },
    [apiFunction]
  )

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return { ...state, execute, reset }
}

// Hook untuk upload KML
export function useKmlProcessor() {
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processKmlToExcel = useCallback(async (
    kmlFile: File, 
    template?: File
  ) => {
    setLoading(true)
    setError(null)
    setProgress(0)

    try {
      const response = await fileApi.processKmlToExcel(kmlFile, template, (p) => {
        setProgress(p)
      })

      if (response.success && response.data) {
        setResult(response.data)
        return response.data
      } else {
        setError(response.error?.message || 'Processing failed')
        return null
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const processApdHpdb = useCallback(async (
    kmlFile: File,
    template?: File
  ) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fileApi.processApdHpdb(kmlFile, template)

      if (response.success && response.data) {
        setResult(response.data)
        return response.data
      } else {
        setError(response.error?.message || 'Processing failed')
        return null
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const downloadResult = useCallback(() => {
    if (!result) return

    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [result])

  return {
    processKmlToExcel,
    processApdHpdb,
    downloadResult,
    progress,
    result,
    loading,
    error,
    reset: () => {
      setResult(null)
      setError(null)
      setProgress(0)
    }
  }
}

// Hook untuk check backend status
export function useBackendStatus() {
  const [online, setOnline] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  const checkStatus = useCallback(async () => {
    setChecking(true)
    const isOnline = await jobApi.isBackendOnline()
    setOnline(isOnline)
    setChecking(false)
    return isOnline
  }, [])

  return { online, checking, checkStatus }
}
