"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  Shield, Users, Briefcase, DollarSign, Activity,
  Search, Crown, ChevronLeft, ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { useRouter } from "next/navigation"

const planBadge: Record<string, string> = {
  free: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  basic: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pro: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  enterprise: "bg-violet-500/10 text-violet-400 border-violet-500/20",
}

export default function AdminPageContent() {
  const { profile, isLoading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [usersPagination, setUsersPagination] = useState<any>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [triggerRefresh, setTriggerRefresh] = useState(0)

  // Payments States
  const [activeTab, setActiveTab] = useState<'users' | 'payments'>('users')
  const [payments, setPayments] = useState<any[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null)
  const [rejectingPayment, setRejectingPayment] = useState<any | null>(null)
  const [rejectNotes, setRejectNotes] = useState("")

  // Redirect non-admin
  useEffect(() => {
    if (!isLoading && profile?.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [isLoading, profile, router])

  // Fetch payment confirmations
  const fetchPayments = async () => {
    setLoadingPayments(true);
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client");
      const supabase = getSupabaseClient();
      
      // Fetch payments with user details via secure RPC to avoid RLS loops
      const { data, error } = await supabase.rpc('get_admin_payments');

      if (error) throw error;
      
      // Transform the flat RPC response back to the shape expected by the UI
      const formattedData = (data || []).map((item: any) => ({
        ...item,
        profiles: {
          email: item.email,
          full_name: item.full_name
        }
      }));
      
      setPayments(formattedData);
    } catch (err) {
      console.error("Error fetching payments:", err);
    } finally {
      setLoadingPayments(false);
    }
  };

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
    fetchPayments();
  }, [profile, page, search, triggerRefresh]);

  const handleApprovePayment = async (payment: any) => {
    if (confirm(`Approve payment of Rp ${(payment.amount_paid).toLocaleString('id-ID')} from ${payment.sender_name}?`)) {
      try {
        const { getSupabaseClient } = await import("@/lib/supabase/client");
        const supabase = getSupabaseClient();
        
        // 1. Update confirmation status
        const { error: updateErr } = await supabase
          .from('payment_confirmations')
          .update({ status: 'approved' })
          .eq('id', payment.id);
          
        if (updateErr) throw updateErr;

        // 2. Insert subscription record
        const startedAt = new Date();
        const expiresAt = new Date();
        expiresAt.setDate(startedAt.getDate() + 30); // 30 days active

        const { error: subErr } = await supabase
          .from('subscriptions')
          .insert({
            user_id: payment.user_id,
            plan: payment.plan,
            status: 'active',
            billing_cycle: payment.billing_cycle || 'monthly',
            price_cents: payment.price_cents,
            currency: payment.currency || 'USD',
            started_at: startedAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            payment_provider: 'manual',
            provider_subscription_id: 'manual_' + crypto.randomUUID().slice(0, 8)
          });

        if (subErr) throw subErr;

        // 3. Update user profiles plan & quota
        const quotaLimit = payment.plan === 'pro' ? 99999 : payment.plan === 'basic' ? 500 : 50;
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({
            plan: payment.plan,
            quota_limit: quotaLimit,
            quota_used: 0
          })
          .eq('id', payment.user_id);

        if (profileErr) throw profileErr;

        // 4. Refresh stats and data
        setTriggerRefresh(t => t + 1);
        alert("Payment approved successfully! User plan upgraded.");
      } catch (err: any) {
        console.error("Approve payment error:", err);
        alert("Failed to approve payment: " + err.message);
      }
    }
  };

  const handleOpenReject = (payment: any) => {
    setRejectingPayment(payment);
    setRejectNotes("");
  };

  const handleRejectPaymentSubmit = async () => {
    if (!rejectingPayment) return;
    
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client");
      const supabase = getSupabaseClient();

      const { error: rejectErr } = await supabase
        .from('payment_confirmations')
        .update({
          status: 'rejected',
          admin_notes: rejectNotes || "Pembayaran tidak valid atau dana tidak masuk."
        })
        .eq('id', rejectingPayment.id);

      if (rejectErr) throw rejectErr;

      setRejectingPayment(null);
      setTriggerRefresh(t => t + 1);
      alert("Payment rejected successfully.");
    } catch (err: any) {
      console.error("Reject payment error:", err);
      alert("Failed to reject payment: " + err.message);
    }
  };

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

      {/* Tab Navigations */}
      <div className="flex border-b border-white/10 gap-6">
        <button
          onClick={() => setActiveTab('users')}
          className={cn("pb-3 text-sm font-medium border-b-2 -mb-[2px] transition-colors cursor-pointer",
            activeTab === 'users' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          User Management
        </button>
        <button
          onClick={() => { setActiveTab('payments'); fetchPayments(); }}
          className={cn("pb-3 text-sm font-medium border-b-2 -mb-[2px] transition-colors flex items-center gap-2 cursor-pointer",
            activeTab === 'payments' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Payment Verifications
          {payments.filter(p => p.status === 'pending').length > 0 && (
            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
              {payments.filter(p => p.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'users' ? (
        /* User Management Table */
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
      ) : (
        /* Payment Verifications Table */
        <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-base font-medium">Payment Verifications</h2>
            <button
              onClick={() => setTriggerRefresh(t => t + 1)}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.02] cursor-pointer"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">User</th>
                  <th className="px-3 py-3 text-left">Plan</th>
                  <th className="px-3 py-3 text-left">Sender Info</th>
                  <th className="px-3 py-3 text-left">Amount</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Receipt</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <p className="font-medium truncate max-w-[200px]">{p.profiles?.full_name || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.profiles?.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded border capitalize", 
                        p.plan === 'pro' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      )}>{p.plan}</span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p className="font-medium text-foreground">{p.sender_name}</p>
                      <p className="text-muted-foreground text-[10px] uppercase">{p.sender_bank}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      Rp {p.amount_paid.toLocaleString('id-ID')}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium uppercase",
                        p.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        p.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      )}>{p.status}</span>
                    </td>
                    <td className="px-3 py-3">
                      {p.receipt_url ? (
                        <button
                          onClick={() => setSelectedReceipt(p.receipt_url)}
                          className="text-xs text-primary hover:underline cursor-pointer"
                        >
                          View Receipt
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {p.status === 'pending' ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleApprovePayment(p)}
                            className="text-xs bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg font-medium hover:bg-emerald-600 cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleOpenReject(p)}
                            className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1.5 rounded-lg font-medium hover:bg-red-500 hover:text-white cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      ) : p.status === 'rejected' ? (
                        <p className="text-[10px] text-muted-foreground text-right italic max-w-[120px] truncate" title={p.admin_notes}>
                          Note: {p.admin_notes}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground">Processed</span>
                      )}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && !loadingPayments && (
                  <tr><td colSpan={7} className="py-12 text-center text-muted-foreground/50 text-sm">No payment verifications found</td></tr>
                )}
                {loadingPayments && (
                  <tr><td colSpan={7} className="py-12 text-center text-muted-foreground/50 text-sm">Loading...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative max-w-lg w-full bg-card border border-white/10 rounded-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedReceipt(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 text-xl font-bold cursor-pointer"
            >
              &times;
            </button>
            <h3 className="text-sm font-semibold mb-4">Receipt Proof</h3>
            <div className="relative aspect-[3/4] sm:aspect-square w-full rounded-lg bg-black/40 overflow-hidden flex items-center justify-center border border-white/5">
              {selectedReceipt.endsWith('.pdf') ? (
                <iframe src={selectedReceipt} className="w-full h-full" />
              ) : (
                <img src={selectedReceipt} alt="Transfer Receipt" className="max-w-full max-h-full object-contain" />
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <a
                href={selectedReceipt}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold hover:bg-primary/90"
              >
                Open Original
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingPayment && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative max-w-md w-full bg-card border border-white/10 rounded-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-semibold mb-3">Reject Payment</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Rejecting payment from {rejectingPayment.sender_name} (Rp {rejectingPayment.amount_paid.toLocaleString('id-ID')}). Please specify the reason below.
            </p>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="e.g. Dana tidak masuk, atau bukti transfer palsu."
              className="w-full h-24 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs focus:outline-none focus:border-red-500/50 transition-colors placeholder:text-muted-foreground/40"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRejectingPayment(null)}
                className="text-xs text-muted-foreground px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectPaymentSubmit}
                className="text-xs bg-red-500 text-white px-4 py-2 rounded-xl font-semibold hover:bg-red-600 cursor-pointer"
              >
                Reject Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
