import { EngineCheck } from "./EngineCheck";

/** Bukti Fase 0: hash render di browser harus sama dengan Electron & snapshot test. */
export default function EnginePage() {
  return (
    <main className="p-8">
      <EngineCheck />
    </main>
  );
}
