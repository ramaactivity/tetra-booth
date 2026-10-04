const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kolom pencari event dari segmen URL admin `/admin/events/[id]`: URL memakai slug (DECISIONS #146),
 * UUID lama (bookmark/link lama) tetap diterima. Pakai: `.eq(eventKey(id), id).eq("organization_id", orgId)`.
 */
export const eventKey = (idOrSlug: string): "id" | "slug" => (UUID.test(idOrSlug) ? "id" : "slug");
