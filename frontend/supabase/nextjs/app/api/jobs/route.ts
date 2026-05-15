// ==================================================
// API Route: /api/jobs
// Job management endpoints
// ==================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { JobService } from '@/lib/services/job.service'

// GET /api/jobs - List user's jobs
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized', code: 'UNAUTHORIZED' },
                { status: 401 }
            )
        }

        // Parse query parameters
        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status')
        const tool = searchParams.get('tool')
        const limit = parseInt(searchParams.get('limit') || '20')
        const offset = parseInt(searchParams.get('offset') || '0')

        // Get jobs
        const jobService = await JobService.create(user.id)
        const { jobs, count, error } = await jobService.listJobs({
            status: status as any,
            tool_name: tool as any,
            limit,
            offset,
        })

        if (error) {
            return NextResponse.json(
                { error: 'Failed to fetch jobs', code: 'FETCH_ERROR' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            jobs,
            pagination: {
                total: count,
                limit,
                offset,
                hasMore: offset + jobs.length < count,
            },
        })
        
    } catch (error) {
        console.error('Error in GET /api/jobs:', error)
        return NextResponse.json(
            { error: 'Internal server error', code: 'INTERNAL_ERROR' },
            { status: 500 }
        )
    }
}

// POST /api/jobs - Create a new job
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        
        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized', code: 'UNAUTHORIZED' },
                { status: 401 }
            )
        }

        // Parse request body
        const body = await request.json()
        const { tool_name, original_filename, original_file_url, original_file_size_bytes, config } = body

        // Validate required fields
        if (!tool_name || !original_filename) {
            return NextResponse.json(
                { error: 'Missing required fields', code: 'VALIDATION_ERROR' },
                { status: 400 }
            )
        }

        // Check quota
        const { data: quotaCheck, error: quotaError } = await supabase
            .rpc('check_user_quota', { p_user_id: user.id })

        if (quotaError || !quotaCheck) {
            return NextResponse.json(
                { error: 'Quota exceeded', code: 'QUOTA_EXCEEDED' },
                { status: 429 }
            )
        }

        // Create job
        const jobService = await JobService.create(user.id)
        const { job, error } = await jobService.createJob({
            tool_name,
            original_filename,
            original_file_url,
            original_file_size_bytes,
            config,
        })

        if (error || !job) {
            return NextResponse.json(
                { error: 'Failed to create job', code: 'CREATE_ERROR' },
                { status: 500 }
            )
        }

        // Increment quota usage
        await supabase.rpc('increment_quota_usage', { p_user_id: user.id })

        // Return success
        return NextResponse.json({ job }, { status: 201 })
        
    } catch (error) {
        console.error('Error in POST /api/jobs:', error)
        return NextResponse.json(
            { error: 'Internal server error', code: 'INTERNAL_ERROR' },
            { status: 500 }
        )
    }
}
