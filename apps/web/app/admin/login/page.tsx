import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { AuthShell } from "./AuthShell";
import { ForgotForm } from "./ForgotForm";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Masuk · Tetra Admin", robots: { index: false } };

/** Masuk admin (desain v2 E0); `?lupa` = minta link atur ulang kata sandi. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; lupa?: string }>;
}) {
  const { e, lupa } = await searchParams;
  return (
    <AuthShell>
      {lupa !== undefined ? (
        <ForgotForm />
      ) : (
        <LoginForm note={e === "akses" ? copy.admin.noAccess : null} />
      )}
    </AuthShell>
  );
}
