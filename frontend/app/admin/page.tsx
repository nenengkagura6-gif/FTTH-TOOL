"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  Shield, Users, Briefcase, DollarSign, Activity,
  Search, Crown, ChevronLeft, ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { useRouter } from "next/navigation"

const toolLabels: Record<string, string> = {
  kml_to_boq: "BOQ", kml_to_database: "DB HP", kml_duplicate_checker: "Checker", kml_extractor: "Extractor",
}
const planBadge: Record<string, string> = {
  free: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  pro: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  enterprise: "bg-violet-500/10 text-violet-400 border-violet-500/20",
}

export default function AdminPage() {
  const { profile, isLoading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [usersPagination, setUsersPagination] = useState<any>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Redirect non-admin
  useEffect(() => {
    if (!isLoading && profile?.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [isLoading, profile, router])

  // Fetch stats and users
  useEffect(() => {
    if (profile?.role !== 'admin') return;
    
    const fetchAdminData = async () => {
      setLoading(true);
      try {
        const { getSupabaseClient } = await import("@/lib/supabase/client");
        const supabase = getSupabaseClient();
        
        // Stats
        const { data: usersData } = await supabase.from('profiles').select('*');
        const { data: jobsData } = await supabase.from('processing_jobs').select('*');
        const { data: subsData } = await supabase.from('subscriptions').select('*').eq('status', 'active');
        
        if (usersData && jobsData && subsData) {
          const today = new Date();
          today.setHours(0,0,0,0);
          
          const usersByPlan = usersData.reduce((acc: any, u) => {
            acc[u.plan || 'free'] = (acc[u.plan || 'free'] || 0) + 1;
            return acc;
          }, {});
          
          const jobsByStatus = jobsData.reduce((acc: any, j) => {
            acc[j.status] = (acc[j.status] || 0) + 1;
            return acc;
          }, {});
          
          setStats({
            overview: {
              totalUsers: usersData.length,
              totalJobs: jobsData.length,
              todayJobs: jobsData.filter(j => new Date(j.created_at) >= today).length,
              activeSubscriptions: subsData.length,
              monthlyRevenueCents: subsData.reduce((sum, s) => sum + (s.price_cents || 0), 0)
            },
            usersByPlan,
            jobsByStatus
          });
          
          // Users with pagination
          const limit = 15;
          const from = (page - 1) * limit;
          const to = from + limit - 1;
          
          let query = supabase.from('profiles').select('*', { count: 'exact' });
          if (search) {
            query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
          }
          
          const { data: paginatedUsers, count } = await query.order('created_at', { ascending: false }).range(from, to);
          
          setUsers(paginatedUsers || []);
          if (count !== null) {
            setUsersPagination({
              page,
              limit,
              total: count,
              totalPages: Math.ceil(count / limit)
            });
          }
        }
      } catch (err) {
        console.error("Admin fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAdminData();
  }, [profile, page, search]);

  const handleUpdateUser = async (userId: string, updates: Record<string, unknown>) => {
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client");
      const supabase = getSupabaseClient();
      await supabase.from('profiles').update(updates).eq('id', userId);
      setUsers(users.map(u => u.id === userId ? { ...u, ...updates } : u));
    } catch (err) {
      console.error(err);
    }
  }

  if (isLoading || profile?.role !== 'admin') {
    return <div className="flex items-center justify-center py-32"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
            <Shield className="h-5 w-5 text-red-400" />
          </div>
          Admin Dashboard
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">System overview and user management</p>
      </div>

      {/* Overview Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Users", value: stats.overview.totalUsers, icon: Users, color: "text-primary" },
            { label: "Total Jobs", value: stats.overview.totalJobs, icon: Briefcase, color: "text-emerald-400" },
            { label: "Today", value: stats.overview.todayJobs, icon: Activity, color: "text-blue-400" },
            { label: "Pro Subs", value: stats.overview.activeSubscriptions, icon: Crown, color: "text-amber-400" },
            { label: "Revenue", value: `$${(stats.overview.monthlyRevenueCents / 100).toFixed(0)}`, icon: DollarSign, color: "text-emerald-400" },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <s.icon className={cn("h-4 w-4", s.color)} />
                <span className="text-[11px] font-medium">{s.label}</span>
              </div>
              <p className="text-xl font-semibold">{s.value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Plan Distribution + Job Status */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-card/40 p-5">
            <h2 className="text-sm font-medium mb-3">Users by Plan</h2>
            <div className="space-y-2">
              {Object.entries(stats.usersByPlan as Record<string, number>).map(([plan, count]) => (
                <div key={plan} className="flex items-center justify-between">
                  <span className={cn("px-2 py-0.5 rounded text-xs font-medium border capitalize", planBadge[plan] || planBadge.free)}>{plan}</span>
                  <span className="text-sm font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-card/40 p-5">
            <h2 className="text-sm font-medium mb-3">Jobs by Status</h2>
            <div className="space-y-2">
              {Object.entries(stats.jobsByStatus as Record<string, number>).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground capitalize">{status}</span>
                  <span className="text-sm font-mono">{count}</span>
                </div>
              ))}
              {Object.keys(stats.jobsByStatus).length === 0 && <p className="text-xs text-muted-foreground/50">No jobs yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* User Management */}
      <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
        <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-medium">User Management</h2>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text" placeholder="Search by email or name..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="bg-transparent text-sm outline-none w-48 placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-5 py-3 text-left">User</th>
                <th className="px-3 py-3 text-left">Plan</th>
                <th className="px-3 py-3 text-left">Quota</th>
                <th className="px-3 py-3 text-left">Role</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <p className="font-medium truncate max-w-[200px]">{u.full_name || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{u.email}</p>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={u.plan}
                      onChange={e => handleUpdateUser(u.id, { plan: e.target.value, quota_limit: e.target.value === 'pro' ? 99999 : e.target.value === 'enterprise' ? 99999 : e.target.value === 'basic' ? 500 : 50 })}
                      className="bg-transparent text-xs border border-white/10 rounded-md px-2 py-1 cursor-pointer"
                    >
                      <option value="free" className="bg-card">Free</option>
                      <option value="pro" className="bg-card">Pro</option>
                      <option value="enterprise" className="bg-card">Enterprise</option>
                    </select>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground font-mono">
                    {u.quota_used}/{u.quota_limit >= 99999 ? '∞' : u.quota_limit}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("text-xs px-1.5 py-0.5 rounded border",
                      u.role === 'admin' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-white/5 text-muted-foreground border-white/10'
                    )}>{u.role}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => handleUpdateUser(u.id, { role: 'admin' })}
                        className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                      >Make Admin</button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr><td colSpan={5} className="py-12 text-center text-muted-foreground/50 text-sm">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {usersPagination && usersPagination.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {usersPagination.page} of {usersPagination.totalPages} ({usersPagination.total} users)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-2 py-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30"><ChevronLeft className="h-3 w-3" /></button>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= usersPagination.totalPages}
                className="px-2 py-1 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30"><ChevronRight className="h-3 w-3" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
