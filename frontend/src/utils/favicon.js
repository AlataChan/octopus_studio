/**
 * Swap the live browser-tab favicon without a page reload.
 * Used after a white-label app icon upload so the change is visible immediately.
 * @param {string} href - new favicon URL (include a ?v= cache-buster)
 */
export function setFaviconHref(href) {
  if (!href || typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;

  // Remove existing rel="icon" / rel="shortcut icon" links to avoid stale icons.
  head.querySelectorAll("link[rel~='icon']").forEach((el) => el.remove());

  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = href;
  head.appendChild(link);
}
