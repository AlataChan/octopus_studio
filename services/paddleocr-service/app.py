"""
PaddleOCR 3.x FastAPI 服务
为 Alata Studio 提供高精度 OCR 能力

启动方式: uvicorn app:app --host 127.0.0.1 --port 8866
"""

import os
# 禁用模型源检查（加快启动速度）
os.environ['DISABLE_MODEL_SOURCE_CHECK'] = 'True'

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from PIL import Image
import io
import tempfile
import time

# 全局变量：OCR 引擎（延迟初始化）
ocr_engine = None
models_ready = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时不自动加载模型，等待用户触发
    print("🚀 PaddleOCR Service starting...")
    print("⚠️  Models not loaded. Call POST /setup to download models (~400MB)")
    yield
    # 关闭时清理资源
    print("👋 PaddleOCR Service shutting down...")


app = FastAPI(
    title="PaddleOCR Service for Alata Studio",
    description="高精度 OCR 服务，支持中英文识别",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def init_ocr_engine():
    """
    初始化 OCR 引擎（用户触发时调用）
    首次调用会下载约 400MB 模型文件
    """
    global ocr_engine, models_ready
    if ocr_engine is not None:
        return True

    try:
        from paddleocr import PaddleOCR

        print("📦 Initializing PaddleOCR 3.x engine...")
        print("   This may take a while on first run (downloading ~400MB models)...")

        # PaddleOCR 3.x API
        ocr_engine = PaddleOCR(
            use_doc_orientation_classify=False,  # 关闭文档方向分类（加速）
            use_doc_unwarping=False,             # 关闭文档矫正（加速）
            use_textline_orientation=False,      # 关闭文本行方向检测（加速）
            lang="ch",                           # 中文模型（也支持英文）
        )
        models_ready = True
        print("✅ PaddleOCR engine initialized successfully!")
        return True
    except Exception as e:
        print(f"❌ Failed to initialize PaddleOCR: {e}")
        return False


@app.get("/")
async def root():
    """根路径"""
    return {
        "service": "PaddleOCR Service for Alata Studio",
        "version": "1.0.0",
        "status": "running",
        "models_ready": models_ready,
    }


@app.get("/health")
async def health_check():
    """健康检查（不触发模型下载）"""
    return {
        "status": "ok",
        "engine": "PaddleOCR 3.x",
        "models_ready": models_ready,
        "message": "Call POST /setup to download models" if not models_ready else "Ready",
    }


@app.post("/setup")
async def setup_models():
    """
    ⭐ 手动触发模型下载
    用户明确需要 OCR 时调用此接口，会下载约 400MB 模型
    """
    if models_ready:
        return {"success": True, "message": "Models already loaded"}

    success = init_ocr_engine()
    if success:
        return {"success": True, "message": "Models downloaded and loaded successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to download/load models")


@app.post("/ocr")
async def perform_ocr(file: UploadFile = File(...)):
    """
    端到端 OCR：检测 + 识别

    请求：multipart/form-data，字段名 file
    响应：{ success: bool, text: str, lines: list, line_count: int, duration: float }
    """
    # 检查模型是否就绪
    if not models_ready:
        raise HTTPException(
            status_code=503,
            detail="Models not ready. Call POST /setup first to download models (~400MB)",
        )

    start_time = time.time()
    temp_path = None

    try:
        # 读取上传的图片
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))

        # 转换为 RGB（如果是 RGBA 或其他模式）
        if image.mode != "RGB":
            image = image.convert("RGB")

        # 保存临时文件（PaddleOCR 3.x 的 predict 需要路径）
        temp_path = tempfile.mktemp(suffix=".png")
        image.save(temp_path)

        # PaddleOCR 3.x API：使用 predict 方法
        result = ocr_engine.predict(input=temp_path)

        # 提取文本
        lines = []
        for res in result:
            # 3.x 的结果结构：res 是一个对象，包含 rec_texts 属性
            if hasattr(res, "rec_texts"):
                lines.extend(res.rec_texts)
            # 兼容可能的其他结构
            elif isinstance(res, dict) and "rec_texts" in res:
                lines.extend(res["rec_texts"])

        full_text = "\n".join(lines)
        duration = time.time() - start_time

        return {
            "success": True,
            "text": full_text,
            "lines": lines,
            "line_count": len(lines),
            "duration": round(duration, 2),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # 清理临时文件
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

