// ==================================================
// Feature Gating System
// Controls access to features based on user plan
// ==================================================

export type UserPlan = 'free' | 'basic' | 'pro' | 'enterprise'

export type FeatureKey =
    | 'kml_to_boq'
    | 'kml_to_database'
    | 'kml_duplicate_checker'
    | 'kml_extractor'
    | 'otdr_analyzer'
    | 'opm_calculator'
    | 'batch_processing'
    | 'api_access'
    | 'priority_support'
    | 'custom_templates'
    | 'export_formats'

export interface FeatureConfig {
    key: FeatureKey
    label: string
    description: string
    /** Minimum plan required to access this feature */
    minPlan: UserPlan
    /** Whether to show the feature in UI (even if locked) */
    visible: boolean
}

// Plan hierarchy for comparison
const PLAN_HIERARCHY: Record<UserPlan, number> = {
    free: 0,
    basic: 1,
    pro: 2,
    enterprise: 3,
}

// ============================================
// Feature Registry
// ============================================

export const FEATURES: Record<FeatureKey, FeatureConfig> = {
    kml_duplicate_checker: {
        key: 'kml_duplicate_checker',
        label: 'KML Duplicate Checker',
        description: 'Detect duplicate HP and pole points',
        minPlan: 'free',
        visible: true,
    },
    kml_to_boq: {
        key: 'kml_to_boq',
        label: 'KML to BOQ',
        description: 'Generate Bill of Quantities from KML files',
        minPlan: 'pro',
        visible: true,
    },
    kml_extractor: {
        key: 'kml_extractor',
        label: 'KML Extractor',
        description: 'Extract and summarize elements from KML/KMZ to Excel',
        minPlan: 'pro',
        visible: true,
    },
    kml_to_database: {
        key: 'kml_to_database',
        label: 'KML to Database HP',
        description: 'Convert KML to structured HP database',
        minPlan: 'pro',
        visible: true,
    },
    otdr_analyzer: {
        key: 'otdr_analyzer',
        label: 'OTDR Analyzer',
        description: 'Analyze OTDR trace files',
        minPlan: 'pro',
        visible: true,
    },
    opm_calculator: {
        key: 'opm_calculator',
        label: 'OPM Calculator',
        description: 'Optical power meter calculations',
        minPlan: 'pro',
        visible: true,
    },
    batch_processing: {
        key: 'batch_processing',
        label: 'Batch Processing',
        description: 'Process multiple files at once',
        minPlan: 'pro',
        visible: true,
    },
    api_access: {
        key: 'api_access',
        label: 'API Access',
        description: 'Programmatic access via REST API',
        minPlan: 'enterprise',
        visible: true,
    },
    priority_support: {
        key: 'priority_support',
        label: 'Priority Support',
        description: '24/7 priority support',
        minPlan: 'enterprise',
        visible: true,
    },
    custom_templates: {
        key: 'custom_templates',
        label: 'Custom Templates',
        description: 'Create and save custom output templates',
        minPlan: 'pro',
        visible: true,
    },
    export_formats: {
        key: 'export_formats',
        label: 'Advanced Export',
        description: 'Export to PDF, DWG, and more formats',
        minPlan: 'pro',
        visible: true,
    },
}

// ============================================
// Core functions
// ============================================

/**
 * Check if a plan has access to a feature
 */
export function hasFeatureAccess(userPlan: UserPlan, featureKey: FeatureKey): boolean {
    const feature = FEATURES[featureKey]
    if (!feature) return false
    return PLAN_HIERARCHY[userPlan] >= PLAN_HIERARCHY[feature.minPlan]
}

/**
 * Get the minimum plan required for a feature
 */
export function getRequiredPlan(featureKey: FeatureKey): UserPlan {
    return FEATURES[featureKey]?.minPlan || 'pro'
}

/**
 * Check if a plan is at least the given level
 */
export function isPlanAtLeast(userPlan: UserPlan, requiredPlan: UserPlan): boolean {
    return PLAN_HIERARCHY[userPlan] >= PLAN_HIERARCHY[requiredPlan]
}

/**
 * Get all features accessible by a plan
 */
export function getAccessibleFeatures(userPlan: UserPlan): FeatureConfig[] {
    return Object.values(FEATURES).filter(
        (f) => f.visible && PLAN_HIERARCHY[userPlan] >= PLAN_HIERARCHY[f.minPlan]
    )
}

/**
 * Get all locked features for a plan
 */
export function getLockedFeatures(userPlan: UserPlan): FeatureConfig[] {
    return Object.values(FEATURES).filter(
        (f) => f.visible && PLAN_HIERARCHY[userPlan] < PLAN_HIERARCHY[f.minPlan]
    )
}

// ============================================
// Tool name mapping (for sidebar/page integration)
// ============================================

/** Map route paths to feature keys */
export const ROUTE_TO_FEATURE: Record<string, FeatureKey> = {
    '/dashboard/kml-boq': 'kml_to_boq',
    '/dashboard/kml-database-hp': 'kml_to_database',
    '/dashboard/kml-checker': 'kml_duplicate_checker',
    '/dashboard/kml-extractor': 'kml_extractor',
}

/** Get feature key from route path */
export function getFeatureForRoute(path: string): FeatureKey | null {
    return ROUTE_TO_FEATURE[path] || null
}

// ============================================
// Plan display info
// ============================================

export const PLAN_INFO: Record<UserPlan, { label: string; color: string; badge: string }> = {
    free: {
        label: 'Free',
        color: 'text-gray-400',
        badge: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    },
    basic: {
        label: 'Basic',
        color: 'text-blue-400',
        badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    },
    pro: {
        label: 'Pro',
        color: 'text-amber-400',
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
    enterprise: {
        label: 'Enterprise',
        color: 'text-violet-400',
        badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    },
}
