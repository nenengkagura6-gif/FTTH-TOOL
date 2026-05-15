"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Key, Plus, Trash2, Copy, Check, Eye, EyeOff, AlertCircle,
  Clock, Activity, Lock, Zap
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { useFeatureAccess } from "@/hooks/use-feature-access"
import { useUpgradeModal } from "@/components/upgrade-modal"

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  is_active: boolean
  last_used_at: string | null
  usage_count: number
  created_at: string
  plainKey?: string // Only present immediately after creation
}

export default function ApiKeysPage() {
  const { profile, isLoading: authLoading } = useAuth()
  const { isPro, isEnterprise } = useFeatureAccess()
  const { showUpgradeModal } = useUpgradeModal()
  
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [newKeyName, setNewKeyName] = useState("")

  const canAccessApi = isPro || isEnterprise

  useEffect(() => {
    if (authLoading || !canAccessApi) {
      setLoading(false)
      return
    }
    fetch('/api/keys')
      .then(r => r.json())
      .then(d => setKeys(d.keys || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [authLoading, canAccessApi])

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName || 'Default Key' })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setKeys([data, ...keys])
      setNewKeyName("")
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const handleRevokeKey = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? Apps using it will stop working immediately.")) return
    try {
      await fetch(`/api/keys?id=${id}`, { method: 'DELETE' })
      setKeys(keys.filter(k => k.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!canAccessApi) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12 space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30">
          <Lock className="h-8 w-8 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Access requires Pro</h1>
          <p className="mt-2 text-muted-foreground">Unlock programmatic access and automate your FTTH workflows with our REST API.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card/40 p-6 text-left space-y-4">
          <h3 className="text-sm font-medium">Pro Plan Benefits:</h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" /> 60 requests per minute</li>
            <li className="flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" /> Full access to all processing tools</li>
            <li className="flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" /> Secure key management</li>
          </ul>
        </div>
        <button
          onClick={() => showUpgradeModal('api_access' as any)}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-black hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
        >
          Upgrade to Pro
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Key className="h-5 w-5 text-primary" />
            </div>
            API Keys
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage your secret keys to access the FTTH API</p>
        </div>
      </div>

      {/* New Key Form */}
      <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm p-6">
        <h2 className="text-base font-medium mb-4">Create New Key</h2>
        <form onSubmit={handleCreateKey} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Key name (e.g. Production Server)"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 ring-primary/50 transition-all"
            required
          />
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {creating ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate Key
          </button>
        </form>
      </div>

      {/* Keys List */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2 px-1">
          <Activity className="h-3.5 w-3.5" />
          Active Keys
        </h2>
        
        <div className="grid gap-4">
          <AnimatePresence mode="popLayout">
            {keys.map((key) => (
              <motion.div
                key={key.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={cn(
                  "rounded-2xl border p-5 backdrop-blur-sm transition-all",
                  key.plainKey ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20" : "border-white/10 bg-card/40"
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold truncate">{key.name}</h3>
                      {key.plainKey && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-primary-foreground animate-pulse">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      {key.plainKey ? (
                        <span className="text-foreground font-medium select-all">{key.plainKey}</span>
                      ) : (
                        <span>{key.key_prefix}••••••••••••••••</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {key.plainKey ? (
                      <button
                        onClick={() => copyToClipboard(key.plainKey!, key.id)}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-all"
                      >
                        {copiedId === key.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        Copy Key
                      </button>
                    ) : (
                      <div className="flex items-center gap-4 mr-2 text-xs text-muted-foreground/60">
                        <div className="flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5" />
                          {key.usage_count}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => handleRevokeKey(key.id)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Revoke Key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {key.plainKey && (
                  <div className="mt-4 flex items-start gap-3 rounded-lg bg-primary/10 border border-primary/20 p-3 text-[11px] text-primary/80">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <p>
                      Please copy your API key now. For your security, we won&apos;t show it again. 
                      If you lose this key, you&apos;ll need to generate a new one.
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {keys.length === 0 && (
            <div className="py-20 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 mb-4">
                <Key className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">No API keys yet. Create one to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
