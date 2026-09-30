"use client";
import { TemplateEditor, type TemplateEditorProps } from "@tetra/editor";
import { useRouter } from "next/navigation";
import { deletePreset, savePreset, saveTemplate } from "@/app/admin/(app)/templates/actions";
import { PrinterSettingsButton, TestPrintButton } from "./PrintButtons";

type Props = Pick<
  TemplateEditorProps,
  "initial" | "name" | "version" | "savedAt" | "files" | "presets"
> & { id: string };

/** Admin: editor bersama `@tetra/editor` + server action, aset lewat route se-origin, font dari public/fonts. */
export function EditorHost({ id, ...p }: Props) {
  const router = useRouter();
  return (
    <TemplateEditor
      {...p}
      assetUrl={(assetId) => `/admin/templates/${id}/asset/${assetId}?v=${p.version}`}
      fontUrl={(f) => `/fonts/${f.file}`}
      onSave={async ({ layout, name, pendingFiles }) => {
        const fd = new FormData();
        const { id: _i, version: _v, paper: _p, canvas: _c, ...rest } = layout;
        fd.set("layout", JSON.stringify(rest));
        fd.set("name", name);
        for (const [k, f] of Object.entries(pendingFiles)) if (f) fd.set(k, f);
        const r = await saveTemplate(id, null, fd);
        return r?.ok && r.version
          ? { ok: true, version: r.version, message: r.message }
          : { ok: false, message: r?.message ?? "Gagal menyimpan, coba lagi" };
      }}
      onSavePreset={savePreset}
      onDeletePreset={deletePreset}
      onBack={() => router.push("/admin/templates")}
      actions={({ layout, images, fontFamily }) => (
        <>
          <PrinterSettingsButton paper={layout.paper} />
          <TestPrintButton layout={layout} images={images} fontFamily={fontFamily} />
        </>
      )}
    />
  );
}
