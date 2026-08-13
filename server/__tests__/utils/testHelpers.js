/**
 * 测试辅助函数
 * 提供常用的测试工具和 mock 数据
 */

/**
 * 创建模拟的 Express 请求对象
 * @param {Object} overrides - 覆盖默认值
 * @returns {Object} - 模拟请求对象
 */
function mockRequest(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ip: "127.0.0.1",
    user: null,
    requestId: "test-request-id",
    ...overrides,
  };
}

/**
 * 创建模拟的 Express 响应对象
 * 支持事件发射（用于测试并发限制等场景）
 * @returns {Object} - 模拟响应对象及断言方法
 */
function mockResponse() {
  // 事件监听器存储
  const eventListeners = {};

  const res = {
    statusCode: 200,
    data: null,
    headers: {},
  };

  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });

  res.json = jest.fn((data) => {
    res.data = data;
    return res;
  });

  res.send = jest.fn((data) => {
    res.data = data;
    return res;
  });

  res.sendStatus = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });

  res.setHeader = jest.fn((key, value) => {
    res.headers[key] = value;
    return res;
  });

  res.end = jest.fn(() => res);

  // 添加事件监听支持
  res.on = jest.fn((event, callback) => {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(callback);
    return res;
  });

  // 添加事件发射支持
  res.emit = jest.fn((event, ...args) => {
    if (eventListeners[event]) {
      eventListeners[event].forEach((callback) => callback(...args));
    }
    return res;
  });

  return res;
}

/**
 * 创建模拟的 next 函数
 * @returns {Function} - Jest mock 函数
 */
function mockNext() {
  return jest.fn();
}

/**
 * 等待指定毫秒数
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 生成随机字符串
 * @param {number} length - 字符串长度
 * @returns {string} - 随机字符串
 */
function randomString(length = 8) {
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * 创建模拟用户数据
 * @param {Object} overrides - 覆盖默认值
 * @returns {Object} - 用户数据
 */
function mockUserData(overrides = {}) {
  return {
    id: Math.floor(Math.random() * 10000),
    username: `testuser_${randomString(4)}`,
    password: "$2b$10$hashedpassword",
    role: "default",
    suspended: 0,
    seen_recovery_codes: true,
    dailyMessageLimit: 25,
    ...overrides,
  };
}

/**
 * 创建模拟工作空间数据
 * @param {Object} overrides - 覆盖默认值
 * @returns {Object} - 工作空间数据
 */
function mockWorkspaceData(overrides = {}) {
  return {
    id: Math.floor(Math.random() * 10000),
    name: `Test Workspace ${randomString(4)}`,
    slug: `test-workspace-${randomString(4)}`,
    vectorTag: null,
    createdAt: new Date(),
    openAiTemp: null,
    openAiHistory: 20,
    ...overrides,
  };
}

module.exports = {
  mockRequest,
  mockResponse,
  mockNext,
  delay,
  randomString,
  mockUserData,
  mockWorkspaceData,
};

