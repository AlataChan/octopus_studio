const CONCURRENCY_SAFE_ALLOWLIST = new Set([
  "web-search",
  "web-scraping",
  "web-browsing",
  "rag-memory",
  "knowledge-graph",
  "read-document-file",
  "document-summarizer",
  "sql-agent#list-database-connections",
  "sql-agent#list-tables",
  "sql-agent#get-table-schema",
  "duckdb-agent#list-files",
  "duckdb-agent#get-file-schema",
  "datetime-info",
  "memory",
]);

/**
 * Determine whether a tool is safe to execute concurrently.
 *
 * @param {string} toolName
 * @param {Object} [functionConfig]
 * @returns {boolean}
 */
function isConcurrencySafe(toolName, functionConfig = {}) {
  if (functionConfig?.isConcurrencySafe !== undefined) {
    return !!functionConfig.isConcurrencySafe;
  }

  return CONCURRENCY_SAFE_ALLOWLIST.has(toolName);
}

/**
 * Partition tool calls into concurrent or serial batches.
 *
 * @param {Array<{name: string, arguments: *}>} toolCalls
 * @param {Map<string, Object>} functions
 * @returns {Array<{concurrent: boolean, calls: Array}>}
 */
function partitionToolCalls(toolCalls = [], functions = new Map()) {
  const batches = [];
  let currentBatch = { concurrent: true, calls: [] };

  for (const call of toolCalls) {
    const fn = functions.get(call.name);
    const safe = isConcurrencySafe(call.name, fn);

    if (!safe) {
      if (currentBatch.calls.length > 0) {
        batches.push(currentBatch);
      }

      batches.push({ concurrent: false, calls: [call] });
      currentBatch = { concurrent: true, calls: [] };
      continue;
    }

    currentBatch.calls.push(call);
  }

  if (currentBatch.calls.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Simple promise pool with stable output ordering.
 *
 * @param {Array} items
 * @param {number} maxConcurrency
 * @param {Function} fn
 * @returns {Promise<Array>}
 */
async function promisePool(items = [], maxConcurrency = 1, fn) {
  const results = new Array(items.length);
  const concurrency = Math.max(
    1,
    Math.min(Number(maxConcurrency) || 1, items.length || 1)
  );
  let nextIndex = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Execute tool-call batches with bounded concurrency.
 *
 * @param {Array<{concurrent: boolean, calls: Array}>} batches
 * @param {Function} executor
 * @param {Object} [options]
 * @param {number} [options.maxConcurrency]
 * @returns {Promise<Array>}
 */
async function executeBatches(batches = [], executor, options = {}) {
  const configuredConcurrency =
    options.maxConcurrency ??
    parseInt(process.env.AGENT_MAX_TOOL_CONCURRENCY || "5", 10);
  const maxConcurrency = Math.max(1, configuredConcurrency || 1);
  const results = [];

  for (const batch of batches) {
    if (batch.concurrent && batch.calls.length > 1) {
      const batchResults = await promisePool(
        batch.calls,
        maxConcurrency,
        executor
      );
      results.push(...batchResults);
      continue;
    }

    for (const call of batch.calls) {
      results.push(await executor(call));
    }
  }

  return results;
}

module.exports = {
  partitionToolCalls,
  executeBatches,
  promisePool,
  isConcurrencySafe,
  CONCURRENCY_SAFE_ALLOWLIST,
};
