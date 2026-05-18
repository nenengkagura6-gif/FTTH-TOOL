// ==================================================
// Environment Validation
// Validates all required env vars at startup
// ==================================================

type EnvVar = {
    key: string
    required: boolean
    /** If true, must NOT start with NEXT_PUBLIC_ (server-only) */
    serverOnly?: boolean
    /** Description for error messages */
    description: string
    /** Default value if not required */
    defaultValue?: string
}

const ENV_SCHEMA: EnvVar[] = [
    // Supabase (Public)
    {
        key: 'NEXT_PUBLIC_SUPABASE_URL',
        required: true,
        description: 'Supabase project URL (e.g., https://xxx.supabase.co)',
    },
    {
        key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        required: true,
        description: 'Supabase anonymous/public API key',
    },

    // Supabase (Server-only)
    {
        key: 'SUPABASE_SERVICE_ROLE_KEY',
        required: false,
        serverOnly: true,
        description: 'Supabase service role key (for admin operations)',
    },

    // Application
    {
        key: 'NEXT_PUBLIC_APP_URL',
        required: false,
        description: 'Public application URL',
        defaultValue: 'http://localhost:3000',
    },
    {
        key: 'NEXT_PUBLIC_API_URL',
        required: true,
        description: 'Backend API URL (FastAPI)',
    },

    // Logging
    {
        key: 'LOG_LEVEL',
        required: false,
        description: 'Log level: debug, info, warn, error',
        defaultValue: 'info',
    },
]

export interface EnvValidationResult {
    valid: boolean
    errors: string[]
    warnings: string[]
}

export function validateEnv(): EnvValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const env = process.env.NODE_ENV || 'development'

    for (const variable of ENV_SCHEMA) {
        const value = process.env[variable.key]

        // Check required vars
        if (variable.required && !value) {
            errors.push(`❌ Missing required: ${variable.key} — ${variable.description}`)
            continue
        }

        // Warn about missing optional vars in production
        if (!variable.required && !value && env === 'production') {
            warnings.push(`⚠️  Missing optional: ${variable.key} — ${variable.description}`)
        }

        // Check server-only vars aren't exposed
        if (variable.serverOnly && variable.key.startsWith('NEXT_PUBLIC_')) {
            errors.push(
                `❌ Security: ${variable.key} is marked as server-only but uses NEXT_PUBLIC_ prefix`
            )
        }

        // Check for placeholder values
        if (value && (value === 'your-key-here' || value === 'CHANGE_ME' || value === 'xxx')) {
            errors.push(`❌ Placeholder value: ${variable.key} still has placeholder "${value}"`)
        }
    }

    // Production-specific checks
    if (env === 'production') {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            warnings.push('⚠️  SUPABASE_SERVICE_ROLE_KEY not set — admin operations will fail')
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL
        if (appUrl && appUrl.includes('localhost')) {
            errors.push(`❌ NEXT_PUBLIC_APP_URL contains "localhost" in production: ${appUrl}`)
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
            errors.push(`❌ NEXT_PUBLIC_SUPABASE_URL must use HTTPS in production`)
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    }
}

/**
 * Validate env and throw if invalid (for use in app startup)
 */
export function assertValidEnv(): void {
    const result = validateEnv()

    if (result.warnings.length > 0) {
        console.warn('\n⚠️  Environment Warnings:')
        result.warnings.forEach((w) => console.warn(`   ${w}`))
        console.warn('')
    }

    if (!result.valid) {
        console.error('\n🚨 Environment Validation Failed:')
        result.errors.forEach((e) => console.error(`   ${e}`))
        console.error('\nPlease check your .env.local file.\n')

        if (process.env.NODE_ENV === 'production') {
            throw new Error(`Environment validation failed: ${result.errors.join('; ')}`)
        }
    }
}
