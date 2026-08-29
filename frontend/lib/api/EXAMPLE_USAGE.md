# API Integration - Usage Guide

## Setup

### 1. Environment Variables (sudah ada di .env.local)
```env
NEXT_PUBLIC_API_URL=https://ftth-tool.onrender.com
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### 2. Inisialisasi dengan Supabase Auth (Opsional)
Jika ingin pakai auth token dari Supabase:

```tsx
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { fileApi, jobApi } from '@/lib/api'

// Di komponen atau context
const supabase = createClientComponentClient()

// Set auth client supaya API request include Supabase token
fileApi.setAuthClient(supabase)
jobApi.setAuthClient(supabase)
```

## Usage Examples

### Process KML → BOQ Excel (Langsung Download)

```tsx
import { fileApi } from '@/lib/api'
import { useKmlProcessor } from '@/hooks/use-api'

// === Cara 1: Hook (Recommended untuk UI) ===
function ProcessingComponent() {
  const { 
    processKmlToExcel, 
    downloadResult, 
    loading, 
    error, 
    progress 
  } = useKmlProcessor()

  const handleFile = async (file: File) => {
    const result = await processKmlToExcel(file)
    if (result) {
      downloadResult() // Auto download file
    }
  }

  return (
    <div>
      {loading && <Progress value={progress} />}
      {error && <Error message={error} />}
      <input type="file" onChange={(e) => handleFile(e.target.files![0])} />
    </div>
  )
}

// === Cara 2: API Langsung ===
async function processDirectly(kmlFile: File) {
  const response = await fileApi.processKmlToExcel(kmlFile)
  
  if (response.success && response.data) {
    const { blob, filename } = response.data
    
    // Download file
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  } else {
    console.error('Error:', response.error?.message)
  }
}
```

### Process APD HPDB

```tsx
const response = await fileApi.processApdHpdb(kmlFile, templateFile)
```

### Check Duplicates

```tsx
// Text report
const result = await fileApi.checkDuplicates({
  kmlFiles: [file1, file2],
  maxDistance: 1.0,
  keywords: ['POLE', 'HP'],
  outputFormat: 'text'
})

// JSON response
const result = await fileApi.checkDuplicates({
  kmlFiles: [file1, file2],
  outputFormat: 'json'
})
```

### Check Backend Health

```tsx
import { useBackendStatus } from '@/hooks/use-api'

function StatusIndicator() {
  const { online, checking, checkStatus } = useBackendStatus()
  
  return (
    <button onClick={checkStatus}>
      Backend: {checking ? 'Checking...' : online ? '🟢 Online' : '🔴 Offline'}
    </button>
  )
}
```

### Submit Job ke Queue (Async/Celery)

```tsx
import { jobApi } from '@/lib/api'

async function submitToQueue(
  filePath: string, 
  userId: string, 
  toolName: string
) {
  const response = await jobApi.submitJob({
    job_id: generateUUID(),
    file_path: filePath,
    original_filename: 'input.kml',
    user_id: userId,
    tool_name: toolName // 'kml_to_boq' atau 'kml_to_database_hp'
  })
  
  if (response.success) {
    console.log('Job queued:', response.data?.job_id)
  }
}
```

## API Endpoints (Backend)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/config` | GET | Get API config |
| `/kml-to-excel` | POST | KML → BOQ Excel |
| `/apd-hpdb` | POST | APD HPDB processing |
| `/check-duplicates` | POST | Check duplicate POLE/HP |
| `/validate-kml` | POST | Validate KML format |
| `/api/v1/queue/job` | POST | Submit async job |

## Error Handling

```tsx
const response = await fileApi.processKmlToExcel(file)

if (!response.success) {
  switch (response.error?.code) {
    case 'HTTP_400':
      alert('File format tidak valid')
      break
    case 'HTTP_500':
      alert('Server error, coba lagi nanti')
      break
    case 'CONNECTION_ERROR':
      alert('Tidak dapat terhubung ke backend')
      break
    default:
      alert(response.error?.message)
  }
}
```
