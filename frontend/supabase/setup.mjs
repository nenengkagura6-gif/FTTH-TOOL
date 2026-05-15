// ==================================================
// Supabase Setup Script
// Run: node supabase/setup.mjs
// Requires: SUPABASE_SERVICE_ROLE_KEY in .env.local
// ==================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load env manually since this runs outside Next.js
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) env[match[1].trim()] = match[2].trim()
})

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Missing environment variables.')
    console.error('   Make sure .env.local has:')
    console.error('   - NEXT_PUBLIC_SUPABASE_URL')
    console.error('   - SUPABASE_SERVICE_ROLE_KEY')
    console.error('')
    console.error('   Get service_role key from:')
    console.error('   Supabase Dashboard → Settings → API → service_role (secret)')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
})

async function runSQL(filePath, label) {
    console.log(`\n📋 Running: ${label}...`)
    const sql = readFileSync(resolve(__dirname, filePath), 'utf-8')
    
    // Split by semicolons and run each statement
    // Filter out empty statements and comments-only blocks
    const statements = sql
        .split(/;\s*$/m)
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.match(/^--.*$/m) )
    
    console.log(`   Found ${statements.length} SQL statements`)
    
    // Use the REST API to execute SQL via rpc
    const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql })
    
    if (error) {
        // If rpc doesn't exist, fall back to individual statements
        console.log(`   ⚠️ RPC not available, trying direct approach...`)
        console.log(`   ℹ️  Please run this SQL manually in Supabase Dashboard → SQL Editor:`)
        console.log(`   📁 File: supabase/${filePath}`)
        return false
    }
    
    console.log(`   ✅ ${label} completed!`)
    return true
}

async function checkConnection() {
    console.log('🔌 Testing Supabase connection...')
    
    try {
        const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 })
        
        if (error) {
            console.error('❌ Connection failed:', error.message)
            return false
        }
        
        console.log('✅ Connected to Supabase!')
        console.log(`   Project: ${SUPABASE_URL}`)
        console.log(`   Users: ${data.users.length > 0 ? 'Found existing users' : 'No users yet'}`)
        return true
    } catch (err) {
        console.error('❌ Connection error:', err.message)
        return false
    }
}

async function checkTables() {
    console.log('\n📊 Checking existing tables...')
    
    const tables = ['profiles', 'subscriptions', 'processing_jobs', 'usage_logs', 'api_keys', 'audit_logs', 'system_config']
    const results = {}
    
    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
        if (error && error.code === '42P01') {
            results[table] = '❌ Not found'
        } else if (error) {
            results[table] = `⚠️ Error: ${error.message}`
        } else {
            results[table] = '✅ Exists'
        }
    }
    
    console.log('')
    for (const [table, status] of Object.entries(results)) {
        console.log(`   ${status} — ${table}`)
    }
    
    const allExist = Object.values(results).every(s => s.includes('✅'))
    return allExist
}

async function checkAuthConfig() {
    console.log('\n🔐 Checking auth configuration...')
    
    // Try to get auth settings
    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
            headers: { 'apikey': SERVICE_ROLE_KEY }
        })
        
        if (res.ok) {
            const settings = await res.json()
            console.log(`   Site URL: ${settings.site_url || '⚠️ Not set'}`)
            console.log(`   External providers: ${JSON.stringify(settings.external || {})}`)
        }
    } catch (err) {
        console.log(`   ⚠️ Could not check auth config: ${err.message}`)
    }
}

async function main() {
    console.log('========================================')
    console.log('  FTTH Tool — Supabase Setup Checker')
    console.log('========================================')
    
    // Step 1: Check connection
    const connected = await checkConnection()
    if (!connected) {
        console.error('\n❌ Cannot connect. Check your credentials.')
        process.exit(1)
    }
    
    // Step 2: Check tables
    const tablesExist = await checkTables()
    
    if (tablesExist) {
        console.log('\n🎉 All tables already exist! Schema is deployed.')
    } else {
        console.log('\n⚠️  Some tables are missing. You need to run the SQL schema.')
        console.log('   ')
        console.log('   📋 Steps:')
        console.log('   1. Open: https://supabase.com/dashboard/project/itfwqexiekhjaxbhjlpf/sql/new')
        console.log('   2. Copy contents of: supabase/01-schema.sql')
        console.log('   3. Paste and click "Run"')
        console.log('   4. Copy contents of: supabase/02-rls-policies.sql')
        console.log('   5. Paste and click "Run"')
    }
    
    // Step 3: Check auth config
    await checkAuthConfig()
    
    console.log('\n========================================')
    console.log('  Setup check complete!')
    console.log('========================================')
}

main().catch(console.error)
