import type { Metadata } from "next";
import { AuthShell } from "../login/AuthShell";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Kata Sandi · Tetra Admin", robots: { index: false } };

/** Tujuan link undangan tim & atur ulang kata sandi (DECISIONS #69). */
export default function PasswordPage() {
  return (
    <AuthShell>
      <PasswordForm />
    </AuthShell>
  );
}
