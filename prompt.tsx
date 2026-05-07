import React, { useEffect, useMemo, useState } from "react";

type InferenceProvider = "openai" | "anthropic" | "local";

type RunStatus = "idle" | "running" | "complete" | "failed";

type PromptTemplate = {
  id: string;
  name: string;
  systemPrompt: string;
  temperature: number;
};

type InferenceResult = {
  provider: InferenceProvider;
  templateId: string;
  input: string;
  output: string;
  tokenCount: number;
  safetyScore: number;
};

const TEMPLATES: PromptTemplate[] = [
  {
    id: "support-triage",
    name: "Support triage",
    systemPrompt:
      "Classify the customer request, identify urgency, and draft a concise next step.",
    temperature: 0.2
  },
  {
    id: "risk-review",
    name: "Risk review",
    systemPrompt:
      "Review the user's request for operational, legal, and reputational risk.",
    temperature: 0.1
  },
  {
    id: "product-copy",
    name: "Product copy",
    systemPrompt:
      "Rewrite the input as crisp product copy for a technical audience.",
    temperature: 0.7
  }
];

function simulateInference(
  provider: InferenceProvider,
  template: PromptTemplate,
  input: string
): Promise<InferenceResult> {
  const baseDelay = provider === "local" ? 300 : provider === "openai" ? 950 : 1200;
  const jitter = Math.floor(Math.random() * 700);

  return new Promise((resolve) => {
    window.setTimeout(() => {
      const normalizedInput = input.trim() || "No input provided.";

      resolve({
        provider,
        templateId: template.id,
        input: normalizedInput,
        output: `${template.name}: ${normalizedInput.slice(0, 90)}${
          normalizedInput.length > 90 ? "..." : ""
        }`,
        tokenCount:
          Math.ceil(template.systemPrompt.length / 4) +
          Math.ceil(normalizedInput.length / 4),
        safetyScore:
          template.id === "risk-review"
            ? 94
            : Math.round((78 + Math.random() * 16) * 10) / 10
      });
    }, baseDelay + jitter);
  });
}

export default function AiInferenceWorkbench() {
  const [provider, setProvider] = useState<InferenceProvider>("openai");
  const [templateId, setTemplateId] = useState("support-triage");
  const [input, setInput] = useState(
    "A customer says their account was locked after several failed login attempts."
  );
  const [status, setStatus] = useState<RunStatus>("idle");
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [autoRun, setAutoRun] = useState(true);

  const selectedTemplate = useMemo(() => {
    return TEMPLATES.find((template) => template.id === templateId) ?? TEMPLATES[0];
  }, [templateId]);

  const estimatedTokens = useMemo(() => {
    return (
      Math.ceil(selectedTemplate.systemPrompt.length / 4) +
      Math.ceil(input.trim().length / 4)
    );
  }, [input, selectedTemplate.systemPrompt]);

  useEffect(() => {
    if (!autoRun) {
      return;
    }

    setStatus("running");

    setResult(null);

    simulateInference(provider, selectedTemplate, input)
      .then((nextResult) => {
        setResult(nextResult);
        setStatus("complete");
      })
      .catch(() => {
        setStatus("failed");
      });
  }, [autoRun, provider, input, templateId]);

  return (
    <main className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
      <section className="mx-auto max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-300">
            AI Inference Workbench
          </p>
          <h1 className="text-3xl font-bold">Prompt template runner</h1>
          <p className="max-w-2xl text-zinc-400">
            Compare providers, switch templates, and preview the latest generated
            response for a test input.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-300">
            Provider
            <select
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={provider}
              onChange={(event) => setProvider(event.target.value as InferenceProvider)}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="local">Local model</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-zinc-300">
            Template
            <select
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              {TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-5 block text-sm font-medium text-zinc-300">
          User input
          <textarea
            className="mt-2 min-h-32 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>

        <div className="mt-5 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div>
            <p className="text-sm text-zinc-500">Estimated prompt size</p>
            <p className="text-lg font-semibold">{estimatedTokens} tokens</p>
          </div>

          <label className="flex items-center gap-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(event) => setAutoRun(event.target.checked)}
            />
            Auto-run
          </label>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500">Selected template</p>
              <p className="text-xl font-semibold">{selectedTemplate.name}</p>
            </div>
            <span className="rounded-full bg-violet-400/10 px-3 py-1 text-sm text-violet-300">
              temp {selectedTemplate.temperature}
            </span>
          </div>

          <p className="text-sm text-zinc-400">{selectedTemplate.systemPrompt}</p>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <p className="text-sm font-medium text-zinc-500">Latest inference</p>

          {status === "running" && (
            <p className="mt-3 text-violet-300">Generating response...</p>
          )}

          {status === "failed" && (
            <p className="mt-3 text-red-300">The inference request failed.</p>
          )}

          {status !== "running" && result && (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-lg bg-zinc-900 p-3">
                  <p className="text-zinc-500">Provider</p>
                  <p className="font-medium">{result.provider}</p>
                </div>
                <div className="rounded-lg bg-zinc-900 p-3">
                  <p className="text-zinc-500">Tokens</p>
                  <p className="font-medium">{result.tokenCount}</p>
                </div>
                <div className="rounded-lg bg-zinc-900 p-3">
                  <p className="text-zinc-500">Safety score</p>
                  <p className="font-medium">{result.safetyScore}</p>
                </div>
              </div>

              <div className="rounded-lg bg-zinc-900 p-4">
                <p className="mb-2 text-sm text-zinc-500">Output</p>
                <p className="text-zinc-200">{result.output}</p>
              </div>
            </div>
          )}

          {status === "idle" && !result && (
            <p className="mt-3 text-zinc-500">No inference has run yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
