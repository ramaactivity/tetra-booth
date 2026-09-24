import { Button } from "@tetra/ui";
import { copy } from "../copy";

export function Attract({ eventName, onStart }: { eventName: string; onStart: () => void }) {
  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-16 bg-bg p-16 text-fg">
      <h1 className="font-display text-7xl font-medium tracking-tight">{eventName}</h1>
      <Button size="booth" onClick={onStart}>
        {copy.attract.cta}
      </Button>
    </main>
  );
}
