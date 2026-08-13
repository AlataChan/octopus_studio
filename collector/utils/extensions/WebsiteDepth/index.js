const { v4 } = require("uuid");
const { default: slugify } = require("slugify");
const { parse } = require("node-html-parser");
const { writeToServerDocuments } = require("../../files");
const { tokenizeString } = require("../../tokenizer");
const path = require("path");
const fs = require("fs");
const {
  hasDependency,
  hasPuppeteer,
  isLightweightMode,
} = require("../../featureDetection");
const {
  scrapeWithJinaReader,
} = require("../../../processLink/convert/jinaReader");

async function discoverLinks(startUrl, maxDepth = 1, maxLinks = 20) {
  const baseUrl = new URL(startUrl);
  const discoveredLinks = new Set([startUrl]);
  let queue = [[startUrl, 0]]; // [url, currentDepth]
  const scrapedUrls = new Set();

  for (let currentDepth = 0; currentDepth < maxDepth; currentDepth++) {
    const levelSize = queue.length;
    const nextQueue = [];

    for (let i = 0; i < levelSize && discoveredLinks.size < maxLinks; i++) {
      const [currentUrl, urlDepth] = queue[i];

      if (!scrapedUrls.has(currentUrl)) {
        scrapedUrls.add(currentUrl);
        const newLinks = await getPageLinks(currentUrl, baseUrl);

        for (const link of newLinks) {
          if (!discoveredLinks.has(link) && discoveredLinks.size < maxLinks) {
            discoveredLinks.add(link);
            if (urlDepth + 1 < maxDepth) {
              nextQueue.push([link, urlDepth + 1]);
            }
          }
        }
      }
    }

    queue = nextQueue;
    if (queue.length === 0 || discoveredLinks.size >= maxLinks) break;
  }

  return Array.from(discoveredLinks);
}

async function getPageLinks(url, baseUrl) {
  try {
    const html = await fetchPageHtml(url);
    return extractLinks(html, baseUrl);
  } catch (error) {
    console.error(`Failed to get page links from ${url}.`, error);
    return [];
  }
}

function extractLinks(html, baseUrl) {
  const root = parse(html);
  const links = root.querySelectorAll("a");
  const extractedLinks = new Set();

  for (const link of links) {
    const href = link.getAttribute("href");
    if (href) {
      const absoluteUrl = new URL(href, baseUrl.href).href;
      if (
        absoluteUrl.startsWith(
          baseUrl.origin + baseUrl.pathname.split("/").slice(0, -1).join("/")
        )
      ) {
        extractedLinks.add(absoluteUrl);
      }
    }
  }

  return Array.from(extractedLinks);
}

async function bulkScrapePages(links, outFolderPath) {
  const scrapedData = [];

  const scraperPreference = String(process.env.WEB_SCRAPER || "")
    .trim()
    .toLowerCase();
  const preferJina =
    scraperPreference === "jina" ||
    (scraperPreference === "" && isLightweightMode());
  const preferPuppeteer = scraperPreference === "puppeteer";

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    console.log(`Scraping ${i + 1}/${links.length}: ${link}`);

    try {
      let content = null;
      if (preferJina && !preferPuppeteer) {
        content = await scrapeWithJinaReader(link).catch(() => null);
      }
      if (!content && preferPuppeteer) {
        content = await scrapeWithPuppeteerCore(link).catch(() => null);
      }
      if (!content) {
        const html = await fetchPageHtml(link);
        content = parseHtmlToText(html);
      }

      if (!content.length) {
        console.warn(`Empty content for ${link}. Skipping.`);
        continue;
      }

      const url = new URL(link);
      const decodedPathname = decodeURIComponent(url.pathname);
      const filename = `${url.hostname}${decodedPathname.replace(/\//g, "_")}`;

      const data = {
        id: v4(),
        url: "file://" + slugify(filename) + ".html",
        title: slugify(filename) + ".html",
        docAuthor: "no author found",
        description: "No description found.",
        docSource: "URL link uploaded by the user.",
        chunkSource: `link://${link}`,
        published: new Date().toLocaleString(),
        wordCount: content.split(" ").length,
        pageContent: content,
        token_count_estimate: tokenizeString(content),
      };

      writeToServerDocuments({
        data,
        filename: data.title,
        destinationOverride: outFolderPath,
      });
      scrapedData.push(data);

      console.log(`Successfully scraped ${link}.`);
    } catch (error) {
      console.error(`Failed to scrape ${link}.`, error);
    }
  }

  return scrapedData;
}

async function websiteScraper(startUrl, depth = 1, maxLinks = 20) {
  const websiteName = new URL(startUrl).hostname;
  const outFolder = slugify(
    `${slugify(websiteName)}-${v4().slice(0, 4)}`
  ).toLowerCase();
  const outFolderPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(
          __dirname,
          `../../../../server/storage/documents/${outFolder}`
        )
      : path.resolve(process.env.STORAGE_DIR, `documents/${outFolder}`);

  console.log("Discovering links...");
  const linksToScrape = await discoverLinks(startUrl, depth, maxLinks);
  console.log(`Found ${linksToScrape.length} links to scrape.`);

  if (!fs.existsSync(outFolderPath))
    fs.mkdirSync(outFolderPath, { recursive: true });
  console.log("Starting bulk scraping...");
  const scrapedData = await bulkScrapePages(linksToScrape, outFolderPath);
  console.log(`Scraped ${scrapedData.length} pages.`);

  return scrapedData;
}

function parseHtmlToText(html = "") {
  try {
    if (!html) return "";
    const root = parse(html);
    return root?.text?.trim?.() || "";
  } catch {
    return "";
  }
}

async function fetchPageHtml(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "text/html",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36",
    },
  });
  return await res.text();
}

async function scrapeWithPuppeteerCore(url) {
  if (!hasPuppeteer()) throw new Error("Puppeteer is not installed.");
  const moduleName = hasDependency("puppeteer-core")
    ? "puppeteer-core"
    : "puppeteer";
  const puppeteer = require(moduleName);
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || null;
  const browser = await puppeteer.launch({
    headless: "new",
    ignoreHTTPSErrors: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { timeout: 180000, waitUntil: "networkidle2" });
    return await page.evaluate(() => document.body.innerText);
  } finally {
    await browser.close();
  }
}

module.exports = websiteScraper;
