function buildJinaReaderUrl(targetUrl) {
  const baseUrl = String(
    process.env.JINA_READER_BASE_URL || "https://r.jina.ai"
  )
    .trim()
    .replace(/\/+$/, "");
  return `${baseUrl}/${targetUrl}`;
}

async function scrapeWithJinaReader(url) {
  const apiKey = process.env.JINA_READER_API_KEY;
  const readerUrl = buildJinaReaderUrl(url);

  const controller = new AbortController();
  const timeoutMs = Number(process.env.JINA_READER_TIMEOUT_MS || 30_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(readerUrl, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Jina Reader request failed: ${res.status} ${res.statusText}${
          text ? ` - ${text.slice(0, 200)}` : ""
        }`
      );
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { scrapeWithJinaReader, buildJinaReaderUrl };
