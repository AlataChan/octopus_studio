#!/bin/bash
# Alata Studio 数据备份脚本
# 用途：自动备份数据库、文档、向量库等关键数据
# 使用方法：./scripts/backup-data.sh [backup-dir]

set -e

# 配置
BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="alata-backup-${TIMESTAMP}"
STORAGE_DIR="${STORAGE_DIR:-./server/storage}"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔄 开始备份 Alata Studio 数据...${NC}\n"

# 创建备份目录
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}"

# 1. 备份数据库
echo -e "${YELLOW}📦 备份数据库...${NC}"
if [ -f "${STORAGE_DIR}/anythingllm.db" ]; then
  cp "${STORAGE_DIR}/anythingllm.db" "${BACKUP_DIR}/${BACKUP_NAME}/"
  echo -e "${GREEN}✅ 数据库备份完成${NC}"
else
  echo -e "${RED}❌ 数据库文件不存在${NC}"
fi

# 2. 备份文档
echo -e "${YELLOW}📄 备份文档...${NC}"
if [ -d "${STORAGE_DIR}/documents" ]; then
  cp -r "${STORAGE_DIR}/documents" "${BACKUP_DIR}/${BACKUP_NAME}/"
  echo -e "${GREEN}✅ 文档备份完成${NC}"
else
  echo -e "${YELLOW}⚠️  文档目录不存在，跳过${NC}"
fi

# 3. 备份向量数据库
echo -e "${YELLOW}🗄️  备份向量数据库...${NC}"
if [ -d "${STORAGE_DIR}/lancedb" ]; then
  cp -r "${STORAGE_DIR}/lancedb" "${BACKUP_DIR}/${BACKUP_NAME}/"
  echo -e "${GREEN}✅ 向量数据库备份完成${NC}"
else
  echo -e "${YELLOW}⚠️  向量数据库目录不存在，跳过${NC}"
fi

# 4. 备份资源文件
echo -e "${YELLOW}🎨 备份资源文件...${NC}"
if [ -d "${STORAGE_DIR}/assets" ]; then
  cp -r "${STORAGE_DIR}/assets" "${BACKUP_DIR}/${BACKUP_NAME}/"
  echo -e "${GREEN}✅ 资源文件备份完成${NC}"
else
  echo -e "${YELLOW}⚠️  资源目录不存在，跳过${NC}"
fi

# 5. 备份插件配置
echo -e "${YELLOW}🔌 备份插件配置...${NC}"
if [ -d "${STORAGE_DIR}/plugins" ]; then
  cp -r "${STORAGE_DIR}/plugins" "${BACKUP_DIR}/${BACKUP_NAME}/"
  echo -e "${GREEN}✅ 插件配置备份完成${NC}"
else
  echo -e "${YELLOW}⚠️  插件目录不存在，跳过${NC}"
fi

# 6. 压缩备份
echo -e "${YELLOW}🗜️  压缩备份文件...${NC}"
cd "${BACKUP_DIR}"
tar czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${BACKUP_NAME}"
cd - > /dev/null

# 7. 清理旧备份（保留最近 7 天）
echo -e "${YELLOW}🧹 清理旧备份...${NC}"
find "${BACKUP_DIR}" -name "alata-backup-*.tar.gz" -mtime +7 -delete

# 完成
BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)
echo -e "\n${GREEN}✅ 备份完成！${NC}"
echo -e "📦 备份文件: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo -e "📊 备份大小: ${BACKUP_SIZE}"
echo -e "\n${YELLOW}💡 恢复方法：${NC}"
echo -e "   tar xzf ${BACKUP_NAME}.tar.gz"
echo -e "   cp -r ${BACKUP_NAME}/* ${STORAGE_DIR}/"

