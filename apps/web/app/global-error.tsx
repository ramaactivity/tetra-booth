"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { copy } from "@/lib/copy";
import "./globals.css";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="id">
      <body className="min-h-screen bg-paper p-8 text-sm text-ink">{copy.crash}</body>
    </html>
  );
}
