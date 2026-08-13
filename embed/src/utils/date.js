export function formatDate(sentAt) {
  if (!sentAt) return "";

  try {
    const date = new Date(sentAt * 1000);
    const timeString = date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return timeString;
  } catch (e) {
    return "";
  }
}
