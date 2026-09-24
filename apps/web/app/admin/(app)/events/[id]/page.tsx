import { redirect } from "next/navigation";

/** Dashboard event (E2) menyusul di A5; sementara langsung ke pengaturan. */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/admin/events/${(await params).id}/settings`);
}
