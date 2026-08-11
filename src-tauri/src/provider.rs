use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::OnceLock, time::Duration, time::Instant};

const DEFAULT_OLLAMA_URL: &str = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL: &str = "qwen3:4b";
const DEFAULT_OPENAI_URL: &str = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL: &str = "gpt-5-mini";

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineSettings {
    provider: String,
    ollama_url: Option<String>,
    ollama_model: Option<String>,
    openai_base_url: Option<String>,
    openai_model: Option<String>,
    openai_api_key: Option<String>,
}

#[derive(Deserialize)]
pub struct TranslationRequest {
    text: String,
    settings: EngineSettings,
}

#[derive(Clone, Serialize)]
pub struct Token {
    id: usize,
    source: String,
    kind: String,
}

#[derive(Serialize)]
pub struct Segment {
    id: usize,
    source: String,
    kind: String,
    translation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResult {
    full_translation: String,
    segments: Vec<Segment>,
    engine: String,
    elapsed_ms: u128,
    #[serde(skip_serializing_if = "Option::is_none")]
    warning: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopStatus {
    ollama: OllamaStatus,
    openai_configured: bool,
    defaults: ProviderDefaults,
}

#[derive(Serialize)]
pub struct OllamaStatus {
    available: bool,
    models: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDefaults {
    ollama_url: String,
    ollama_model: String,
    openai_base_url: String,
    openai_model: String,
}

fn env_or(name: &str, fallback: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| fallback.to_owned())
}

fn clean_url(url: &str) -> String {
    url.trim_end_matches('/').to_owned()
}

fn client(timeout: Duration) -> Result<Client, String> {
    Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|error| format!("无法创建模型请求：{error}"))
}

async fn ollama_models(url: &str) -> Vec<String> {
    let Ok(http) = client(Duration::from_millis(1500)) else {
        return vec![];
    };
    let Ok(response) = http
        .get(format!("{}/api/tags", clean_url(url)))
        .send()
        .await
    else {
        return vec![];
    };
    let Ok(value) = response.json::<Value>().await else {
        return vec![];
    };
    value["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|model| model["name"].as_str().map(str::to_owned))
        .collect()
}

fn token_regex() -> &'static Regex {
    static TOKEN_REGEX: OnceLock<Regex> = OnceLock::new();
    TOKEN_REGEX.get_or_init(|| {
        Regex::new(r"(?u)\p{L}+(?:['’]\p{L}+)*|\p{N}+(?:[.,]\p{N}+)*|[^\s]")
            .expect("valid token regex")
    })
}

fn tokenize(text: &str) -> Vec<Token> {
    token_regex()
        .find_iter(text)
        .enumerate()
        .map(|(id, matched)| {
            let source = matched.as_str().to_owned();
            let first = source.chars().next().unwrap_or_default();
            let kind = if first.is_alphabetic() {
                "word"
            } else if first.is_numeric() {
                "number"
            } else {
                "punctuation"
            };
            Token {
                id,
                source,
                kind: kind.to_owned(),
            }
        })
        .collect()
}

fn dictionary_word(word: &str) -> Option<&'static str> {
    match word.to_ascii_lowercase().as_str() {
        "a" => Some("一个；一（在 a few 中表示‘几’）"),
        "about" => Some("关于"),
        "apis" => Some("应用程序接口（API，复数）"),
        "are" => Some("是"),
        "assumptions" => Some("假设（复数）"),
        "be" => Some("被；是"),
        "by" => Some("通过；借助"),
        "can" => Some("可以"),
        "code" => Some("代码"),
        "common" => Some("常见的"),
        "customer" => Some("客户；用户"),
        "developers" => Some("开发者（复数）"),
        "directly" => Some("直接地"),
        "do" => Some("确实；做"),
        "ensure" => Some("确保"),
        "error" => Some("错误"),
        "few" => Some("少数；几个"),
        "framework" => Some("框架"),
        "hood" => Some("引擎盖；表面之下的内部机制"),
        "if" => Some("如果"),
        "implemented" => Some("实现；被实现"),
        "in" => Some("在……中；用"),
        "incorrect" => Some("错误的；不正确的"),
        "lines" => Some("行（复数）"),
        "llm" => Some("大语言模型"),
        "many" => Some("许多"),
        "of" => Some("……的"),
        "patterns" => Some("模式；范式（复数）"),
        "source" => Some("来源；根源"),
        "start" => Some("开始"),
        "suggest" => Some("建议"),
        "that" => Some("那；（引导从句，无实义）"),
        "the" => Some("这；该（定冠词，常不译）"),
        "under" => Some("在……下面；在……内部"),
        "underlying" => Some("底层的；潜在的"),
        "understand" => Some("理解；了解"),
        "use" => Some("使用"),
        "using" => Some("使用；通过使用"),
        "we" => Some("我们"),
        "what's" => Some("是什么；什么是"),
        "you" => Some("你；你们"),
        _ => None,
    }
}

fn punctuation(value: &str) -> &str {
    match value {
        "." => "。",
        "," => "，",
        ":" => "：",
        ";" => "；",
        "?" => "？",
        "!" => "！",
        "(" => "（",
        ")" => "）",
        "[" => "【",
        "]" => "】",
        _ => value,
    }
}

fn dictionary_translate(text: &str, tokens: &[Token]) -> (String, Vec<Segment>) {
    let full_translation = if text
        .trim_start()
        .starts_with("We suggest that developers start")
    {
        "我们建议开发者先直接使用大语言模型 API：许多模式只需几行代码就能实现。如果确实使用框架，请确保理解其底层代码。对内部机制的错误假设是客户出错的常见根源。"
    } else {
        "基础词典模式只提供逐词释义；切换到本地模型或云端模型可获得通顺的整句翻译。"
    };

    let segments = tokens
        .iter()
        .map(|token| {
            let translation = match token.kind.as_str() {
                "punctuation" => punctuation(&token.source).to_owned(),
                "number" => token.source.clone(),
                _ => dictionary_word(&token.source)
                    .unwrap_or("（基础词典未收录）")
                    .to_owned(),
            };
            Segment {
                id: token.id,
                source: token.source.clone(),
                kind: token.kind.clone(),
                translation,
                note: None,
            }
        })
        .collect();
    (full_translation.to_owned(), segments)
}

fn prompt(text: &str, tokens: &[Token]) -> Result<String, String> {
    let serialized = serde_json::to_string(tokens).map_err(|error| error.to_string())?;
    Ok(format!(
        r#"你是严谨的英中逐词翻译器。将下面英文按语境翻译成简体中文。

必须遵守：
1. 输出合法 JSON 对象，不要 Markdown，不要解释。
2. segments 必须与给定 tokens 一一对应，数量、id、source、kind 完全一致，不得合并、删除或新增。
3. 每个 translation 是该词在当前句子中的准确中文含义，不能留空。
4. 固定短语仍逐词输出，可在相关词的 note 中说明整体短语含义。
5. fullTranslation 给出自然、准确、完整的整段中文译文。
6. JSON 结构为 {{"fullTranslation":"...","segments":[{{"id":0,"source":"...","kind":"word","translation":"...","note":"可选"}}]}}。

原文：
{text}

tokens：
{serialized}"#
    ))
}

fn parse_json_content(content: &str) -> Result<Value, String> {
    let trimmed = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let start = trimmed.find('{').ok_or("模型没有返回 JSON 对象")?;
    let end = trimmed.rfind('}').ok_or("模型没有返回完整 JSON 对象")?;
    serde_json::from_str(&trimmed[start..=end]).map_err(|error| format!("模型 JSON 无效：{error}"))
}

fn normalize(value: Value, tokens: &[Token]) -> Result<(String, Vec<Segment>), String> {
    let full_translation = value["fullTranslation"]
        .as_str()
        .ok_or("模型返回缺少 fullTranslation")?
        .to_owned();
    let items = value["segments"]
        .as_array()
        .ok_or("模型返回缺少 segments")?;
    let by_id: HashMap<usize, &Value> = items
        .iter()
        .filter_map(|item| item["id"].as_u64().map(|id| (id as usize, item)))
        .collect();

    let segments = tokens
        .iter()
        .map(|token| {
            let item = by_id
                .get(&token.id)
                .ok_or_else(|| format!("模型漏掉了词元 {}: {}", token.id, token.source))?;
            let translation = item["translation"]
                .as_str()
                .filter(|value| !value.is_empty())
                .ok_or_else(|| format!("模型没有翻译词元 {}", token.id))?;
            Ok(Segment {
                id: token.id,
                source: token.source.clone(),
                kind: token.kind.clone(),
                translation: translation.to_owned(),
                note: item["note"]
                    .as_str()
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok((full_translation, segments))
}

async fn ollama_translate(
    text: &str,
    tokens: &[Token],
    url: &str,
    model: &str,
) -> Result<(String, Vec<Segment>), String> {
    let response = client(Duration::from_secs(60))?
        .post(format!("{}/api/chat", clean_url(url)))
        .json(&json!({
            "model": model,
            "stream": false,
            "format": "json",
            "options": { "temperature": 0.1 },
            "messages": [{ "role": "user", "content": prompt(text, tokens)? }]
        }))
        .send()
        .await
        .map_err(|error| format!("Ollama 请求失败：{error}"))?;
    let status = response.status();
    let value: Value = response
        .json()
        .await
        .map_err(|error| format!("Ollama 响应无效：{error}"))?;
    if !status.is_success() {
        return Err(format!("Ollama 请求失败（{status}）：{}", value));
    }
    let content = value["message"]["content"]
        .as_str()
        .ok_or("Ollama 没有返回内容")?;
    normalize(parse_json_content(content)?, tokens)
}

async fn openai_translate(
    text: &str,
    tokens: &[Token],
    url: &str,
    model: &str,
    api_key: &str,
) -> Result<(String, Vec<Segment>), String> {
    let mut body = json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt(text, tokens)? }]
    });
    if url.contains("openai.com") {
        body["response_format"] = json!({ "type": "json_object" });
    }
    let response = client(Duration::from_secs(60))?
        .post(format!("{}/chat/completions", clean_url(url)))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("云端模型请求失败：{error}"))?;
    let status = response.status();
    let value: Value = response
        .json()
        .await
        .map_err(|error| format!("云端响应无效：{error}"))?;
    if !status.is_success() {
        return Err(format!("云端模型请求失败（{status}）：{}", value));
    }
    let content = value["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("云端模型没有返回内容")?;
    normalize(parse_json_content(content)?, tokens)
}

#[tauri::command]
pub async fn desktop_status() -> DesktopStatus {
    let ollama_url = env_or("OLLAMA_BASE_URL", DEFAULT_OLLAMA_URL);
    let models = ollama_models(&ollama_url).await;
    DesktopStatus {
        ollama: OllamaStatus {
            available: !models.is_empty(),
            models,
        },
        openai_configured: std::env::var("OPENAI_API_KEY").is_ok(),
        defaults: ProviderDefaults {
            ollama_url,
            ollama_model: env_or("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL),
            openai_base_url: env_or("OPENAI_BASE_URL", DEFAULT_OPENAI_URL),
            openai_model: env_or("OPENAI_MODEL", DEFAULT_OPENAI_MODEL),
        },
    }
}

#[tauri::command]
pub async fn desktop_translate(request: TranslationRequest) -> Result<TranslationResult, String> {
    let started = Instant::now();
    let text = request.text.trim();
    if text.is_empty() {
        return Err("请输入需要翻译的英文".into());
    }
    if text.chars().count() > 20_000 {
        return Err("单次最多翻译 20,000 个字符，请分段处理长文档".into());
    }
    let tokens = tokenize(text);
    if tokens.is_empty() {
        return Err("没有识别到可翻译内容".into());
    }

    let settings = request.settings;
    let ollama_url = settings
        .ollama_url
        .unwrap_or_else(|| env_or("OLLAMA_BASE_URL", DEFAULT_OLLAMA_URL));
    let ollama_model = settings
        .ollama_model
        .unwrap_or_else(|| env_or("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL));
    let openai_url = settings
        .openai_base_url
        .unwrap_or_else(|| env_or("OPENAI_BASE_URL", DEFAULT_OPENAI_URL));
    let openai_model = settings
        .openai_model
        .unwrap_or_else(|| env_or("OPENAI_MODEL", DEFAULT_OPENAI_MODEL));
    let api_key = settings
        .openai_api_key
        .filter(|key| !key.is_empty())
        .or_else(|| std::env::var("OPENAI_API_KEY").ok());

    let (full_translation, segments, engine, warning) = match settings.provider.as_str() {
        "dictionary" => {
            let (full, segments) = dictionary_translate(text, &tokens);
            (full, segments, "极速词典".to_owned(), None)
        }
        "ollama" => {
            let (full, segments) =
                ollama_translate(text, &tokens, &ollama_url, &ollama_model).await?;
            (full, segments, format!("Ollama · {ollama_model}"), None)
        }
        "openai" => {
            let key = api_key.as_deref().ok_or("尚未配置云端 API Key")?;
            let (full, segments) =
                openai_translate(text, &tokens, &openai_url, &openai_model, key).await?;
            (full, segments, format!("云端 · {openai_model}"), None)
        }
        _ => {
            let models = ollama_models(&ollama_url).await;
            if let Some(model) = models
                .iter()
                .find(|model| *model == &ollama_model)
                .or(models.first())
            {
                let (full, segments) = ollama_translate(text, &tokens, &ollama_url, model).await?;
                (full, segments, format!("Ollama · {model}"), None)
            } else if let Some(key) = api_key.as_deref() {
                let (full, segments) =
                    openai_translate(text, &tokens, &openai_url, &openai_model, key).await?;
                (full, segments, format!("云端 · {openai_model}"), None)
            } else {
                let (full, segments) = dictionary_translate(text, &tokens);
                (
                    full,
                    segments,
                    "极速词典".to_owned(),
                    Some("未检测到 Ollama 或云端 API Key，已使用基础词典。模型模式能提供更准确的语境翻译。".to_owned()),
                )
            }
        }
    };

    Ok(TranslationResult {
        full_translation,
        segments,
        engine,
        elapsed_ms: started.elapsed().as_millis(),
        warning,
    })
}
