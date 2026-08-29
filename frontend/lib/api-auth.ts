// ==================================================
// API Key Authentication Middleware Logic
// Validates sk_... keys against hashed storage
// ==================================================

import { createServiceClient } from '@/lib/supabase/server'
import log from '@/lib/logger'

function hashKey(key: string) {
    return require('crypto').createHash('sha256').update(key).digest('hex')
}

/**
 * Validates an API key and returns the user profile
 */
export async function validateApiKey(key: string) {
    if (!key || !key.startsWith('sk_')) {
        return { error: 'Invalid key format', status: 401 }
    }

    const keyHash = hashKey(key)
    const supabase = createServiceClient()

    const { data: keyRecord, error: keyError } = await supabase
        .from('api_keys')
        .select('id, user_id, is_active, rate_limit_per_minute')
        .eq('key_hash', keyHash)
        .single()

    if (keyError || !keyRecord) {
        return { error: 'Invalid API key', status: 401 }
    }

    if (!keyRecord.is_active) {
        return { error: 'API key is inactive', status: 403 }
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, plan, is_active')
        .eq('id', keyRecord.user_id)
        .single()

    if (profileError || !profile) {
        return { error: 'User not found', status: 401 }
    }

    if (!profile.is_active) {
        return { error: 'User account suspended', status: 403 }
    }

    // Update last used
    await supabase.from('api_keys')
        .update({ 
            last_used_at: new Date().toISOString(),
            usage_count: supabase.rpc('increment_usage', { row_id: keyRecord.id }) // or just fetch and increment
        })
        .eq('id', keyRecord.id)

    return { profile, keyId: keyRecord.id, rateLimit: keyRecord.rate_limit_per_minute }
}
