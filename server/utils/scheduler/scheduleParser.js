/**
 * @fileoverview 自然语言时间解析器
 * 将用户输入的时间描述转换为 cron 表达式或具体时间
 *
 * @example
 * parseNaturalLanguageSchedule("每天早上9点")
 * // => { type: "cron", cronExpression: "0 9 * * *" }
 *
 * parseNaturalLanguageSchedule("3小时后")
 * // => { type: "once", executeAt: Date }
 */

/**
 * 中文数字映射
 */
const CHINESE_NUMBERS = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
};

/**
 * 星期映射
 */
const WEEKDAY_MAP = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
  周一: 1,
  周二: 2,
  周三: 3,
  周四: 4,
  周五: 5,
  周六: 6,
  周日: 0,
  星期一: 1,
  星期二: 2,
  星期三: 3,
  星期四: 4,
  星期五: 5,
  星期六: 6,
  星期日: 0,
  星期天: 0,
};

/**
 * 解析自然语言时间描述
 * @param {string} input - 用户输入的时间描述
 * @returns {Object|null} 调度配置
 */
function parseNaturalLanguageSchedule(input) {
  if (!input || typeof input !== "string") {
    return null;
  }

  const text = input.trim();

  // 1. 尝试解析"X分钟/小时/天后"格式（一次性任务）
  const onceResult = parseOnceSchedule(text);
  if (onceResult) return onceResult;

  // 2. 尝试解析"每X分钟/小时"格式（间隔任务）
  const intervalResult = parseIntervalSchedule(text);
  if (intervalResult) return intervalResult;

  // 3. 尝试解析"每天/每周X"格式（cron 任务）
  const cronResult = parseCronSchedule(text);
  if (cronResult) return cronResult;

  return null;
}

/**
 * 解析一次性任务（X分钟/小时/天后）
 */
function parseOnceSchedule(text) {
  // 匹配：30分钟后、3小时后、2天后、半小时后
  const patterns = [
    /(\d+)\s*分钟后/,
    /(\d+)\s*小时后/,
    /(\d+)\s*天后/,
    /半小时后/,
    /半天后/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let delayMs;
      if (pattern.source.includes("分钟")) {
        delayMs = parseInt(match[1]) * 60 * 1000;
      } else if (pattern.source.includes("小时")) {
        delayMs = parseInt(match[1]) * 60 * 60 * 1000;
      } else if (pattern.source.includes("天")) {
        delayMs = parseInt(match[1]) * 24 * 60 * 60 * 1000;
      } else if (pattern.source.includes("半小时")) {
        delayMs = 30 * 60 * 1000;
      } else if (pattern.source.includes("半天")) {
        delayMs = 12 * 60 * 60 * 1000;
      }

      if (delayMs) {
        return {
          type: "once",
          executeAt: new Date(Date.now() + delayMs),
        };
      }
    }
  }

  return null;
}

/**
 * 解析间隔任务（每X分钟/小时）
 */
function parseIntervalSchedule(text) {
  // 匹配：每30分钟、每2小时、每半小时
  const patterns = [
    { regex: /每(\d+)分钟/, unit: "minutes" },
    { regex: /每(\d+)小时/, unit: "hours" },
    { regex: /每半小时/, unit: "half-hour" },
  ];

  for (const { regex, unit } of patterns) {
    const match = text.match(regex);
    if (match || (unit === "half-hour" && text.includes("每半小时"))) {
      let intervalMinutes;
      if (unit === "minutes") {
        intervalMinutes = parseInt(match[1]);
      } else if (unit === "hours") {
        intervalMinutes = parseInt(match[1]) * 60;
      } else if (unit === "half-hour") {
        intervalMinutes = 30;
      }

      if (intervalMinutes && intervalMinutes > 0) {
        return {
          type: "interval",
          intervalMinutes,
        };
      }
    }
  }

  return null;
}

/**
 * 解析 cron 任务（每天/每周X + 时间）
 */
function parseCronSchedule(text) {
  // 提取时间（默认 9:00）
  let hour = 9;
  let minute = 0;

  // 匹配时间：早上9点、下午3点、晚上8点、9:30、14点
  const timePatterns = [
    { regex: /早[上晨]?\s*(\d{1,2})[点时]/, offset: 0 },
    { regex: /上午\s*(\d{1,2})[点时]/, offset: 0 },
    { regex: /中午\s*(\d{1,2})[点时]/, offset: 0 },
    { regex: /下午\s*(\d{1,2})[点时]/, offset: 12 },
    { regex: /晚[上间]?\s*(\d{1,2})[点时]/, offset: 12 },
    { regex: /(\d{1,2})[点时](\d{1,2})?分?/, offset: 0 },
    { regex: /(\d{1,2}):(\d{2})/, offset: 0 },
  ];

  for (const { regex, offset } of timePatterns) {
    const match = text.match(regex);
    if (match) {
      hour = parseInt(match[1]);
      if (hour < 12 && offset > 0) {
        hour += offset;
      }
      if (match[2]) {
        minute = parseInt(match[2]);
      }
      break;
    }
  }

  // 确保小时在有效范围内
  hour = Math.max(0, Math.min(23, hour));
  minute = Math.max(0, Math.min(59, minute));

  // 判断周期类型
  // 每天
  if (text.includes("每天") || text.includes("每日")) {
    return {
      type: "cron",
      cronExpression: `${minute} ${hour} * * *`,
    };
  }

  // 每周X
  for (const [key, dayNum] of Object.entries(WEEKDAY_MAP)) {
    if (text.includes(`每${key}`) || text.includes(`每周${key}`)) {
      return {
        type: "cron",
        cronExpression: `${minute} ${hour} * * ${dayNum}`,
      };
    }
  }

  // 每月X号
  const monthDayMatch = text.match(/每月(\d{1,2})[号日]/);
  if (monthDayMatch) {
    const day = parseInt(monthDayMatch[1]);
    if (day >= 1 && day <= 31) {
      return {
        type: "cron",
        cronExpression: `${minute} ${hour} ${day} * *`,
      };
    }
  }

  // 工作日
  if (text.includes("工作日") || text.includes("周一到周五")) {
    return {
      type: "cron",
      cronExpression: `${minute} ${hour} * * 1-5`,
    };
  }

  // 周末
  if (text.includes("周末")) {
    return {
      type: "cron",
      cronExpression: `${minute} ${hour} * * 0,6`,
    };
  }

  // 如果只有时间没有周期，默认每天
  if (text.match(/\d{1,2}[点时:]/)) {
    return {
      type: "cron",
      cronExpression: `${minute} ${hour} * * *`,
    };
  }

  return null;
}

module.exports = {
  parseNaturalLanguageSchedule,
  CHINESE_NUMBERS,
  WEEKDAY_MAP,
};
