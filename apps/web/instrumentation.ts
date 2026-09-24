import * as Sentry from "@sentry/nextjs";
import { initSentry } from "@/lib/sentry";

export function register() {
  initSentry();
}

export const onRequestError = Sentry.captureRequestError;
