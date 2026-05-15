'use client'

import { useState, createContext, useContext, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap, Check, Lock, Crown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLAN_INFO, type UserPlan, type FeatureKey, FEATURES } from '@/lib/features'

// ============================================
// Upgrade Modal Context
// ============================================

interface UpgradeModalContextType {
    showUpgradeModal: (featureKey?: FeatureKey) => void
    hideUpgradeModal: () => void
}

const UpgradeModalContext = createContext<UpgradeModalContextType | undefined>(undefined)

export function useUpgradeModal() {
    const context = useContext(UpgradeModalContext)
    if (!context) throw new Error('useUpgradeModal must be used within UpgradeModalProvider')
    return context
}

// ============================================
// Provider + Modal
// ============================================

const PRO_FEATURES = [
    'KML to BOQ — Generate Bill of Quantities',
    'KML to Database HP — Structured database export',
    'OTDR Analyzer — Trace file analysis',
    'OPM Calculator — Power calculations',
    'Batch Processing — Multiple files at once',
    'Custom Templates — Save your output formats',
    'Advanced Export — PDF, DWG, and more',
    '500 monthly processing quota',
    'Priority email support',
]

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false)
    const [triggerFeature, setTriggerFeature] = useState<FeatureKey | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)

    const showUpgradeModal = useCallback((featureKey?: FeatureKey) => {
        setTriggerFeature(featureKey || null)
        setIsOpen(true)
    }, [])

    const hideUpgradeModal = useCallback(() => {
        setIsOpen(false)
        setTriggerFeature(null)
    }, [])

    const featureLabel = triggerFeature ? FEATURES[triggerFeature]?.label : null
    const requiredPlan = triggerFeature ? FEATURES[triggerFeature]?.minPlan : 'pro'

    return (
        <UpgradeModalContext.Provider value={{ showUpgradeModal, hideUpgradeModal }}>
            {children}

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={hideUpgradeModal}
                            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
                        />

                        {/* Modal */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
                        >
                            <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-b from-card to-background shadow-2xl overflow-hidden">
                                {/* Glow effect */}
                                <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

                                {/* Close button */}
                                <button
                                    onClick={hideUpgradeModal}
                                    className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors z-10"
                                >
                                    <X className="h-4 w-4" />
                                </button>

                                {/* Header */}
                                <div className="relative px-6 pt-8 pb-4 text-center">
                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/20 ring-1 ring-amber-500/30 mb-4">
                                        <Crown className="h-7 w-7 text-amber-400" />
                                    </div>

                                    {featureLabel ? (
                                        <>
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium border border-amber-500/20 mb-3">
                                                <Lock className="h-3 w-3" />
                                                Pro Feature
                                            </div>
                                            <h2 className="text-xl font-semibold">
                                                Upgrade to unlock{' '}
                                                <span className="text-amber-400">{featureLabel}</span>
                                            </h2>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                This feature requires a Pro subscription. Upgrade now to unlock all premium tools.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <h2 className="text-xl font-semibold">
                                                Upgrade to{' '}
                                                <span className="text-amber-400">Pro</span>
                                            </h2>
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                Unlock all premium tools and features for your FTTH workflow.
                                            </p>
                                        </>
                                    )}
                                </div>

                                {/* Features list */}
                                <div className="px-6 pb-2">
                                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Sparkles className="h-4 w-4 text-amber-400" />
                                            <span className="text-sm font-medium">Everything in Pro:</span>
                                        </div>
                                        <ul className="space-y-2">
                                            {PRO_FEATURES.map((feature, i) => (
                                                <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                                                    <Check className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                {/* CTA */}
                                <div className="px-6 py-5 space-y-3">
                                    <button
                                        disabled={isProcessing}
                                        onClick={async () => {
                                            setIsProcessing(true)
                                            try {
                                                const res = await fetch('/api/payment/create', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ plan: requiredPlan })
                                                })
                                                const data = await res.json()
                                                if (data.token) {
                                                    // @ts-ignore
                                                    window.snap.pay(data.token, {
                                                        onSuccess: () => { window.location.reload() },
                                                        onPending: () => { hideUpgradeModal() },
                                                        onError: () => { setIsProcessing(false) },
                                                        onClose: () => { setIsProcessing(false) }
                                                    })
                                                } else {
                                                    alert(data.error || 'Failed to initialize payment')
                                                    setIsProcessing(false)
                                                }
                                            } catch (err) {
                                                console.error(err)
                                                setIsProcessing(false)
                                            }
                                        }}
                                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 text-sm font-semibold text-black hover:from-amber-400 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                                    >
                                        {isProcessing ? (
                                            <div className="h-4 w-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Zap className="h-4 w-4" />
                                        )}
                                        {isProcessing ? 'Processing...' : 'Upgrade to Pro'}
                                    </button>

                                    <button
                                        disabled={isProcessing}
                                        onClick={hideUpgradeModal}
                                        className="w-full inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-30"
                                    >
                                        Maybe later
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </UpgradeModalContext.Provider>
    )
}
