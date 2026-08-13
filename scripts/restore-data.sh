#!/bin/bash
# Alata Studio 数据恢复脚本
# 用途：从备份文件恢复数据
# 使用方法：./scripts/restore-data.sh <backup-file.tar.gz>

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查参数
if [ $# -eq 0 ]; then
  echo -e "${RED}❌ 错误：请指定备份文件${NC}"
  echo -e "使用方法: $0 <backup-file.tar.gz>"
  exit 1
fi

BACKUP_FILE="$1"
STORAGE_DIR="${STORAGE_DIR:-./server/storage}"
TEMP_DIR=$(mktemp -d)

# 检查备份文件是否存在
if [ ! -f "${BACKUP_FILE}" ]; then
  echo -e "${RED}❌ 错误：备份文件不存在: ${BACKUP_FILE}${NC}"
  exit 1
fi

echo -e "${YELLOW}⚠️  警告：此操作将覆盖现有数据！${NC}"
echo -e "备份文件: ${BACKUP_FILE}"
echo -e "目标目录: ${STORAGE_DIR}"
read -p "确认继续？(yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo -e "${YELLOW}❌ 已取消恢复操作${NC}"
  exit 0
fi

echo -e "\n${GREEN}🔄 开始恢复数据...${NC}\n"

# 1. 解压备份文件
echo -e "${YELLOW}📦 解压备份文件...${NC}"
tar xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"
BACKUP_DIR=$(ls -d ${TEMP_DIR}/alata-backup-* | head -n 1)

if [ ! -d "${BACKUP_DIR}" ]; then
  echo -e "${RED}❌ 错误：无效的备份文件格式${NC}"
  rm -rf "${TEMP_DIR}"
  exit 1
fi

# 2. 停止服务（如果正在运行）
echo -e "${YELLOW}⏸️  停止服务...${NC}"
if pgrep -f "node.*server/index.js" > /dev/null; then
  pkill -f "node.*server/index.js" || true
  sleep 2
fi

# 3. 备份当前数据（以防万一）
if [ -d "${STORAGE_DIR}" ]; then
  echo -e "${YELLOW}💾 备份当前数据...${NC}"
  CURRENT_BACKUP="${STORAGE_DIR}_backup_$(date +%Y%m%d_%H%M%S)"
  cp -r "${STORAGE_DIR}" "${CURRENT_BACKUP}"
  echo -e "${GREEN}✅ 当前数据已备份到: ${CURRENT_BACKUP}${NC}"
fi

# 4. 恢复数据库
echo -e "${YELLOW}📦 恢复数据库...${NC}"
if [ -f "${BACKUP_DIR}/anythingllm.db" ]; then
  cp "${BACKUP_DIR}/anythingllm.db" "${STORAGE_DIR}/"
  echo -e "${GREEN}✅ 数据库恢复完成${NC}"
fi

# 5. 恢复文档
echo -e "${YELLOW}📄 恢复文档...${NC}"
if [ -d "${BACKUP_DIR}/documents" ]; then
  rm -rf "${STORAGE_DIR}/documents"
  cp -r "${BACKUP_DIR}/documents" "${STORAGE_DIR}/"
  echo -e "${GREEN}✅ 文档恢复完成${NC}"
fi

# 6. 恢复向量数据库
echo -e "${YELLOW}🗄️  恢复向量数据库...${NC}"
if [ -d "${BACKUP_DIR}/lancedb" ]; then
  rm -rf "${STORAGE_DIR}/lancedb"
  cp -r "${BACKUP_DIR}/lancedb" "${STORAGE_DIR}/"
  echo -e "${GREEN}✅ 向量数据库恢复完成${NC}"
fi

# 7. 恢复资源文件
echo -e "${YELLOW}🎨 恢复资源文件...${NC}"
if [ -d "${BACKUP_DIR}/assets" ]; then
  rm -rf "${STORAGE_DIR}/assets"
  cp -r "${BACKUP_DIR}/assets" "${STORAGE_DIR}/"
  echo -e "${GREEN}✅ 资源文件恢复完成${NC}"
fi

# 8. 恢复插件配置
echo -e "${YELLOW}🔌 恢复插件配置...${NC}"
if [ -d "${BACKUP_DIR}/plugins" ]; then
  rm -rf "${STORAGE_DIR}/plugins"
  cp -r "${BACKUP_DIR}/plugins" "${STORAGE_DIR}/"
  echo -e "${GREEN}✅ 插件配置恢复完成${NC}"
fi

# 9. 清理临时文件
rm -rf "${TEMP_DIR}"

# 完成
echo -e "\n${GREEN}✅ 数据恢复完成！${NC}"
echo -e "\n${YELLOW}💡 下一步：${NC}"
echo -e "   1. 启动服务: yarn dev:server"
echo -e "   2. 检查数据是否正常"
echo -e "   3. 如有问题，可从备份恢复: ${CURRENT_BACKUP}"

