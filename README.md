# 逐词

[![CI](https://github.com/fly1d/wordwise/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fly1d/wordwise/actions/workflows/ci.yml)
[![Desktop](https://github.com/fly1d/wordwise/actions/workflows/desktop.yml/badge.svg?branch=main)](https://github.com/fly1d/wordwise/actions/workflows/desktop.yml)
[![CodeQL](https://github.com/fly1d/wordwise/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/fly1d/wordwise/actions/workflows/codeql.yml)

本地优先的英中逐词翻译工具，提供 macOS 桌面客户端和 Web 界面。文本先被确定性拆成词元，再交给翻译引擎；模型返回会被校验，不能随意漏词或合并词语。

## 功能

- macOS 中选中文字后按 `⌥ + T`，打开客户端并立即翻译
- 自动、Ollama 本地模型、OpenAI 兼容 API、极速词典四种引擎
- 整段中文译文与逐词、数字、标点对齐结果
- TXT、Markdown、DOCX、PDF 文本提取
- 桌面与手机响应式 Web 界面

## Web 开发

需要 Node.js 24 或更高版本。

```bash
npm ci
npm run dev
```

打开 `http://localhost:5173`。

## macOS 客户端

首次构建需要 Rust stable 和 Xcode Command Line Tools。

```bash
rustup toolchain install stable
npm ci
npm run tauri dev
```

全局划词需要在“系统设置 → 隐私与安全性 → 辅助功能”中允许逐词。客户端会优先通过 macOS Accessibility API 读取选区；不支持该属性的应用会使用保留剪贴板内容的复制回退。

生成本地 `.app`：

```bash
npm run desktop:build:app
```

## 翻译引擎

- `自动选择`：依次尝试 Ollama、本机环境变量中的云端 API、基础词典。
- `Ollama 本地`：内容不离开电脑，建议使用 `qwen3:4b` 或更大的 Qwen 模型。
- `云端模型`：支持 OpenAI 及兼容 `/chat/completions` 的 API。
- `极速词典`：完全离线、即时返回，生词和语境覆盖有限。

本地模型示例：

```bash
ollama pull qwen3:4b
ollama serve
```

服务端环境变量示例：

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434 \
OPENAI_BASE_URL=https://api.openai.com/v1 \
OPENAI_API_KEY=... OPENAI_MODEL=gpt-5-mini npm run dev
```

API Key 不会写入浏览器存储。公共云端凭据不得编译到前端或桌面安装包中。
Web 服务只会请求上述服务端环境变量配置的模型地址，页面中地址为只读；这可防止浏览器借用本地 API 访问其他内网服务。macOS 客户端直接在本机发起模型请求，仍允许用户在设置中修改兼容 API 地址。

## 质量门禁

```bash
npm run check
npm run test:smoke
npm run desktop:check
```

所有修改通过 GitHub pull request 合并。风险分级、测试范围和发布步骤见 [CONTRIBUTING.md](CONTRIBUTING.md)、[docs/testing.md](docs/testing.md) 和 [docs/releasing.md](docs/releasing.md)。

安全问题请按 [SECURITY.md](SECURITY.md) 使用 GitHub 私密漏洞报告，不要提交包含密钥、私有选区或文档内容的公开 Issue。

## 当前限制

- 全局划词 beta 目前只支持 macOS。
- 文档功能提取文字后翻译，尚未保持原文档版式导出。
- 仓库公开可见，但暂未授予开源许可证；除非另行说明，项目保留全部权利。
