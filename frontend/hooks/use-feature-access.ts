// ==================================================
// useFeatureAccess Hook
// Frontend plan check + upgrade modal trigger
// ==================================================

'use client'

import { useMemo } from 'react'
import { useAuth } from '@/components/auth/auth-provider'
import {
    hasFeatureAccess,
    getRequiredPlan,
    getLockedFeatures,
    getAccessibleFeatures,
    FEATURES,
    PLAN_INFO,
    type FeatureKey,
    type UserPlan,
} from '@/lib/features'

export function useFeatureAccess() {
    const { profile } = useAuth()
    const userPlan: UserPlan = (profile?.plan as UserPlan) || 'free'

    const result = useMemo(() => ({
        /** Current user plan */
        plan: userPlan,

        /** Plan display info */
        planInfo: PLAN_INFO[userPlan],

        /** Check if user can access a specific feature */
        canAccess: (featureKey: FeatureKey) => hasFeatureAccess(userPlan, featureKey),

        /** Get the required plan for a feature */
        requiredPlan: (featureKey: FeatureKey) => getRequiredPlan(featureKey),

        /** All features the user CAN access */
        accessibleFeatures: getAccessibleFeatures(userPlan),

        /** All features the user CANNOT access (locked) */
        lockedFeatures: getLockedFeatures(userPlan),

        /** Check if user is on a specific plan or higher */
        isPro: userPlan === 'pro' || userPlan === 'enterprise',
        isEnterprise: userPlan === 'enterprise',
        isFree: userPlan === 'free',

        /** Feature registry */
        features: FEATURES,
    }), [userPlan])

    return result
}
