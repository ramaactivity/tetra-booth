import { processShot, type ShotJob } from "./capture-core";

/** Web Worker jepretan Guest Cam (#209): pemrosesan piksel di luar thread UI. */
self.onmessage = async (e: MessageEvent<ShotJob & { id: number }>) => {
  const { id, ...job } = e.data;
  try {
    self.postMessage({ id, ok: true, ...(await processShot(job)) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
