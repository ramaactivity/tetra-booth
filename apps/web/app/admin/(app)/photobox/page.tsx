import { EventsList, type ListParams } from "../EventsList";

export const dynamic = "force-dynamic";

/** Daftar event mode Photobox (DECISIONS #156). */
export default async function PhotoboxPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  return <EventsList mode="photobox" sp={await searchParams} />;
}
