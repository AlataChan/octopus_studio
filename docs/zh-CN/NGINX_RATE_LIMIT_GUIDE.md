# Nginx 层限流配置指南

本文档提供在 Nginx 层配置 API 限流的最佳实践，适用于 Alata Studio 企业私有化部署场景。

## 为什么推荐 Nginx 层限流？

| 维度 | 应用层限流 | Nginx 层限流 |
|------|-----------|-------------|
| **性能** | 请求进入应用后处理 | 在网络入口直接拦截 |
| **资源消耗** | 消耗应用服务器资源 | 独立于应用，更轻量 |
| **灵活性** | 需要修改代码 | 配置文件即可调整 |
| **分布式支持** | 需要 Redis | 天然支持（共享内存） |

> **注意**：Alata Studio 应用层已有基础限流保护，Nginx 层限流是**额外的安全层**，两者可以共存。

## 基础配置

### 1. 定义限流区域

在 `nginx.conf` 的 `http` 块中添加：

```nginx
http {
    # 通用 API 限流：每个 IP 每秒 20 个请求
    limit_req_zone $binary_remote_addr zone=api_general:10m rate=20r/s;
    
    # 认证接口限流：每个 IP 每秒 1 个请求（防暴力破解）
    limit_req_zone $binary_remote_addr zone=api_auth:10m rate=1r/s;
    
    # 聊天接口限流：每个 IP 每分钟 10 个请求（保护 LLM 配额）
    limit_req_zone $binary_remote_addr zone=api_chat:10m rate=10r/m;
    
    # 敏感操作限流：每个 IP 每分钟 5 个请求
    limit_req_zone $binary_remote_addr zone=api_strict:10m rate=5r/m;

    # ... 其他配置
}
```

**参数说明**：
- `$binary_remote_addr`：基于客户端 IP 进行限流
- `zone=名称:大小`：共享内存区域名称和大小（10m 约可存储 16 万个 IP 状态）
- `rate=Nr/s` 或 `rate=Nr/m`：每秒/每分钟允许的请求数

### 2. 应用限流规则

在 `server` 块中应用限流：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 通用 API 限流
    location /api/ {
        limit_req zone=api_general burst=50 nodelay;
        limit_req_status 429;
        
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 认证接口限流（更严格）
    location /api/v1/system/local-auth-check {
        limit_req zone=api_auth burst=5;
        limit_req_status 429;
        
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 聊天接口限流
    location ~ ^/workspace/[^/]+/stream-chat$ {
        limit_req zone=api_chat burst=5;
        limit_req_status 429;
        
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # SSE 流式响应配置
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    # 敏感操作限流（密码重置、邀请生成等）
    location ~ ^/api/v1/(invite|admin/reset-password) {
        limit_req zone=api_strict burst=2;
        limit_req_status 429;
        
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 静态资源（无限流）
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**参数说明**：
- `burst=N`：允许的突发请求数（超过 rate 但在 burst 内的请求会排队）
- `nodelay`：突发请求不排队，直接处理（适合高并发场景）
- `limit_req_status 429`：超限时返回 HTTP 429 状态码

## 自定义错误页面

为限流返回友好的 JSON 响应：

```nginx
# 在 server 块中添加
error_page 429 = @rate_limit_error;

location @rate_limit_error {
    default_type application/json;
    return 429 '{"success": false, "error": "请求过于频繁，请稍后再试", "code": "RATE_LIMIT_EXCEEDED"}';
}
```

## 日志配置

记录被限流的请求便于排查：

```nginx
http {
    # 定义限流日志格式
    log_format rate_limit '$remote_addr - $remote_user [$time_local] '
                          '"$request" $status $body_bytes_sent '
                          '"$http_referer" "$http_user_agent" '
                          'limit_req_status=$limit_req_status';
    
    # 记录限流日志
    access_log /var/log/nginx/rate_limit.log rate_limit if=$limit_req_status;
}
```

## 验证配置

```bash
# 检查配置语法
sudo nginx -t

# 重新加载配置
sudo nginx -s reload

# 测试限流效果（快速发送请求）
for i in {1..30}; do curl -s -o /dev/null -w "%{http_code}\n" http://localhost/api/health; done
```

## 常见问题

### Q: 企业内网用户会互相影响吗？

不会。私有化部署时，每个员工有独立的内网 IP，限流独立计算。

### Q: 如何区分不同用户？

Nginx 默认基于 IP 限流。如需基于用户 ID 限流，可使用 `$http_authorization` 或自定义变量，但通常 IP 限流已足够。

### Q: 与应用层限流冲突吗？

不冲突。Nginx 层是第一道防线（网络层），应用层是第二道防线（业务层），两者互补。

## 推荐配置参数

| 接口类型 | Nginx 配置 | 应用层配置 | 说明 |
|---------|-----------|-----------|------|
| 通用 API | 20r/s, burst=50 | 100/5min | 双重保护 |
| 认证接口 | 1r/s, burst=5 | 10/15min（仅失败） | 防暴力破解 |
| 聊天接口 | 10r/m, burst=5 | 10/min + 5 并发 | 保护 LLM 配额 |
| 敏感操作 | 5r/m, burst=2 | 5/hour | 严格限制 |

