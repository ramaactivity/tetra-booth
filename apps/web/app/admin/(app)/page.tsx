import { EventsList, type ListParams } from "./EventsList";

export const dynamic = "force-dynamic";

/** Daftar event mode Event (bawaan /admin, DECISIONS #156). */
export default async function EventsPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  return <EventsList mode="event" sp={await searchParams} />;
}
