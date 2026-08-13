const fs = require("fs");
const os = require("os");
const path = require("path");
const { VALID_LANGUAGE_CODES } = require("./validLangs");
const { ImagePreprocessor } = require("./imagePreprocessor");

class OCRLoader {
  /**
   * The language code(s) to use for the OCR.
   * @type {string[]}
   */
  language;
  /**
   * The cache directory for the OCR.
   * @type {string}
   */
  cacheDir;
  /**
   * The image preprocessor instance.
   * @type {ImagePreprocessor}
   */
  preprocessor;

  /**
   * The constructor for the OCRLoader.
   * @param {Object} options - The options for the OCRLoader.
   * @param {string} options.targetLanguages - The target languages to use for the OCR as a comma separated string. eg: "eng,deu,..."
   * @param {boolean} [options.enablePreprocessing=true] - Whether to enable image preprocessing.
   * @param {boolean} [options.enableBinarization=true] - Whether to enable binarization in preprocessing.
   * @param {number} [options.binarizationThreshold=128] - The threshold for binarization (0-255).
   */
  constructor({
    targetLanguages = "eng",
    enablePreprocessing = true,
    enableBinarization = true,
    binarizationThreshold = 128,
  } = {}) {
    this.language = this.parseLanguages(targetLanguages);
    this.enablePreprocessing = enablePreprocessing;
    this.cacheDir = path.resolve(
      process.env.STORAGE_DIR
        ? path.resolve(process.env.STORAGE_DIR, `models`, `tesseract`)
        : path.resolve(__dirname, `../../../server/storage/models/tesseract`)
    );

    // 初始化图像预处理器
    this.preprocessor = new ImagePreprocessor({
      threshold: binarizationThreshold,
      enableBinarization: enableBinarization,
    });

    // Ensure the cache directory exists or else Tesseract will persist the cache in the default location.
    if (!fs.existsSync(this.cacheDir))
      fs.mkdirSync(this.cacheDir, { recursive: true });
    this.log(
      `OCRLoader initialized with language support for:`,
      this.language.map((lang) => VALID_LANGUAGE_CODES[lang]).join(", ")
    );
    if (enablePreprocessing) {
      this.log(
        `Image preprocessing enabled (binarization: ${enableBinarization})`
      );
    }
  }

  /**
   * Parses the language code from a provided comma separated string of language codes.
   * @param {string} language - The language code to parse.
   * @returns {string[]} The parsed language code.
   */
  parseLanguages(language = null) {
    try {
      if (!language || typeof language !== "string") return ["eng"];
      const langList = language
        .split(",")
        .map((lang) => (lang.trim() !== "" ? lang.trim() : null))
        .filter(Boolean)
        .filter((lang) => VALID_LANGUAGE_CODES.hasOwnProperty(lang));
      if (langList.length === 0) return ["eng"];
      return langList;
    } catch (e) {
      this.log(`Error parsing languages: ${e.message}`, e.stack);
      return ["eng"];
    }
  }

  log(text, ...args) {
    console.log(`\x1b[36m[OCRLoader]\x1b[0m ${text}`, ...args);
  }

  /**
   * Loads a PDF file and returns an array of documents.
   * This function is reserved to parsing for SCANNED documents - digital documents are not supported in this function
   * @returns {Promise<{pageContent: string, metadata: object}[]>} An array of documents with page content and metadata.
   */
  async ocrPDF(
    filePath,
    { maxExecutionTime = 300_000, batchSize = 10, maxWorkers = null } = {}
  ) {
    if (
      !filePath ||
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      this.log(`File ${filePath} does not exist. Skipping OCR.`);
      return [];
    }

    const documentTitle = path.basename(filePath);
    this.log(`Starting OCR of ${documentTitle}`);
    const pdfjs = await import("pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js");
    let buffer = fs.readFileSync(filePath);

    const pdfDocument = await pdfjs.getDocument({ data: buffer });

    const documents = [];
    const meta = await pdfDocument.getMetadata().catch(() => null);
    const metadata = {
      source: filePath,
      pdf: {
        version: "v2.0.550",
        info: meta?.info,
        metadata: meta?.metadata,
        totalPages: pdfDocument.numPages,
      },
    };

    const pdfSharp = new PDFSharp({
      validOps: [
        pdfjs.OPS.paintJpegXObject,
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
      ],
    });
    await pdfSharp.init();
    let createWorker, OEM;
    try {
      ({ createWorker, OEM } = require("tesseract.js"));
    } catch (error) {
      this.log(
        "tesseract.js is not installed. OCR for scanned PDFs is an optional feature in Lite mode.",
        error?.message || error
      );
      return [];
    }
    const BATCH_SIZE = batchSize;
    const MAX_EXECUTION_TIME = maxExecutionTime;
    const NUM_WORKERS = maxWorkers ?? Math.min(os.cpus().length, 4);
    const totalPages = pdfDocument.numPages;
    const workerPool = await Promise.all(
      Array(NUM_WORKERS)
        .fill(0)
        .map(() =>
          createWorker(this.language, OEM.LSTM_ONLY, {
            cachePath: this.cacheDir,
          })
        )
    );

    const startTime = Date.now();
    try {
      this.log("Bootstrapping OCR completed successfully!", {
        MAX_EXECUTION_TIME_MS: MAX_EXECUTION_TIME,
        BATCH_SIZE,
        MAX_CONCURRENT_WORKERS: NUM_WORKERS,
        TOTAL_PAGES: totalPages,
      });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `OCR job took too long to complete (${
                MAX_EXECUTION_TIME / 1000
              } seconds)`
            )
          );
        }, MAX_EXECUTION_TIME);
      });

      const processPages = async () => {
        for (
          let startPage = 1;
          startPage <= totalPages;
          startPage += BATCH_SIZE
        ) {
          const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPages);
          const pageNumbers = Array.from(
            { length: endPage - startPage + 1 },
            (_, i) => startPage + i
          );
          this.log(`Working on pages ${startPage} - ${endPage}`);

          const pageQueue = [...pageNumbers];
          const results = [];
          const workerPromises = workerPool.map(async (worker, workerIndex) => {
            while (pageQueue.length > 0) {
              const pageNum = pageQueue.shift();
              this.log(
                `\x1b[34m[Worker ${
                  workerIndex + 1
                }]\x1b[0m assigned pg${pageNum}`
              );
              const page = await pdfDocument.getPage(pageNum);
              const imageBuffer = await pdfSharp.pageToBuffer({ page });
              if (!imageBuffer) continue;
              const { data } = await worker.recognize(imageBuffer, {}, "text");
              this.log(
                `✅ \x1b[34m[Worker ${
                  workerIndex + 1
                }]\x1b[0m completed pg${pageNum}`
              );
              results.push({
                pageContent: data.text,
                metadata: {
                  ...metadata,
                  loc: { pageNumber: pageNum },
                },
              });
            }
          });

          await Promise.all(workerPromises);
          documents.push(
            ...results.sort(
              (a, b) => a.metadata.loc.pageNumber - b.metadata.loc.pageNumber
            )
          );
        }
        return documents;
      };

      await Promise.race([timeoutPromise, processPages()]);
    } catch (e) {
      this.log(`Error: ${e.message}`, e.stack);
    } finally {
      global.Image = undefined;
      await Promise.all(workerPool.map((worker) => worker.terminate()));
    }

    this.log(`Completed OCR of ${documentTitle}!`, {
      documentsParsed: documents.length,
      totalPages: totalPages,
      executionTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    });
    return documents;
  }

  /**
   * 后处理 OCR 识别的文本
   * @param {string} text - 原始 OCR 文本
   * @returns {string} 处理后的文本
   * @private
   */
  postProcessText(text) {
    if (!text || typeof text !== "string") return "";

    return (
      text
        // 合并多余的空格（保留单个空格）
        .replace(/[ \t]+/g, " ")
        // 合并多余的换行（保留最多两个连续换行）
        .replace(/\n{3,}/g, "\n\n")
        // 移除行首行尾空格
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        // 移除首尾空白
        .trim()
    );
  }

  /**
   * Loads an image file and returns the OCRed text.
   * @param {string} filePath - The path to the image file.
   * @param {Object} options - The options for the OCR.
   * @param {number} [options.maxExecutionTime=300000] - The maximum execution time of the OCR in milliseconds.
   * @param {boolean} [options.preprocess] - Whether to preprocess the image (overrides constructor setting).
   * @param {boolean} [options.binarize] - Whether to binarize the image during preprocessing.
   * @param {boolean} [options.smartPreprocess=true] - Whether to use smart preprocessing based on image analysis.
   * @returns {Promise<{pageContent: string, metadata: Object}|null>} The OCR result with text and metadata.
   */
  async ocrImage(
    filePath,
    {
      maxExecutionTime = 300_000,
      preprocess,
      binarize,
      smartPreprocess = true,
    } = {}
  ) {
    let worker = null;
    let tempFilePath = null;

    if (
      !filePath ||
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      this.log(`File ${filePath} does not exist. Skipping OCR.`);
      return null;
    }

    const documentTitle = path.basename(filePath);

    // 确定预处理策略
    let shouldPreprocess = preprocess ?? this.enablePreprocessing;
    let shouldBinarize = binarize;
    let imageAnalysis = null;

    try {
      this.log(`Starting OCR of ${documentTitle}`);
      const startTime = Date.now();

      // 0. 智能预处理：分析图像特征并决定预处理策略
      if (smartPreprocess && shouldPreprocess && preprocess === undefined) {
        this.log(`Analyzing image for smart preprocessing...`);
        imageAnalysis = await this.preprocessor.analyzeImage(filePath);

        if (imageAnalysis.strategy) {
          shouldPreprocess = imageAnalysis.strategy.shouldPreprocess;
          // 只有当 binarize 未明确指定时，才使用分析结果
          if (binarize === undefined) {
            shouldBinarize = imageAnalysis.strategy.shouldBinarize;
          }
          this.log(`Smart strategy: ${imageAnalysis.strategy.reason}`);
        }
      }

      // 1. 图像预处理（根据策略决定）
      let imageToProcess = filePath;
      if (shouldPreprocess) {
        this.log(`Preprocessing image (binarize=${shouldBinarize ?? true})...`);
        tempFilePath = await this.preprocessor.preprocessToFile(filePath, {
          binarize: shouldBinarize,
        });
        imageToProcess = tempFilePath;
      }

      // 2. 创建 Tesseract worker
      let createWorker, OEM;
      try {
        ({ createWorker, OEM } = require("tesseract.js"));
      } catch (error) {
        this.log(
          "tesseract.js is not installed. OCR for images is an optional feature in Lite mode.",
          error?.message || error
        );
        return null;
      }
      worker = await createWorker(this.language, OEM.LSTM_ONLY, {
        cachePath: this.cacheDir,
      });

      // 3. 执行 OCR（带超时）
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `OCR job took too long to complete (${
                maxExecutionTime / 1000
              } seconds)`
            )
          );
        }, maxExecutionTime);
      });

      let ocrResult = null;
      const processImage = async () => {
        const { data } = await worker.recognize(imageToProcess, {}, "text");
        ocrResult = data;
      };

      await Promise.race([timeoutPromise, processImage()]);

      // 4. 后处理文本
      const processedText = this.postProcessText(ocrResult.text);

      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);
      this.log(`Completed OCR of ${documentTitle}!`, {
        executionTime: `${executionTime}s`,
        confidence: `${ocrResult.confidence?.toFixed(1) || "N/A"}%`,
        preprocessed: shouldPreprocess,
        binarized: shouldBinarize ?? true,
        imageType: imageAnalysis?.features?.imageType || "unknown",
      });

      // 5. 返回结构化结果
      return {
        pageContent: processedText,
        metadata: {
          source: filePath,
          confidence: ocrResult.confidence,
          language: this.language.join(","),
          preprocessed: shouldPreprocess,
          binarized: shouldBinarize ?? true,
          executionTime: parseFloat(executionTime),
          imageAnalysis: imageAnalysis
            ? {
                imageType: imageAnalysis.features?.imageType,
                qualityLevel: imageAnalysis.features?.qualityLevel,
                strategy: imageAnalysis.strategy?.reason,
              }
            : null,
        },
      };
    } catch (e) {
      this.log(`Error during OCR: ${e.message}`);
      return null;
    } finally {
      // 清理资源
      if (worker) {
        await worker.terminate();
      }
      if (tempFilePath) {
        this.preprocessor.cleanupTempFile(tempFilePath);
      }
    }
  }
}

/**
 * Converts a PDF page to a buffer using Sharp.
 * @param {Object} options - The options for the Sharp PDF page object.
 * @param {Object} options.page - The PDFJS page proxy object.
 * @returns {Promise<Buffer>} The buffer of the page.
 */
class PDFSharp {
  constructor({ validOps = [] } = {}) {
    this.sharp = null;
    this.validOps = validOps;
  }

  log(text, ...args) {
    console.log(`\x1b[36m[PDFSharp]\x1b[0m ${text}`, ...args);
  }

  async init() {
    this.sharp = (await import("sharp")).default;
  }

  /**
   * Converts a PDF page to a buffer.
   * @param {Object} options - The options for the Sharp PDF page object.
   * @param {Object} options.page - The PDFJS page proxy object.
   * @returns {Promise<Buffer>} The buffer of the page.
   */
  async pageToBuffer({ page }) {
    if (!this.sharp) await this.init();
    try {
      this.log(`Converting page ${page.pageNumber} to image...`);
      const ops = await page.getOperatorList();
      const pageImages = ops.fnArray.length;

      for (let i = 0; i < pageImages; i++) {
        try {
          if (!this.validOps.includes(ops.fnArray[i])) continue;

          const name = ops.argsArray[i][0];
          const img = await page.objs.get(name);
          const { width, height } = img;
          const size = img.data.length;
          const channels = size / width / height;
          const targetDPI = 70;
          const targetWidth = Math.floor(width * (targetDPI / 72));
          const targetHeight = Math.floor(height * (targetDPI / 72));

          const image = this.sharp(img.data, {
            raw: { width, height, channels },
            density: targetDPI,
          })
            .resize({
              width: targetWidth,
              height: targetHeight,
              fit: "fill",
            })
            .withMetadata({
              density: targetDPI,
              resolution: targetDPI,
            })
            .png();

          // For debugging purposes
          // await image.toFile(path.resolve(__dirname, `../../storage/`, `pg${page.pageNumber}.png`));
          return await image.toBuffer();
        } catch (error) {
          this.log(`Iteration error: ${error.message}`, error.stack);
          continue;
        }
      }
      this.log(`No valid images found on page ${page.pageNumber}`);
      return null;
    } catch (error) {
      this.log(`Error: ${error.message}`, error.stack);
      return null;
    }
  }
}

module.exports = OCRLoader;
