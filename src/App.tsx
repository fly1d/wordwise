import {
  ArrowRight,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  FileText,
  Languages,
  LoaderCircle,
  RotateCcw,
  Settings,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { extractFileText } from "./documents";
import {
  getEngineStatus,
  isDesktopApp,
  registerSelectionShortcut,
  requestTranslation,
} from "./platform";
import type {
  EngineSettings,
  Provider,
  ServerStatus,
  TranslationResult,
} from "./types";

const SAMPLE = `We suggest that developers start by using LLM APIs directly: many patterns can be implemented in a few lines of code. If you do use a framework, ensure you understand the underlying code. Incorrect assumptions about what's under the hood are a common source of customer error.`;

const DEFAULT_SETTINGS: EngineSettings = {
  provider: "auto",
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "qwen3:4b",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-5-mini",
  openaiApiKey: "",
};

const PROVIDER_LABELS: Record<Provider, string> = {
  auto: "自动选择",
  ollama: "Ollama 本地",
  openai: "云端模型",
  dictionary: "极速词典",
};

function readSavedSettings(): EngineSettings {
  try {
    const saved = JSON.parse(localStorage.getItem("wordwise-settings") ?? "{}") as Partial<EngineSettings>;
    return { ...DEFAULT_SETTINGS, ...saved, openaiApiKey: "" };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function writeClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = value;
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();
    if (!copied) throw new Error("浏览器未允许复制，请检查剪贴板权限");
  }
}

export default function App() {
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [settings, setSettings] = useState<EngineSettings>(readSavedSettings);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef(settings);

  const tokenCount = useMemo(
    () => text.match(/\p{L}+(?:['’]\p{L}+)*|\p{N}+(?:[.,]\p{N}+)*|[^\s]/gu)?.length ?? 0,
    [text],
  );

  useEffect(() => {
    getEngineStatus()
      .then((nextStatus) => {
        setStatus(nextStatus);
        setSettings((current) => ({
          ...current,
          ollamaUrl: nextStatus.customEndpointsAllowed
            ? current.ollamaUrl || nextStatus.defaults.ollamaUrl
            : nextStatus.defaults.ollamaUrl,
          ollamaModel: current.ollamaModel || nextStatus.defaults.ollamaModel,
          openaiBaseUrl: nextStatus.customEndpointsAllowed
            ? current.openaiBaseUrl || nextStatus.defaults.openaiBaseUrl
            : nextStatus.defaults.openaiBaseUrl,
          openaiModel: current.openaiModel || nextStatus.defaults.openaiModel,
        }));
      })
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    let removeShortcut: () => void = () => undefined;
    let cancelled = false;

    void registerSelectionShortcut(
      async (selectedText) => {
        if (cancelled) return;
        setText(selectedText);
        setFileName("");
        setResult(null);
        await translateValue(selectedText, settingsRef.current);
      },
      (message) => setError(message),
    ).then((remove) => {
      if (cancelled) remove();
      else removeShortcut = remove;
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : "全局快捷键注册失败");
    });

    return () => {
      cancelled = true;
      removeShortcut();
    };
  }, []);

  useEffect(() => {
    const { openaiApiKey: _apiKey, ...safeSettings } = settings;
    localStorage.setItem("wordwise-settings", JSON.stringify(safeSettings));
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleTranslate();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function translateValue(sourceText: string, activeSettings = settings) {
    if (!sourceText.trim()) return;
    setLoading(true);
    setError("");
    try {
      setResult(await requestTranslation(sourceText, activeSettings));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "翻译失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleTranslate() {
    if (loading) return;
    if (needsModelSetup) {
      setSettingsOpen(true);
      return;
    }
    await translateValue(text);
  }

  async function handleFile(file?: File) {
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    try {
      const document = await extractFileText(file);
      setText(document.text);
      setFileName(document.fileName);
      setResult(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文档读取失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function copyResult() {
    if (!result) return;
    const rows = result.segments.map(
      (segment) => `${segment.source} - ${segment.translation}${segment.note ? `（${segment.note}）` : ""}`,
    );
    try {
      await writeClipboard(`${result.fullTranslation}\n\n${rows.join("\n")}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "复制失败");
    }
  }

  function updateSetting<K extends keyof EngineSettings>(key: K, value: EngineSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function resetText() {
    setText("");
    setResult(null);
    setFileName("");
    setError("");
  }

  const hasEnteredApiKey = Boolean(settings.openaiApiKey.trim());

  const currentProviderStatus = (() => {
    if (settings.provider === "dictionary") return "仅逐词查义";
    if (settings.provider === "ollama") return status?.ollama.available ? "本地已连接" : "等待本地模型";
    if (settings.provider === "openai") {
      return hasEnteredApiKey || status?.openaiConfigured ? "API 已配置" : "需要 API Key";
    }
    if (status?.ollama.available) return "将使用本地模型";
    if (hasEnteredApiKey || status?.openaiConfigured) return "将使用云端模型";
    return "需要配置引擎";
  })();

  const needsModelSetup = status !== null
    && settings.provider === "auto"
    && !status.ollama.available
    && !hasEnteredApiKey
    && !status.openaiConfigured;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="逐词翻译">
          <span className="brand-mark"><Languages size={19} strokeWidth={2.2} /></span>
          <span>逐词</span>
          <span className="brand-subtitle">英语精读翻译</span>
        </div>
        <div className="topbar-actions">
          <span className="connection-state"><i />{currentProviderStatus}</span>
          <button className="icon-button" type="button" title="翻译引擎设置" onClick={() => setSettingsOpen(true)}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className="language-bar">
          <div className="language-pair">
            <span>英语</span>
            <ArrowRight size={16} />
            <span>简体中文</span>
          </div>
          <label className="engine-select">
            <Zap size={15} />
            <select
              aria-label="翻译引擎"
              value={settings.provider}
              onChange={(event) => updateSetting("provider", event.target.value as Provider)}
            >
              {(Object.keys(PROVIDER_LABELS) as Provider[]).map((provider) => (
                <option key={provider} value={provider}>{PROVIDER_LABELS[provider]}</option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
        </div>

        {needsModelSetup && (
          <div className="setup-banner" role="status">
            <div>
              <strong>先连接一个语境翻译引擎</strong>
              <span>Ollama 内容留在本机；云端 API 适合立即开始。极速词典只做逐词查义，不会冒充整句翻译。</span>
            </div>
            <button className="secondary-button" type="button" onClick={() => setSettingsOpen(true)}>
              <Settings size={16} />配置引擎
            </button>
          </div>
        )}

        <section className={`translator ${dragging ? "is-dragging" : ""}`}>
          <div
            className="input-pane"
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFile(event.dataTransfer.files[0]);
            }}
          >
            <div className="pane-heading">
              <span>原文</span>
              <div className="pane-actions">
                <input
                  ref={fileInputRef}
                  className="visually-hidden"
                  type="file"
                  accept=".txt,.md,.docx,.pdf"
                  onChange={(event) => void handleFile(event.target.files?.[0])}
                />
                <button
                  className="text-button"
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}
                  导入文档
                </button>
                <button className="icon-button compact" type="button" title="清空" disabled={!text} onClick={resetText}>
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>

            {fileName && (
              <div className="file-chip">
                <FileText size={14} />
                <span>{fileName}</span>
                <button type="button" title="移除文档标记" onClick={() => setFileName("")}><X size={13} /></button>
              </div>
            )}

            <textarea
              value={text}
              maxLength={20_000}
              spellCheck={false}
              aria-label="英文原文"
              placeholder="输入或粘贴英文"
              onChange={(event) => {
                setText(event.target.value);
                setResult(null);
                setFileName("");
              }}
            />

            {dragging && (
              <div className="drop-overlay">
                <Upload size={24} />
                <strong>放开以读取文档</strong>
                <span>TXT、MD、DOCX、PDF</span>
              </div>
            )}

            <div className="input-footer">
              <span>{text.length.toLocaleString()} 字符 · {tokenCount.toLocaleString()} 词元</span>
              <button
                className="primary-button"
                type="button"
                disabled={!text.trim() || loading}
                onClick={() => void handleTranslate()}
              >
                {loading ? <LoaderCircle className="spin" size={17} /> : <Languages size={17} />}
                {loading ? "翻译中" : needsModelSetup ? "配置后翻译" : "逐词翻译"}
              </button>
            </div>
          </div>

          <div className="output-pane" aria-live="polite">
            <div className="pane-heading">
              <span>译文</span>
              <div className="pane-actions">
                {result && <span className="engine-used">{result.engine} · {result.elapsedMs} ms</span>}
                <button className="icon-button compact" type="button" title={copied ? "已复制" : "复制全部结果"} aria-label={copied ? "已复制" : "复制全部结果"} disabled={!result} onClick={() => void copyResult()}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="error-message">
                <span>{error}</span>
                <button type="button" onClick={() => setSettingsOpen(true)}>检查设置</button>
              </div>
            )}

            {!result && !loading && (
              <div className="empty-state">
                <span><Clipboard size={24} /></span>
                <strong>逐词结果</strong>
                <p>每个单词、数字和标点都会单独对齐。</p>
              </div>
            )}

            {loading && (
              <div className="empty-state loading-state">
                <span><LoaderCircle className="spin" size={24} /></span>
                <strong>正在分析语境</strong>
                <p>共 {tokenCount.toLocaleString()} 个词元</p>
              </div>
            )}

            {result && !loading && (
              <div className="results">
                <div className="full-translation">
                  <span>{result.engine === "极速词典" ? "模式说明" : "整段翻译"}</span>
                  <p>{result.fullTranslation}</p>
                </div>
                {result.warning && <div className="warning-message">{result.warning}</div>}
                <div className="segment-list">
                  {result.segments.map((segment) => (
                    <div className={`segment-row ${segment.kind}`} key={segment.id}>
                      <span className="segment-index">{String(segment.id + 1).padStart(2, "0")}</span>
                      <span className="segment-source">{segment.source}</span>
                      <span className="segment-dash">-</span>
                      <span className="segment-translation">
                        {segment.translation}
                        {segment.note && <small>{segment.note}</small>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <span>{isDesktopApp ? "桌面客户端" : "本地优先"}</span>
        {isDesktopApp && <span>⌥ + T 翻译选中文字</span>}
        <span>Ctrl / ⌘ + Enter 翻译</span>
        <span>单次上限 20,000 字符</span>
      </footer>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-heading">
              <div>
                <h2 id="settings-title">翻译引擎</h2>
                <p>自动模式使用已配置的 Ollama 或云端 API，不会静默降级为基础词典。</p>
              </div>
              <button className="icon-button" type="button" title="关闭设置" onClick={() => setSettingsOpen(false)}><X size={18} /></button>
            </div>

            <fieldset className="provider-options">
              <legend>运行方式</legend>
              {(Object.keys(PROVIDER_LABELS) as Provider[]).map((provider) => (
                <label key={provider} className={settings.provider === provider ? "selected" : ""}>
                  <input
                    type="radio"
                    name="provider"
                    value={provider}
                    checked={settings.provider === provider}
                    onChange={() => updateSetting("provider", provider)}
                  />
                  <span>{PROVIDER_LABELS[provider]}</span>
                  <small>{providerDescription(provider, status)}</small>
                </label>
              ))}
            </fieldset>

            {(settings.provider === "auto" || settings.provider === "ollama") && (
              <div className="settings-group">
                <div className="settings-group-title">
                  <span>Ollama 本地模型</span>
                  <b className={status?.ollama.available ? "online" : ""}>{status?.ollama.available ? "已连接" : "未连接"}</b>
                </div>
                <label>
                  <span>服务地址</span>
                  <input
                    value={settings.ollamaUrl}
                    readOnly={status?.customEndpointsAllowed === false}
                    onChange={(event) => updateSetting("ollamaUrl", event.target.value)}
                  />
                </label>
                <label>
                  <span>模型</span>
                  <input list="ollama-models" value={settings.ollamaModel} onChange={(event) => updateSetting("ollamaModel", event.target.value)} />
                  <datalist id="ollama-models">
                    {status?.ollama.models.map((model) => <option key={model} value={model} />)}
                  </datalist>
                </label>
              </div>
            )}

            {(settings.provider === "auto" || settings.provider === "openai") && (
              <div className="settings-group">
                <div className="settings-group-title">
                  <span>OpenAI 兼容 API</span>
                  <b className={hasEnteredApiKey || status?.openaiConfigured ? "online" : ""}>{hasEnteredApiKey || status?.openaiConfigured ? "已配置" : "未配置"}</b>
                </div>
                <label>
                  <span>API 地址</span>
                  <input
                    value={settings.openaiBaseUrl}
                    readOnly={status?.customEndpointsAllowed === false}
                    onChange={(event) => updateSetting("openaiBaseUrl", event.target.value)}
                  />
                </label>
                <label>
                  <span>模型</span>
                  <input value={settings.openaiModel} onChange={(event) => updateSetting("openaiModel", event.target.value)} />
                </label>
                <label>
                  <span>API Key</span>
                  <input type="password" autoComplete="off" placeholder={status?.openaiConfigured ? "已由服务端环境变量提供" : "仅保留到本次页面关闭"} value={settings.openaiApiKey} onChange={(event) => updateSetting("openaiApiKey", event.target.value)} />
                </label>
              </div>
            )}

            <div className="dialog-footer">
              <span>API Key 不会写入浏览器存储</span>
              <button className="primary-button" type="button" onClick={() => setSettingsOpen(false)}><Check size={17} />完成</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function providerDescription(provider: Provider, status: ServerStatus | null) {
  switch (provider) {
    case "auto": return "按可用性选择最佳引擎";
    case "ollama": return status?.ollama.available ? `${status.ollama.models.length} 个本地模型可用` : "数据不离开本机";
    case "openai": return "语境质量高，按 API 用量计费";
    case "dictionary": return "离线逐词查义，不提供可靠整句翻译";
  }
}
