import React, { useEffect, useMemo, useState } from "react";

type Model = {
  id: string;
  name: string;
  provider: "OpenAI" | "Anthropic" | "Google" | "Local";
  maxTokens: number;
};

type Evaluation = {
  modelId: string;
  prompt: string;
  score: number;
  latencyMs: number;
  summary: string;
};

const MODELS: Model[] = [
  { id: "gpt-5.1-mini", name: "GPT-5.1 Mini", provider: "OpenAI", maxTokens: 128000 },
  { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", provider: "Anthropic", maxTokens: 200000 },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", maxTokens: 1000000 },
  { id: "local-small", name: "Local Small", provider: "Local", maxTokens: 8192 }
];

function fakeEvaluate(modelId: string, prompt: string): Promise<Evaluation> {
  const delay = modelId === "local-small" ? 250 : 900 + Math.random() * 1200;

  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({
        modelId,
        prompt,
        score: Math.round((72 + Math.random() * 24) * 10) / 10,
        latencyMs: Math.round(delay),
        summary:
          modelId === "local-small"
            ? "Fast response, but weaker reasoning on multi-step instructions."
            : "Strong instruction following with good reasoning coverage."
      });
    }, delay);
  });
}

export default function AiModelEvaluationPanel() {
  const [selectedModelId, setSelectedModelId] = useState(MODELS[0].id);
  const [prompt, setPrompt] = useState(
    "Summarize the customer complaint and propose the safest next action."
  );
  const [isRunning, setIsRunning] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  const selectedModel = useMemo(
    () => MODELS.find((model) => model.id === selectedModelId) ?? MODELS[0],
    [selectedModelId]
  );

  useEffect(() => {
    // Clear previous evaluation when starting a new run
    setEvaluation(null);
    setIsRunning(true);

    fakeEvaluate(selectedModelId, prompt).then((result) => {
      setEvaluation(result);
      setIsRunning(false);
    });
  }, [selectedModelId, prompt]);

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="mb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">
            AI Evaluation Console
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Model comparison run</h1>
          <p className="mt-2 text-slate-400">
            Select a model, edit the prompt, and inspect the latest evaluation result.
          </p>
        </div>

        <label className="block text-sm font-medium text-slate-300">
          Model
          <select
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            value={selectedModelId}
            onChange={(event) => setSelectedModelId(event.target.value)}
          >
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} · {model.provider}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-5 block text-sm font-medium text-slate-300">
          Evaluation prompt
          <textarea
            className="mt-2 min-h-28 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Current target</p>
              <p className="text-lg font-semibold">{selectedModel.name}</p>
            </div>
            <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300">
              {selectedModel.maxTokens.toLocaleString()} tokens
            </span>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-sm font-medium text-slate-400">Latest result</p>

          {isRunning && <p className="mt-3 text-cyan-300">Running evaluation...</p>}

          {!isRunning && evaluation && (
            <div className="mt-3 space-y-2">
              <p>
                <span className="text-slate-400">Model:</span> {evaluation.modelId}
              </p>
              <p>
                <span className="text-slate-400">Score:</span> {evaluation.score}
              </p>
              <p>
                <span className="text-slate-400">Latency:</span> {evaluation.latencyMs}ms
              </p>
              <p className="text-slate-300">{evaluation.summary}</p>
            </div>
          )}

          {!isRunning && !evaluation && (
            <p className="mt-3 text-zinc-500">No evaluation has completed yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
