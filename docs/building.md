# 在 macOS 上构建逐词

签名和公证版 Beta 安装包目前还没有开放下载。开发者不需要等待安装包，可以从源码运行当前版本。

## 环境要求

- macOS 12 或更高版本
- Node.js 22.13 或更高版本
- Rust stable
- Xcode Command Line Tools

先确认命令行工具可用：

```bash
git --version
node --version
rustc --version
xcode-select -p
```

如果缺少 Xcode Command Line Tools 或 Rust，分别运行：

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Rust 安装完成后重新打开终端，再运行：

```bash
rustup toolchain install stable
```

Node.js 安装包和其他安装方式见 [Node.js 下载页](https://nodejs.org/zh-cn/download)。运行 `node --version` 时应显示 `v22.13.0` 或更高版本。

## 运行桌面客户端

克隆仓库并安装锁定版本的依赖：

```bash
git clone https://github.com/fly1d/wordwise.git
cd wordwise
npm ci
```

启动桌面客户端：

```bash
npm run tauri dev
```

逐词会以原生桌面窗口打开。在其他 macOS 应用中选中英文，按下默认快捷键 `Option + K` 即可读取选区。可以在设置中关闭选区快捷键，或录入新的组合键。

第一次划词时，需要在“系统设置 -> 隐私与安全性 -> 辅助功能”中允许逐词。客户端会优先使用 macOS Accessibility API；应用没有暴露选区时，才会使用复制回退，并可能要求在“自动化”中允许逐词控制 System Events。复制回退会短暂使用系统剪贴板：客户端先在内存中快照全部 pasteboard item 及其已声明 representation，只在 `changeCount` 仍符合候选版本时恢复；恢复开始前已观察到的额外或意外变化会保留较新内容并取消本次捕获。快照不会发送给翻译引擎，捕获结束后从内存释放。关闭选区快捷键只会取消全局快捷键注册；如需撤销读取权限，请在 macOS 系统设置中移除逐词。

`NSPasteboard` 不公开写入者身份，也没有原子 compare-and-swap。客户端无法证明 Command+C 后观察到的第一次变化一定来自目标应用，版本检查与恢复写入之间也存在无法完全消除的极窄 TOCTOU 窗口。实现会保护恢复开始前已观察到的额外或意外变化，并在清空后再次检查版本；签名候选包仍必须按发布清单测试并发写入，不应把条件恢复描述成绝对原子保证。

macOS 也不公开原内容是否使用 `NSPasteboardContentsCurrentHostOnly`。逐词会用 `CurrentHostOnly` 恢复快照，避免把原本仅本机的敏感内容扩大到 Universal Clipboard；相应地，恢复后的旧内容不会由这次恢复操作主动同步到其他 Apple 设备。

## 配置翻译引擎

语境翻译需要以下任一引擎：

- 本机 Ollama，建议使用 `qwen3:4b` 或更大的 Qwen 模型
- OpenAI 兼容 API 地址和你自己的 API Key

本地模式不需要 API Key。从 [Ollama macOS 下载页](https://ollama.com/download/mac) 安装并启动 Ollama，然后在另一个终端运行：

```bash
ollama pull qwen3:4b
```

回到逐词，保留“自动选择”或选择“Ollama”。在支持文本选择或复制的应用中选中 `What's under the hood?`，按下默认快捷键 `Option + K`。首次成功时应同时看到完整中文译文、逐词结果，以及 `Ollama · qwen3:4b` 引擎标签。

自动模式会先使用可用的 Ollama，再使用已配置的云端 API。两者都不可用时，客户端会提示配置。离线词典是单独的查词模式，不会被冒充成语境整句翻译。

API Key 只保存在应用运行内存中，不会写入浏览器存储或提交到仓库。选择云端模型或远程 Ollama 地址时，选中文字、手动输入内容或提取出的文档文字会发送给所配置的服务；使用默认本机 Ollama 地址或极速词典时不会发送到云端。不要在公开 GitHub Issue 中提交 API Key、选中文字或私有文档。

## 常见阻塞

- 快捷键没有响应：确认设置中的选区快捷键已启用且没有被其他应用占用。
- 快捷键没有读到选区：检查“系统设置 -> 隐私与安全性”中逐词的“辅助功能”权限；复制回退还需要在“自动化”中允许逐词控制 System Events。修改后重新启动开发客户端。
- 提示剪贴板已更新：候选版本之后又发生了剪贴板写入。逐词会取消本次捕获且不会把该候选内容发送给翻译引擎；请检查当前剪贴板，退出并重新打开逐词后再试。
- 自动模式提示没有引擎：确认 Ollama 应用正在运行，并用 `ollama list` 检查模型是否已经下载。
- 端口被占用：退出已有的逐词开发进程后重试。

## 验证修改

提交 pull request 前运行：

```bash
npm run check
npm run test:smoke
npm run test:site
npm run desktop:check
```
