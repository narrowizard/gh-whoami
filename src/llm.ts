export interface LlmConfig {
  provider: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Resolve LLM access from env. Priority: LLM_ prefixed vars, then ANTHROPIC_ or OPENAI_ prefixed ones. */
export function resolveLlm(env: NodeJS.ProcessEnv): LlmConfig | null {
  const explicit = env.LLM_PROVIDER === "anthropic" || env.LLM_PROVIDER === "openai" ? env.LLM_PROVIDER : undefined;

  const anthropicHint = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_BASE_URL);
  const openaiHint = Boolean(env.OPENAI_API_KEY || env.OPENAI_BASE_URL);
  const provider = explicit ?? (anthropicHint ? "anthropic" : openaiHint ? "openai" : null);
  if (!provider) return null;

  if (provider === "anthropic") {
    const baseUrl = env.LLM_BASE_URL ?? env.ANTHROPIC_BASE_URL;
    const apiKey = env.LLM_API_KEY ?? env.ANTHROPIC_API_KEY ?? env.ANTHROPIC_AUTH_TOKEN ?? "";
    const model = env.LLM_MODEL ?? env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
    if (!baseUrl && !apiKey) return null; // nothing to talk to
    return { provider, baseUrl: baseUrl ?? "https://api.anthropic.com", apiKey, model };
  }

  const baseUrl = env.LLM_BASE_URL ?? env.OPENAI_BASE_URL;
  const apiKey = env.LLM_API_KEY ?? env.OPENAI_API_KEY ?? "";
  const model = env.LLM_MODEL ?? env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!baseUrl && !apiKey) return null;
  return { provider, baseUrl: baseUrl ?? "https://api.openai.com/v1", apiKey, model };
}

/** Single-shot generation via plain fetch (no SDK dependency). */
export async function llmGenerate(cfg: LlmConfig, system: string, user: string): Promise<string> {
  if (cfg.provider === "anthropic") {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(cfg.apiKey
          ? { "x-api-key": cfg.apiKey, Authorization: `Bearer ${cfg.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 8192,
        temperature: 0.4,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      stop_reason?: string;
    };
    const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    if (!text) {
      const blocks = (data.content ?? []).map((c) => c.type).join(",");
      throw new Error(
        `LLM returned no text (stop_reason=${data.stop_reason ?? "?"}, blocks=[${blocks}]) — thinking may have consumed the budget; raise max_tokens`,
      );
    }
    return text;
  }

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.4,
      max_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("LLM returned no text");
  return text;
}
