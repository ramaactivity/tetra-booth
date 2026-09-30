import { PHOTO_FILTERS } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { copy } from "../copy";
import { Done, Logo } from "../ui";

/**
 * Pilih filter foto (#116): foto pertama tamu dengan tiap filter yang ditawarkan event (+ Normal). Pratinjau
 * memakai CSS filter yang sama dengan template engine, jadi hasil cetak sama dengan yang dipilih.
 */
export function FilterSelect({
  photoUrl,
  filters,
  onChoose,
  onBack,
}: {
  photoUrl: string;
  filters: readonly string[];
  onChoose: (id: string) => void;
  onBack: () => void;
}) {
  const options = PHOTO_FILTERS.filter((f) => f.id === "normal" || filters.includes(f.id));
  const [picked, setPicked] = useState("normal");
  return (
    <main className="flex h-full w-full flex-col gap-10 bg-paper px-[100px] py-16 portrait:px-12">
      <Logo />
      <h1 className="text-[84px] leading-none font-extrabold tracking-[-0.045em]">
        {copy.filter.title}
      </h1>
      <div className="grid flex-1 grid-cols-3 content-center gap-8 portrait:grid-cols-2">
        {options.map((f) => {
          const on = picked === f.id;
          return (
            <button
              key={f.id}
              type="button"
              data-testid="filter-card"
              aria-pressed={on}
              onClick={() => setPicked(f.id)}
              style={{ ["--under" as string]: on ? "var(--mint)" : "#fff" }}
              className={`pressable layered relative flex flex-col gap-4 rounded-[28px] border-[2.5px] border-ink p-5 [--lx:10px] ${on ? "bg-mint-soft" : "bg-white"}`}
            >
              {on && <Done size={48} className="absolute top-4 right-4 z-10" />}
              <img
                src={photoUrl}
                alt=""
                style={{ filter: f.css }}
                className="aspect-[3/2] w-full rounded-[18px] border-2 border-ink object-cover"
              />
              <span className="text-[30px] font-extrabold tracking-[-0.02em]">{f.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-8">
        <Button
          variant="secondary"
          className="h-[104px] rounded-[26px] px-12 text-[30px]"
          onClick={onBack}
        >
          <ArrowLeft size={30} strokeWidth={2.5} /> {copy.filter.back}
        </Button>
        <Button
          className="h-[104px] rounded-[26px] px-16 text-[34px]"
          onClick={() => onChoose(picked)}
        >
          {copy.filter.next} <ArrowRight size={34} strokeWidth={2.5} />
        </Button>
      </div>
    </main>
  );
}
