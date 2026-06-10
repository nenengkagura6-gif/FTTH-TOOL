export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Manage your workspace preferences and account.
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm">
        <h2 className="text-base font-medium">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your name and avatar shown to teammates.
        </p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Full name</label>
            <input
              defaultValue="Nusa Hytoria"
              className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              defaultValue="engineer@ftthtools.my.id"
              className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-card/40 p-6 backdrop-blur-sm">
        <h2 className="text-base font-medium">Workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Defaults applied to all your tool runs.
        </p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">
              Cluster prefix
            </label>
            <input
              defaultValue="JKT-FTTH"
              className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Distance unit
            </label>
            <select className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm focus:outline-none focus:border-white/30 transition-colors">
              <option>Meters</option>
              <option>Kilometers</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  )
}
