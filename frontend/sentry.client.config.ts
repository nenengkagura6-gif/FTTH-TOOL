import * as Sentry from "@sentry/nextjs";

// Sentry hanya aktif kalau NEXT_PUBLIC_SENTRY_DSN diisi. Tanpa DSN,
// Sentry.init() menjadi no-op — jadi aman ditinggal kosong.
//
// tracesSampleRate diturunkan dari 1.0. Merekam 100% transaksi akan
// menghabiskan kuota Sentry free tier dalam hitungan hari; 10% sudah
// cukup untuk melihat pola, dan error tetap terkirim 100%.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Jangan kirim apa pun kalau DSN belum dikonfigurasi
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  replaysOnErrorSampleRate: 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.02 : 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
