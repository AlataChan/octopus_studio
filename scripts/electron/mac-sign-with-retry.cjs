const { signAsync } = require("@electron/osx-sign");
const osxSignUtil = require("@electron/osx-sign/dist/cjs/util");

const RETRYABLE_PATTERNS = [
  "A timestamp was expected but was not found",
  "timestamp server either could not be reached",
];

function isRetryableTimestampError(error) {
  const message = error?.message || String(error || "");
  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldDisableTimestamp() {
  return process.env.ALATA_MAC_CODESIGN_DISABLE_TIMESTAMP === "true";
}

function shouldSkipCodesign() {
  return (
    process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false" ||
    process.env.ALATA_MAC_CODESIGN_SKIP === "true"
  );
}

const originalExecFileAsync = osxSignUtil.execFileAsync;
let patched = false;

function installCodesignRetryPatch() {
  if (patched) return;
  patched = true;

  osxSignUtil.execFileAsync = async function execFileAsyncWithRetry(
    file,
    args,
    options
  ) {
    const effectiveArgs =
      file === "codesign" && shouldDisableTimestamp()
        ? args.filter((arg) => !String(arg).startsWith("--timestamp"))
        : args;

    if (file !== "codesign") {
      return originalExecFileAsync(file, effectiveArgs, options);
    }

    const maxAttempts = Math.max(
      1,
      Number.parseInt(process.env.ALATA_MAC_CODESIGN_RETRY_ATTEMPTS || "5", 10)
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await originalExecFileAsync(file, effectiveArgs, options);
      } catch (error) {
        if (!isRetryableTimestampError(error) || attempt === maxAttempts) {
          throw error;
        }

        const delayMs = attempt * 5000;
        console.warn(
          `[mac-sign-with-retry] codesign timestamp failure on attempt ${attempt}/${maxAttempts}; retrying in ${delayMs}ms`
        );
        await sleep(delayMs);
      }
    }
  };
}

function adhocSign(appPath) {
  // Even an "unsigned" local build needs a VALID ad-hoc signature on the .app
  // bundle — not just the automatic linker ad-hoc signature on the inner Mach-O.
  // Without a sealed Contents/_CodeSignature/CodeResources, `codesign --verify`
  // fails ("code has no resources but signature indicates they must be present")
  // and macOS on Apple Silicon intermittently SIGKILLs the app on launch (runs
  // fine sometimes, killed within seconds other times). An ad-hoc signature
  // ("-") makes it run reliably for LOCAL testing; it is NOT notarized and must
  // not be used for distribution (that path uses a real Developer ID identity).
  const { execFileSync } = require("child_process");
  console.warn(
    `[mac-sign-with-retry] Unsigned build: applying ad-hoc signature to ${appPath}`
  );
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
}

module.exports = async function signWithRetry(opts) {
  if (shouldSkipCodesign()) {
    const appPath = opts?.app || opts?.appPath;
    if (appPath) {
      adhocSign(appPath);
    } else {
      console.warn(
        "[mac-sign-with-retry] Unsigned build but no app path in opts; cannot ad-hoc sign."
      );
    }
    return;
  }

  installCodesignRetryPatch();
  return signAsync(opts);
};
