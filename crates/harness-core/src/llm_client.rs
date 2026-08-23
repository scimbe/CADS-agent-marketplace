//! A minimal OpenAI-compatible chat-completions client against the operator's own LiteLLM proxy.
//! Only what the agent loop needs -- tool-calling messages in, one assistant message out.

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Mirrors ct-agent's own established convention of never leaving a `reqwest` client unbounded
/// (b388dee, "add request timeouts to unbounded reqwest clients") -- generous for a local model
/// under load, but a hung LiteLLM/Ollama backend must not hang `harness run` forever.
const LLM_REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String, // "system" | "user" | "assistant" | "tool"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String, // "function"
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String, // JSON-encoded string, per OpenAI tool-call convention
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: &'a [Message],
    tools: &'a serde_json::Value,
    max_tokens: u64,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: Message,
}

pub struct LlmClient {
    base_url: String,
    api_key: String,
    client: reqwest::blocking::Client,
}

impl LlmClient {
    pub fn new(base_url: String, api_key: String) -> Result<Self, String> {
        let client = reqwest::blocking::Client::builder()
            .timeout(LLM_REQUEST_TIMEOUT)
            .build()
            .map_err(|e| format!("build LLM HTTP client: {e}"))?;
        Ok(Self { base_url, api_key, client })
    }

    /// One chat-completions turn. `max_output_tokens` is the SIGNED task's own cap, passed
    /// straight through as `max_tokens` -- the model cannot be asked to produce more than the
    /// task itself was signed to allow.
    pub fn chat(&self, model: &str, messages: &[Message], tools: &serde_json::Value, max_output_tokens: u64) -> Result<Message, String> {
        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));
        let req = ChatRequest { model, messages, tools, max_tokens: max_output_tokens };
        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(&req)
            .send()
            .map_err(|e| format!("POST {url}: {e}"))?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("POST {url}: HTTP {status}: {}", body.chars().take(500).collect::<String>()));
        }
        let parsed: ChatResponse = resp.json().map_err(|e| format!("parse chat response: {e}"))?;
        parsed
            .choices
            .into_iter()
            .next()
            .map(|c| c.message)
            .ok_or_else(|| "chat response had no choices".to_string())
    }
}

/// The harness's fixed, three-tool schema -- sent on every turn, never extended by a task prompt.
pub fn tool_schema() -> serde_json::Value {
    serde_json::json!([
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a text file's contents, path relative to the bundle root.",
                "parameters": {
                    "type": "object",
                    "properties": { "path": { "type": "string" } },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write/overwrite a text file, path relative to the bundle root.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "rebuild",
                "description": "Run `docker compose build` for the bundle's own compose file. Takes no arguments.",
                "parameters": { "type": "object", "properties": {} }
            }
        }
    ])
}
