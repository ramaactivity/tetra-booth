import { Button } from "@tetra/ui";
import type { ReactNode } from "react";
import { copy } from "../copy";

/** Lembar dialog mode crew (tinggi mengikuti Stage, bukan jendela). */
export function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink/30">
      <div className="layered flex max-h-[90%] w-[760px] flex-col gap-6 rounded-[28px] border-[2.5px] border-ink bg-white p-10 [--lx:10px]">
        <h2 className="text-[40px] font-extrabold tracking-[-0.02em]">{title}</h2>
        {children}
        <Button variant="plain" className="h-[92px] rounded-[20px] text-2xl" onClick={onClose}>
          {copy.crew.cancel}
        </Button>
      </div>
    </div>
  );
}
