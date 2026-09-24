import * as Sentry from "@sentry/nextjs";

// Tanpa data pribadi tamu: token galeri/live/sesi di path & query (URL presigned R2) dibuang dari event dan breadcrumb.
const scrub = (s: string) => s.replace(/\/(g|live|s)\/[^/?#]+/g, "/$1/[id]").replace(/\?.*/, "");

/** DSN hanya diisi di Vercel production; lokal & e2e tidak mengirim apa pun. */
export function initSentry() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // SDK v11 default-nya mengumpulkan semua; matikan yang bisa memuat data tamu.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.transaction) event.transaction = scrub(event.transaction);
      const next = event.contexts?.nextjs;
      if (typeof next?.request_path === "string") next.request_path = scrub(next.request_path);
      if (event.request) {
        const { url, method } = event.request;
        event.request = { ...(url && { url: scrub(url) }), ...(method && { method }) };
      }
      return event;
    },
    beforeBreadcrumb(b) {
      if (b.data)
        for (const k of ["url", "from", "to"])
          if (typeof b.data[k] === "string") b.data[k] = scrub(b.data[k]);
      return b;
    },
  });
}
