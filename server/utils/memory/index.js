/**
 * Platform 模式知识交互模块
 *
 * 提供对话摘要、响应捕获、反馈收集、经验记忆、工作记忆等功能
 */

const { ConversationSummarizer } = require("./conversationSummarizer");
const { PlatformResponseCapture } = require("./platformResponseCapture");
const { FeedbackCollector } = require("./feedbackCollector");
const { ExperienceMemory } = require("./experienceMemory");
const {
  WorkingMemory,
  SCHEMA_VERSION,
  DEFAULT_ANCHORED_CONTEXT,
} = require("./workingMemory");
const { EpisodeDetector, DETECTION_CONFIG } = require("./episodeDetector");
const { PIIFilter, PII_TYPES, PII_PATTERNS } = require("./piiFilter");

module.exports = {
  ConversationSummarizer,
  PlatformResponseCapture,
  FeedbackCollector,
  ExperienceMemory,
  WorkingMemory,
  SCHEMA_VERSION,
  DEFAULT_ANCHORED_CONTEXT,
  EpisodeDetector,
  DETECTION_CONFIG,
  PIIFilter,
  PII_TYPES,
  PII_PATTERNS,
};
