#!/bin/bash

# 测试 knowledgeMode 功能的脚本

API_BASE="http://localhost:3001/api"

echo "🚀 开始测试 knowledgeMode 功能"
echo ""

# 1. 检查是否是多用户模式
echo "📝 测试 1: 检查系统模式"
MULTI_USER_RESPONSE=$(curl -s "${API_BASE}/system/multi-user-mode")
IS_MULTI_USER=$(echo $MULTI_USER_RESPONSE | grep -o '"multiUserMode":[^,}]*' | cut -d':' -f2)

echo "多用户模式: $IS_MULTI_USER"
echo ""

# 2. 登录获取 token
echo "📝 测试 2: 登录"

if [ "$IS_MULTI_USER" = "true" ]; then
  # 多用户模式：需要 username + password
  echo "使用多用户模式登录（username + password）"
  echo "请输入用户名（默认: admin）:"
  read -r USERNAME
  USERNAME=${USERNAME:-admin}

  echo "请输入密码:"
  read -rs PASSWORD

  LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/request-token" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
else
  # 单用户模式：只需要 password
  echo "使用单用户模式登录（仅 password）"
  echo "请输入密码（默认: password）:"
  read -rs PASSWORD
  PASSWORD=${PASSWORD:-password}

  LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/request-token" \
    -H "Content-Type: application/json" \
    -d "{\"password\":\"$PASSWORD\"}")
fi

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ 登录失败"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ 登录成功"
echo ""

# 2. 创建 workspace 模式助手模板
echo "📝 测试 2: 创建 workspace 模式助手模板"
CREATE_WORKSPACE_RESPONSE=$(curl -s -X POST "${API_BASE}/assistant-library/templates" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "测试助手 - Workspace 模式",
    "description": "这是一个测试助手，使用 workspace 知识模式",
    "category": "测试",
    "knowledgeModeTemplate": "workspace"
  }')

echo "$CREATE_WORKSPACE_RESPONSE" | jq '.'
WORKSPACE_TEMPLATE_ID=$(echo $CREATE_WORKSPACE_RESPONSE | jq -r '.data.id')
echo ""

# 3. 创建 none 模式助手模板
echo "📝 测试 3: 创建 none 模式助手模板"
CREATE_NONE_RESPONSE=$(curl -s -X POST "${API_BASE}/assistant-library/templates" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "测试助手 - None 模式",
    "description": "这是一个测试助手，使用 none 知识模式（仅对话+工具）",
    "category": "测试",
    "knowledgeModeTemplate": "none"
  }')

echo "$CREATE_NONE_RESPONSE" | jq '.'
NONE_TEMPLATE_ID=$(echo $CREATE_NONE_RESPONSE | jq -r '.data.id')
echo ""

# 4. 尝试创建无效模式助手模板（应该失败）
echo "📝 测试 4: 创建无效模式助手模板（应该失败）"
CREATE_INVALID_RESPONSE=$(curl -s -X POST "${API_BASE}/assistant-library/templates" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "测试助手 - 无效模式",
    "description": "这应该失败",
    "category": "测试",
    "knowledgeModeTemplate": "invalid_mode"
  }')

echo "$CREATE_INVALID_RESPONSE" | jq '.'
echo ""

# 5. 获取第一个 workspace
echo "📝 测试 5: 获取第一个 workspace"
WORKSPACES_RESPONSE=$(curl -s -X GET "${API_BASE}/workspaces" \
  -H "Authorization: Bearer $TOKEN")

WORKSPACE_SLUG=$(echo $WORKSPACES_RESPONSE | jq -r '.workspaces[0].slug')

if [ -z "$WORKSPACE_SLUG" ] || [ "$WORKSPACE_SLUG" = "null" ]; then
  echo "❌ 没有找到 workspace"
  exit 1
fi

echo "✅ 找到 workspace: $WORKSPACE_SLUG"
echo ""

# 6. 安装 workspace 模式助手
if [ ! -z "$WORKSPACE_TEMPLATE_ID" ] && [ "$WORKSPACE_TEMPLATE_ID" != "null" ]; then
  echo "📝 测试 6: 安装 workspace 模式助手"
  INSTALL_WORKSPACE_RESPONSE=$(curl -s -X POST "${API_BASE}/assistant-library/install" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"templateId\": \"$WORKSPACE_TEMPLATE_ID\",
      \"workspaceSlug\": \"$WORKSPACE_SLUG\",
      \"instanceName\": \"我的 Workspace 测试助手\"
    }")

  echo "$INSTALL_WORKSPACE_RESPONSE" | jq '.'
  WORKSPACE_INSTANCE_ID=$(echo $INSTALL_WORKSPACE_RESPONSE | jq -r '.data.instanceId')
  echo ""
fi

# 7. 安装 none 模式助手
if [ ! -z "$NONE_TEMPLATE_ID" ] && [ "$NONE_TEMPLATE_ID" != "null" ]; then
  echo "📝 测试 7: 安装 none 模式助手"
  INSTALL_NONE_RESPONSE=$(curl -s -X POST "${API_BASE}/assistant-library/install" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
      \"templateId\": \"$NONE_TEMPLATE_ID\",
      \"workspaceSlug\": \"$WORKSPACE_SLUG\",
      \"instanceName\": \"我的 None 测试助手\"
    }")

  echo "$INSTALL_NONE_RESPONSE" | jq '.'
  NONE_INSTANCE_ID=$(echo $INSTALL_NONE_RESPONSE | jq -r '.data.instanceId')
  echo ""
fi

# 8. 测试更新助手的 knowledgeModeOverride
if [ ! -z "$WORKSPACE_INSTANCE_ID" ] && [ "$WORKSPACE_INSTANCE_ID" != "null" ]; then
  echo "📝 测试 8: 更新助手的 knowledgeModeOverride 为 none"
  UPDATE_RESPONSE=$(curl -s -X PATCH "${API_BASE}/workspace/${WORKSPACE_SLUG}/assistants/${WORKSPACE_INSTANCE_ID}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "knowledgeModeOverride": "none"
    }')

  echo "$UPDATE_RESPONSE" | jq '.'
  echo ""
fi

# 9. 列出 workspace 的所有助手
echo "📝 测试 9: 列出 workspace 的所有助手"
LIST_ASSISTANTS_RESPONSE=$(curl -s -X GET "${API_BASE}/workspace/${WORKSPACE_SLUG}/assistants" \
  -H "Authorization: Bearer $TOKEN")

echo "$LIST_ASSISTANTS_RESPONSE" | jq '.'
echo ""

echo "✅ 所有测试完成！"
echo ""
echo "下一步："
echo "1. 在前端查看助手库，确认新创建的助手"
echo "2. 在 workspace 设置中查看已安装的助手"
echo "3. 发起聊天，观察日志中的 [Chat] Knowledge mode: xxx 输出"

