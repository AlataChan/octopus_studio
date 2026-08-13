"use strict";

class NoVideoProviderError extends Error {
  constructor(message = "No video understanding provider is configured.") {
    super(message);
    this.name = "NoVideoProviderError";
    this.code = "NO_VIDEO_PROVIDER";
  }
}

module.exports = { NoVideoProviderError };
