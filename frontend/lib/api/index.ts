// ==================================================
// API Client - Backend Integration
// Connects Frontend (Next.js) ↔ Backend (FastAPI)
// ==================================================

export { apiClient, createApiClient } from './client'
export { jobApi } from './jobs'
export { fileApi } from './files'
export type { ApiResponse, ApiError } from './types'
