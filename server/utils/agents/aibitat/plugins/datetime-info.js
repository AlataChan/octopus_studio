/**
 * datetime-info Tool
 * 提供实时日期时间信息，解决 LLM 训练数据截止时间问题
 * 系统级工具 - 所有 AI 员工默认可用
 */

const datetimeInfo = {
  name: "datetime-info",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description: `获取当前实时日期和时间信息。这是一个系统级工具，用于获取准确的当前时间。
支持的操作：
- now: 获取当前日期时间（默认）
- date: 仅获取当前日期
- time: 仅获取当前时间
- timestamp: 获取 Unix 时间戳
- week: 获取当前是第几周、星期几
- timezone: 获取指定时区的时间`,
          examples: [
            {
              prompt: "今天是几号？",
              call: JSON.stringify({ action: "date" }),
            },
            {
              prompt: "现在几点了？",
              call: JSON.stringify({ action: "time" }),
            },
            {
              prompt: "今天星期几？",
              call: JSON.stringify({ action: "week" }),
            },
            {
              prompt: "纽约现在几点？",
              call: JSON.stringify({
                action: "timezone",
                timezone: "America/New_York",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["now", "date", "time", "timestamp", "week", "timezone"],
                description: "要执行的时间操作类型，默认为 now",
                default: "now",
              },
              timezone: {
                type: "string",
                description:
                  "时区标识符，如 Asia/Shanghai, America/New_York, Europe/London",
              },
              format: {
                type: "string",
                description: "自定义日期时间格式，如 YYYY-MM-DD HH:mm:ss",
              },
            },
            additionalProperties: false,
          },
          handler: async function ({ action = "now", timezone, format }) {
            try {
              const now = new Date();
              const tz = timezone || "Asia/Shanghai"; // 默认中国时区

              // 格式化选项
              const dateOptions = {
                timeZone: tz,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              };
              const timeOptions = {
                timeZone: tz,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              };
              const fullOptions = {
                timeZone: tz,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
                weekday: "long",
              };

              switch (action) {
                case "date": {
                  const dateStr = now.toLocaleDateString("zh-CN", dateOptions);
                  return JSON.stringify({
                    success: true,
                    date: dateStr,
                    iso: now.toISOString().split("T")[0],
                    timezone: tz,
                  });
                }

                case "time": {
                  const timeStr = now.toLocaleTimeString("zh-CN", timeOptions);
                  return JSON.stringify({
                    success: true,
                    time: timeStr,
                    timezone: tz,
                  });
                }

                case "timestamp": {
                  return JSON.stringify({
                    success: true,
                    timestamp: Math.floor(now.getTime() / 1000),
                    timestampMs: now.getTime(),
                    iso: now.toISOString(),
                  });
                }

                case "week": {
                  const weekday = now.toLocaleDateString("zh-CN", {
                    timeZone: tz,
                    weekday: "long",
                  });
                  const startOfYear = new Date(now.getFullYear(), 0, 1);
                  const days = Math.floor(
                    (now - startOfYear) / (24 * 60 * 60 * 1000)
                  );
                  const weekNumber = Math.ceil(
                    (days + startOfYear.getDay() + 1) / 7
                  );
                  return JSON.stringify({
                    success: true,
                    weekday: weekday,
                    weekNumber: weekNumber,
                    dayOfYear: days + 1,
                    timezone: tz,
                  });
                }

                case "timezone": {
                  const fullStr = now.toLocaleString("zh-CN", fullOptions);
                  return JSON.stringify({
                    success: true,
                    datetime: fullStr,
                    timezone: tz,
                    utcOffset: this.getUTCOffset(now, tz),
                  });
                }

                case "now":
                default: {
                  const fullStr = now.toLocaleString("zh-CN", fullOptions);
                  return JSON.stringify({
                    success: true,
                    datetime: fullStr,
                    date: now.toLocaleDateString("zh-CN", dateOptions),
                    time: now.toLocaleTimeString("zh-CN", timeOptions),
                    iso: now.toISOString(),
                    timestamp: Math.floor(now.getTime() / 1000),
                    timezone: tz,
                  });
                }
              }
            } catch (error) {
              return JSON.stringify({
                success: false,
                error: error.message,
              });
            }
          },

          // 获取 UTC 偏移量
          getUTCOffset: function (date, timeZone) {
            const utcDate = new Date(
              date.toLocaleString("en-US", { timeZone: "UTC" })
            );
            const tzDate = new Date(date.toLocaleString("en-US", { timeZone }));
            const offset = (tzDate - utcDate) / (60 * 60 * 1000);
            const sign = offset >= 0 ? "+" : "-";
            const hours = Math.abs(Math.floor(offset));
            const minutes = Math.abs((offset % 1) * 60);
            return `UTC${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
          },
        });
      },
    };
  },
};

module.exports = { datetimeInfo };
