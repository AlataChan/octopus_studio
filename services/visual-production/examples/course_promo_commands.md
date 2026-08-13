# 课程宣传视觉生成示例

## 1. 设置 Key

```bash
export ARK_API_KEY="你的火山方舟 API Key"
export DASHSCOPE_API_KEY="你的阿里百炼 API Key"
```

如果阿里百炼文档要求工作空间专属 endpoint：

```bash
export DASHSCOPE_BASE_URL="https://<workspace-id>.cn-beijing.maas.aliyuncs.com/api/v1"
```

## 2. 查看自动路由

```bash
python -m octopus_visual_production route --task video.final
python -m octopus_visual_production route --task image.poster.final
python -m octopus_visual_production route --task video.text.draft --provider aliyun_dashscope
```

## 3. 生成课程海报

```bash
python -m octopus_visual_production run \
  --task image.poster.final \
  --prompt "环境公益 AI 赋能实战营课程宣传海报，真实公益办公桌，绿色生态气质，留出标题空间，不生成文字" \
  --size "1328*1328" \
  --prefix course-poster
```

## 4. 用阿里免费额度生成 5 秒视频草稿

```bash
python -m octopus_visual_production run \
  --provider aliyun_dashscope \
  --task video.text.draft \
  --prompt "真实环境公益组织办公场景，散落资料整理成知识库，温暖自然光，纪录片质感，不生成可读文字" \
  --ratio 16:9 \
  --duration 5 \
  --prefix aliyun-video-draft
```

## 5. 用火山 Seedance 生成最终 5 秒片段

```bash
python -m octopus_visual_production run \
  --provider volcengine_ark \
  --task video.final \
  --prompt "课程宣传片片段：技能、知识库、AI智能体逐步连接成项目助理，真实公益办公场景，现代可信，不生成可读文字" \
  --ratio 16:9 \
  --duration 5 \
  --generate-audio \
  --prefix volc-video-final
```

## 6. 拼接 6 段视频

```bash
python -m octopus_visual_production stitch \
  --out runs/course_promo_30s.mp4 \
  runs/s01.mp4 runs/s02.mp4 runs/s03.mp4 runs/s04.mp4 runs/s05.mp4 runs/s06.mp4
```

