// ==================================================
// API Route: /api/jobs/[id]
// Individual job operations
// ==================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { JobService } from '@/lib/services/job.service'

// GET /api/jobs/[id] - Get job details
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
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

        // Get job
        const jobService = await JobService.create(user.id)
        const { job, error } = await jobService.getJob(params.id)

        if (error) {
            return NextResponse.json(
                { error: 'Failed to fetch job', code: 'FETCH_ERROR' },
                { status: 500 }
            )
        }

        if (!job) {
            return NextResponse.json(
                { error: 'Job not found', code: 'NOT_FOUND' },
                { status: 404 }
            )
        }

        return NextResponse.json({ job })
        
    } catch (error) {
        console.error('Error in GET /api/jobs/[id]:', error)
        return NextResponse.json(
            { error: 'Internal server error', code: 'INTERNAL_ERROR' },
            { status: 500 }
        )
    }
}

// DELETE /api/jobs/[id] - Delete job
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
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

        // Delete job
        const jobService = await JobService.create(user.id)
        const { success, error } = await jobService.deleteJob(params.id)

        if (error) {
            return NextResponse.json(
                { error: 'Failed to delete job', code: 'DELETE_ERROR' },
                { status: 500 }
            )
        }

        return NextResponse.json({ success })
        
    } catch (error) {
        console.error('Error in DELETE /api/jobs/[id]:', error)
        return NextResponse.json(
            { error: 'Internal server error', code: 'INTERNAL_ERROR' },
            { status: 500 }
        )
    }
}

// PATCH /api/jobs/[id] - Update job (cancel)
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
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

        // Parse body
        const body = await request.json()
        const { action } = body

        if (action === 'cancel') {
            const jobService = await JobService.create(user.id)
            const { success, error } = await jobService.cancelJob(params.id)

            if (error) {
                return NextResponse.json(
                    { error: 'Failed to cancel job', code: 'CANCEL_ERROR' },
                    { status: 500 }
                )
            }

            return NextResponse.json({ success })
        }

        return NextResponse.json(
            { error: 'Invalid action', code: 'VALIDATION_ERROR' },
            { status: 400 }
        )
        
    } catch (error) {
        console.error('Error in PATCH /api/jobs/[id]:', error)
        return NextResponse.json(
            { error: 'Internal server error', code: 'INTERNAL_ERROR' },
            { status: 500 }
        )
    }
}
