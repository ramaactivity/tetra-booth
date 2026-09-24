import { Button } from "@tetra/ui";
import { copy } from "../copy";

export function Attract({ eventName, onStart }: { eventName: string; onStart: () => void }) {
  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-16 bg-bg p-16 text-fg">
      <h1 className="text-center font-display text-7xl font-medium tracking-tight portrait:text-5xl">
        {eventName}
      </h1>
      <Button size="booth" onClick={onStart}>
        {copy.attract.cta}
      </Button>
    </main>
  );
}
