process.env.NODE_ENV === "development"
  ? require("dotenv").config({ path: `.env.${process.env.NODE_ENV}` })
  : require("dotenv").config();
const JWT = require("jsonwebtoken");
const { User } = require("../../models/user");
const { jsonrepair } = require("jsonrepair");
const extract = require("extract-json-from-string");

function reqBody(request) {
  return typeof request.body === "string"
    ? JSON.parse(request.body)
    : request.body;
}

function queryParams(request) {
  return request.query;
}

/**
 * Creates a JWT with the given info and expiry
 * @param {object} info - The info to include in the JWT
 * @param {string} expiry - The expiry time for the JWT (default: 30 days)
 * @returns {string} The JWT
 */
function makeJWT(info = {}, expiry = "30d") {
  if (!process.env.JWT_SECRET)
    throw new Error("Cannot create JWT as JWT_SECRET is unset.");
  return JWT.sign(info, process.env.JWT_SECRET, { expiresIn: expiry });
}

// Note: Only valid for finding users in multi-user mode
// as single-user mode with password is not a "user"
async function userFromSession(request, response = null) {
  if (!!response && !!response.locals?.user) {
    return response.locals.user;
  }

  const auth = request.header("Authorization");
  const token = auth ? auth.split(" ")[1] : null;

  if (!token) {
    return null;
  }

  const valid = decodeJWT(token);
  if (!valid || !valid.id) {
    return null;
  }

  const user = await User.get({ id: valid.id });
  return user;
}

function decodeJWT(jwtToken) {
  try {
    return JWT.verify(jwtToken, process.env.JWT_SECRET);
  } catch {}
  return { p: null, id: null, username: null };
}

function multiUserMode(response) {
  return response?.locals?.multiUserMode;
}

function parseAuthHeader(headerValue = null, apiKey = null) {
  if (headerValue === null || apiKey === null) return {};
  if (headerValue === "Authorization")
    return { Authorization: `Bearer ${apiKey}` };
  return { [headerValue]: apiKey };
}

/**
 * 安全地解析 JSON 字符串，支持多种容错处理
 * @param {any} jsonString - 待解析的 JSON 字符串，也可能已是对象/数组
 * @param {any} fallback - 解析失败时返回的默认值
 * @returns {any} 解析后的对象/数组，或 fallback
 */
function safeJsonParse(jsonString, fallback = null) {
  // 处理 null 和 undefined
  if (jsonString === null || jsonString === undefined) return fallback;

  // 如果已经是对象或数组，直接返回（防御性处理，避免对非字符串调用字符串方法）
  if (typeof jsonString !== "string") {
    return jsonString;
  }

  // 空字符串返回 fallback
  if (jsonString.trim() === "") return fallback;

  // 尝试直接解析
  try {
    return JSON.parse(jsonString);
  } catch {}

  // 尝试使用 jsonrepair 修复后解析
  if (jsonString.startsWith("[") || jsonString.startsWith("{")) {
    try {
      const repairedJson = jsonrepair(jsonString);
      return JSON.parse(repairedJson);
    } catch {}
  }

  // 尝试从文本中提取 JSON
  try {
    return extract(jsonString)?.[0] || fallback;
  } catch {}

  return fallback;
}

function isValidUrl(urlString = "") {
  try {
    const url = new URL(urlString);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    return true;
  } catch (e) {}
  return false;
}

function toValidNumber(number = null, fallback = null) {
  if (isNaN(Number(number))) return fallback;
  return Number(number);
}

module.exports = {
  reqBody,
  multiUserMode,
  queryParams,
  makeJWT,
  decodeJWT,
  userFromSession,
  parseAuthHeader,
  safeJsonParse,
  isValidUrl,
  toValidNumber,
};
