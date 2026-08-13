const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const { default: slugify } = require("slugify");
const { log, conclude } = require("./helpers/index.js");
const { WorkspaceParsedFiles } = require("../models/workspaceParsedFiles.js");
const { directUploadsPath } = require("../utils/files");

function rootEntryFromLocation(location, directUploadsFolderName) {
  if (!location) return null;

  const cleaned = String(location)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  if (!cleaned) return null;

  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const idx = parts.lastIndexOf(directUploadsFolderName);
  const relativeParts = idx >= 0 ? parts.slice(idx + 1) : parts;
  if (relativeParts.length === 0) return null;

  return relativeParts[0];
}

async function batchDeleteItems(itemsToDelete, batchSize = 500) {
  let deletedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < itemsToDelete.length; i += batchSize) {
    const batch = itemsToDelete.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    const results = await Promise.allSettled(
      batch.map((targetPath) =>
        fsPromises.rm(targetPath, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        })
      )
    );

    let deletedInBatch = 0;
    for (let j = 0; j < results.length; j++) {
      const res = results[j];
      if (res.status === "fulfilled") {
        deletedCount++;
        deletedInBatch++;
        continue;
      }

      failedCount++;
      const targetPath = batch[j];
      const message = res.reason?.message || String(res.reason);
      log(`Failed to delete ${targetPath}: ${message}`);
    }

    log(`Deleted batch ${batchNumber}: ${deletedInBatch} items`);
  }

  return { deletedCount, failedCount };
}

(async () => {
  try {
    const directUploadsFolderName = path.basename(directUploadsPath);
    const referencedEntries = new Set();
    const parsedFiles = await WorkspaceParsedFiles.where({}, null, null, {
      filename: true,
      metadata: true,
    });

    for (const file of parsedFiles) {
      try {
        if (file?.metadata) {
          const metadata = JSON.parse(file.metadata);
          const rootEntry = rootEntryFromLocation(
            metadata?.location,
            directUploadsFolderName
          );
          if (rootEntry) referencedEntries.add(rootEntry);
        }
      } catch {
        // Ignore invalid metadata JSON
      }

      // Fallback for legacy records that may not have location metadata.
      if (file?.filename) {
        referencedEntries.add(file.filename);
        referencedEntries.add(slugify(file.filename));
      }
    }

    if (!fs.existsSync(directUploadsPath))
      return log("No direct uploads path found - exiting.");
    const itemsInDirectUploadsPath = fs.readdirSync(directUploadsPath, {
      withFileTypes: true,
    });
    if (itemsInDirectUploadsPath.length === 0) return;

    const itemsToDelete = [];
    for (const item of itemsInDirectUploadsPath) {
      if (referencedEntries.has(item.name)) continue;
      itemsToDelete.push(path.resolve(directUploadsPath, item.name));
    }

    if (itemsToDelete.length === 0) return; // No orphaned items to delete
    log(`Found ${itemsToDelete.length} orphaned items to delete`);
    const { deletedCount, failedCount } = await batchDeleteItems(itemsToDelete);
    log(`Deleted ${deletedCount} orphaned items`);
    if (failedCount > 0) log(`Failed to delete ${failedCount} items`);
  } catch (e) {
    console.error(e)
    log(`errored with ${e.message}`)
  } finally {
    conclude();
  }
})();
