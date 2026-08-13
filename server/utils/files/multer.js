const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4 } = require("uuid");
const { normalizePath } = require(".");
const {
  getDocumentUploadLimit,
  getImageUploadLimit,
  getMultipartUploadLimits,
  getUploadErrorStatusCode,
} = require("../requestLimits");

function isDesktopRuntime() {
  return process.env.ANYTHING_LLM_RUNTIME === "desktop";
}

/**
 * Handle File uploads for auto-uploading.
 * Mostly used for internal GUI/API uploads.
 */
const fileUploadStorage = multer.diskStorage({
  destination: function (_, __, cb) {
    const uploadOutput =
      process.env.NODE_ENV === "development"
        ? path.resolve(__dirname, `../../../collector/hotdir`)
        : isDesktopRuntime()
          ? path.resolve(process.env.STORAGE_DIR, `../collector/hotdir`)
          : path.resolve(process.env.STORAGE_DIR, `../../collector/hotdir`);
    fs.mkdirSync(uploadOutput, { recursive: true });
    cb(null, uploadOutput);
  },
  filename: function (_, file, cb) {
    file.originalname = normalizePath(
      Buffer.from(file.originalname, "latin1").toString("utf8")
    );
    cb(null, file.originalname);
  },
});

/**
 * Handle API file upload as documents - this does not manipulate the filename
 * at all for encoding/charset reasons.
 */
const fileAPIUploadStorage = multer.diskStorage({
  destination: function (_, __, cb) {
    const uploadOutput =
      process.env.NODE_ENV === "development"
        ? path.resolve(__dirname, `../../../collector/hotdir`)
        : isDesktopRuntime()
          ? path.resolve(process.env.STORAGE_DIR, `../collector/hotdir`)
          : path.resolve(process.env.STORAGE_DIR, `../../collector/hotdir`);
    fs.mkdirSync(uploadOutput, { recursive: true });
    cb(null, uploadOutput);
  },
  filename: function (_, file, cb) {
    file.originalname = normalizePath(
      Buffer.from(file.originalname, "latin1").toString("utf8")
    );
    cb(null, file.originalname);
  },
});

// Asset storage for logos
const assetUploadStorage = multer.diskStorage({
  destination: function (_, __, cb) {
    const uploadOutput =
      process.env.NODE_ENV === "development"
        ? path.resolve(__dirname, `../../storage/assets`)
        : path.resolve(process.env.STORAGE_DIR, "assets");
    fs.mkdirSync(uploadOutput, { recursive: true });
    return cb(null, uploadOutput);
  },
  filename: function (_, file, cb) {
    file.originalname = normalizePath(
      Buffer.from(file.originalname, "latin1").toString("utf8")
    );
    cb(null, file.originalname);
  },
});

/**
 * Handle PFP file upload as logos
 */
const pfpUploadStorage = multer.diskStorage({
  destination: function (_, __, cb) {
    const uploadOutput =
      process.env.NODE_ENV === "development"
        ? path.resolve(__dirname, `../../storage/assets/pfp`)
        : path.resolve(process.env.STORAGE_DIR, "assets/pfp");
    fs.mkdirSync(uploadOutput, { recursive: true });
    return cb(null, uploadOutput);
  },
  filename: function (req, file, cb) {
    const randomFileName = `${v4()}${path.extname(
      normalizePath(file.originalname)
    )}`;
    req.randomFileName = randomFileName;
    cb(null, randomFileName);
  },
});

/**
 * Handle Generic file upload as documents from the GUI
 * @param {Request} request
 * @param {Response} response
 * @param {NextFunction} next
 */
function handleFileUpload(request, response, next) {
  const upload = multer({
    storage: fileUploadStorage,
    limits: getMultipartUploadLimits(getDocumentUploadLimit()),
  }).single("file");
  upload(request, response, function (err) {
    if (err) {
      response
        .status(getUploadErrorStatusCode(err))
        .json({
          success: false,
          error: `Invalid file upload. ${err.message}`,
        })
        .end();
      return;
    }
    next();
  });
}

/**
 * Handle API file upload as documents - this does not manipulate the filename
 * at all for encoding/charset reasons.
 * @param {Request} request
 * @param {Response} response
 * @param {NextFunction} next
 */
function handleAPIFileUpload(request, response, next) {
  const upload = multer({
    storage: fileAPIUploadStorage,
    limits: getMultipartUploadLimits(getDocumentUploadLimit()),
  }).single("file");
  upload(request, response, function (err) {
    if (err) {
      response
        .status(getUploadErrorStatusCode(err))
        .json({
          success: false,
          error: `Invalid file upload. ${err.message}`,
        })
        .end();
      return;
    }
    next();
  });
}

/**
 * Handle logo asset uploads
 */
function handleAssetUpload(request, response, next) {
  const upload = multer({
    storage: assetUploadStorage,
    limits: getMultipartUploadLimits(getImageUploadLimit()),
  }).single("logo");
  upload(request, response, function (err) {
    if (err) {
      response
        .status(getUploadErrorStatusCode(err))
        .json({
          success: false,
          error: `Invalid file upload. ${err.message}`,
        })
        .end();
      return;
    }
    next();
  });
}

/**
 * Handle app icon asset uploads (single square master image, field name "icon")
 */
function handleIconUpload(request, response, next) {
  const upload = multer({
    storage: assetUploadStorage,
    limits: getMultipartUploadLimits(getImageUploadLimit()),
  }).single("icon");
  upload(request, response, function (err) {
    if (err) {
      response
        .status(getUploadErrorStatusCode(err))
        .json({
          success: false,
          error: `Invalid file upload. ${err.message}`,
        })
        .end();
      return;
    }
    next();
  });
}

/**
 * Handle PFP file upload as logos
 */
function handlePfpUpload(request, response, next) {
  const upload = multer({
    storage: pfpUploadStorage,
    limits: getMultipartUploadLimits(getImageUploadLimit()),
  }).single("file");
  upload(request, response, function (err) {
    if (err) {
      response
        .status(getUploadErrorStatusCode(err))
        .json({
          success: false,
          error: `Invalid file upload. ${err.message}`,
        })
        .end();
      return;
    }
    next();
  });
}

module.exports = {
  handleFileUpload,
  handleAPIFileUpload,
  handleAssetUpload,
  handleIconUpload,
  handlePfpUpload,
};
