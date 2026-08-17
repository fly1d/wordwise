# 在 macOS 上构建逐词

签名和公证版 Beta 安装包目前还没有开放下载。开发者不需要等待安装包，可以从源码运行当前版本。

## 环境要求

- macOS 12 或更高版本
- Node.js 24 或更高版本
- Rust stable
- Xcode Command Line Tools

如果还没有 Rust 工具链，先运行：

```bash
rustup toolchain install stable
```

## 运行桌面客户端

在仓库根目录运行：

```bash
npm ci
npm run tauri dev
```

逐词会以原生桌面窗口打开。在其他 macOS 应用中选中英文，按下 `Option + T` 即可读取选区。

第一次划词时，需要在“系统设置 -> 隐私与安全性 -> 辅助功能”中允许逐词。客户端会优先使用 macOS Accessibility API；应用没有暴露选区时，才会使用复制回退，并在读取后恢复原来的剪贴板内容。

## 配置翻译引擎

语境翻译需要以下任一引擎：

- 本机 Ollama，建议使用 `qwen3:4b` 或更大的 Qwen 模型
- OpenAI 兼容 API 地址和你自己的 API Key

自动模式会先使用可用的 Ollama，再使用已配置的云端 API。两者都不可用时，客户端会提示配置。离线词典是单独的查词模式，不会被冒充成语境整句翻译。

API Key 只保存在应用运行内存中，不会写入浏览器存储或提交到仓库。不要在公开 GitHub Issue 中提交 API Key、选中文字或私有文档。

## 验证修改

提交 pull request 前运行：

```bash
npm run check
npm run test:smoke
npm run test:site
npm run desktop:check
```
