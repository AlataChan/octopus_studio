# PaddleOCR Service

为 Alata Studio 提供高精度 OCR 能力的 Python 服务。

## 特性

- 🎯 **高精度**：基于 PaddleOCR 3.x，支持中英文混合识别
- 🚀 **按需加载**：模型不自动下载，用户触发时才下载（约 400MB）
- 🔄 **RESTful API**：标准 HTTP 接口，易于集成
- 📊 **健康检查**：内置 /health 端点，便于监控

## 快速开始

### 1. 安装

```bash
cd services/paddleocr-service
chmod +x setup.sh start.sh
./setup.sh
```

### 2. 启动服务

```bash
./start.sh
# 或指定端口
./start.sh 8867
```

### 3. 下载模型（首次使用）

```bash
curl -X POST http://127.0.0.1:8866/setup
```

### 4. 测试 OCR

```bash
curl -X POST http://127.0.0.1:8866/ocr \
  -F "file=@/path/to/image.png"
```

## API 文档

启动服务后访问：http://127.0.0.1:8866/docs

### 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/` | 服务信息 |
| GET | `/health` | 健康检查 |
| POST | `/setup` | 下载/加载模型 |
| POST | `/ocr` | 执行 OCR |

### OCR 请求示例

```bash
# 使用 curl
curl -X POST http://127.0.0.1:8866/ocr \
  -F "file=@invoice.png"

# 响应
{
  "success": true,
  "text": "识别的文本内容...",
  "lines": ["第一行", "第二行"],
  "line_count": 2,
  "duration": 1.23
}
```

## 配置

### 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `PADDLEOCR_PORT` | 8866 | 服务端口 |

### 模型存储

模型文件默认存储在：`~/.paddleocr/`

首次下载约 400MB，包含：
- 检测模型
- 识别模型
- 方向分类模型

## 故障排除

### 安装失败

```bash
# 如果 paddleocr 安装失败，尝试：
pip install paddlepaddle
pip install paddleocr
```

### 内存不足

PaddleOCR 需要约 2GB 内存。如果内存不足：

```python
# 在 app.py 中添加
ocr_engine = PaddleOCR(
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    det_limit_side_len=960,  # 减小检测尺寸
)
```

### macOS M1/M2 注意事项

PaddleOCR 在 Apple Silicon 上运行在 CPU 模式。
如需 GPU 加速，需要特殊配置（见 OCR_IMPLEMENTATION_ADJUSTED.md）。

## 与 Alata Studio 集成

此服务通过 `PaddleOCRClient` 被 Alata Studio 调用：

```javascript
// collector/utils/OCRLoader/paddleOCRClient.js
const client = new PaddleOCRClient('http://127.0.0.1:8866');
await client.setupModels();
const result = await client.ocr('/path/to/image.png');
```

