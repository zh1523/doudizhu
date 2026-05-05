# 斗地主 (Dou Di Zhu) - 在线对战平台

## 项目结构

- `client/` - React + Vite + TailwindCSS 前端
- `server/` - 游戏服务端

## 图片读取

当用户上传图片或需要读取项目中的截图/图片文件时，由于当前 API 不支持多模态，必须使用 OCR 工具提取文字信息：

```bash
node client/scripts/ocr.mjs "<image-path>"
```

此脚本使用 tesseract.js 识别中英文，输出图片中的文字内容。

## 技术栈

- 前端: React 19, Zustand, Socket.io-client, TailwindCSS 4, Framer Motion
- 构建: Vite 8, TypeScript 6
- 服务端语言: Java (见 server/ 目录)
