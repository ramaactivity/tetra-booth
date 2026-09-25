"use client";
import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { archiveTemplate } from "./actions";

export function DeleteTemplateButton({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Hapus ${name}`}
      title="Hapus"
      disabled={pending}
      className={className}
      onClick={() =>
        confirm(
          `Hapus template "${name}"? Event yang sudah memakainya tetap mencetak dengan versi terakhirnya.`,
        ) && start(() => archiveTemplate(id))
      }
    >
      <Trash2 className="size-4" />
    </button>
  );
}
