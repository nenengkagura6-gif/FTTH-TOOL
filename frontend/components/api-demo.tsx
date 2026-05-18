// ==================================================
// Demo Component - API Integration Example
// ==================================================

'use client'

import { useState, useCallback } from 'react'
import { useKmlProcessor, useBackendStatus } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Upload, Download, CheckCircle, AlertCircle } from 'lucide-react'

export function ApiDemo() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  
  const { 
    processKmlToExcel, 
    downloadResult, 
    loading, 
    error: processError, 
    progress,
    result,
    reset 
  } = useKmlProcessor()

  const { online: backendOnline, checking, checkStatus } = useBackendStatus()

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      reset()
    }
  }, [reset])

  const handleProcess = async () => {
    if (!selectedFile) return
    
    const success = await processKmlToExcel(selectedFile)
    if (success) {
      downloadResult()
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-4">
      {/* Backend Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Backend Status
            <span className={`w-3 h-3 rounded-full ${
              backendOnline === null ? 'bg-gray-400' :
              backendOnline ? 'bg-green-500' : 'bg-red-500'
            }`} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={checkStatus}
              disabled={checking}
            >
              {checking ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking...</>
              ) : (
                'Check Status'
              )}
            </Button>
            <span className="text-muted-foreground">
              {backendOnline === null ? 'Click to check' :
               backendOnline ? '✅ Backend Online' : '❌ Backend Offline'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">KML → BOQ Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            <input
              type="file"
              accept=".kml,.kmz"
              onChange={handleFileChange}
              className="w-full"
              disabled={loading}
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-muted-foreground">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {processError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{processError}</AlertDescription>
            </Alert>
          )}

          {loading && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground text-center">
                Processing... {progress}%
              </p>
            </div>
          )}

          <Button 
            onClick={handleProcess} 
            disabled={!selectedFile || loading}
            className="w-full"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> Process KML</>
            )}
          </Button>

          {result && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="flex items-center justify-between">
                <span>File processed successfully!</span>
                <Button variant="outline" size="sm" onClick={downloadResult}>
                  <Download className="w-4 h-4 mr-1" /> Download
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
