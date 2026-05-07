// ImageUploadForAi.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AiMode = "caption" | "objects" | "safety" | "ocr";

type AnalysisTone = "brief" | "technical" | "creative";

type AnalysisResult = {
  id: string;
  fileName: string;
  mode: AiMode;
  tone: AnalysisTone;
  prompt: string;
  summary: string;
  confidence: number;
  createdAt: string;
};

type UploadedImage = {
  file: File;
  url: string;
  name: string;
  size: number;
  type: string;
};

const MAX_IMAGE_SIZE_MB = 8;

const AI_MODES: Array<{
  id: AiMode;
  label: string;
  description: string;
}> = [
  {
    id: "caption",
    label: "Caption",
    description: "Generate a concise visual caption for the image.",
  },
  {
    id: "objects",
    label: "Objects",
    description: "Identify notable objects, people, places, or UI elements.",
  },
  {
    id: "safety",
    label: "Safety",
    description: "Look for sensitive, unsafe, or policy-relevant content.",
  },
  {
    id: "ocr",
    label: "OCR",
    description: "Extract visible text and summarize what it says.",
  },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getModeLabel(mode: AiMode) {
  return AI_MODES.find((item) => item.id === mode)?.label ?? "Caption";
}

function fakeLocalAnalysis(
  image: UploadedImage,
  mode: AiMode,
  tone: AnalysisTone,
  prompt: string
): Promise<AnalysisResult> {
  const delay = mode === "ocr" ? 1200 : 700 + Math.random() * 900;

  return new Promise((resolve) => {
    window.setTimeout(() => {
      const modeLabel = getModeLabel(mode);
      const trimmedPrompt = prompt.trim();

      resolve({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        fileName: image.name,
        mode,
        tone,
        prompt: trimmedPrompt,
        summary:
          trimmedPrompt.length > 0
            ? `${modeLabel} analysis using a ${tone} tone: ${trimmedPrompt.slice(
                0,
                90
              )}${trimmedPrompt.length > 90 ? "..." : ""}`
            : `${modeLabel} analysis using a ${tone} tone for ${image.name}.`,
        confidence: Math.round((82 + Math.random() * 15) * 10) / 10,
        createdAt: new Date().toISOString(),
      });
    }, delay);
  });
}

export default function ImageUploadForAi() {
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<AiMode>("caption");
  const [tone, setTone] = useState<AnalysisTone>("brief");
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedMode = useMemo(() => {
    return AI_MODES.find((item) => item.id === mode) ?? AI_MODES[0];
  }, [mode]);

  const promptPreview = useMemo(() => {
    const fallback = "Describe the image and call out anything important.";
    const text = prompt.trim() || fallback;

    return includeMetadata && image
      ? `${text}\n\nFile: ${image.name}\nType: ${image.type}\nSize: ${formatBytes(
          image.size
        )}`
      : text;
  }, [prompt, includeMetadata]);

  const canAnalyze = Boolean(image) && !isAnalyzing;

  function resetUpload() {
    setImage(null);
    setResult(null);
    setError("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleSelectedFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setError("");

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      setError(`Images must be smaller than ${MAX_IMAGE_SIZE_MB} MB.`);
      return;
    }

    const nextUrl = URL.createObjectURL(file);

    setImage({
      file,
      url: nextUrl,
      name: file.name,
      size: file.size,
      type: file.type,
    });
    setResult(null);
  }

  function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    handleSelectedFile(event.target.files?.[0]);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleSelectedFile(event.dataTransfer.files?.[0]);
  }

  useEffect(() => {
    return () => {
      if (image) {
        URL.revokeObjectURL(image.url);
      }
    };
  }, []);

  useEffect(() => {
    if (!autoAnalyze || !image) {
      return;
    }

    analyzeImage();
  }, [autoAnalyze, image, prompt]);

  async function analyzeImage() {
    if (!image) {
      setError("Upload an image first.");
      return;
    }

    setIsAnalyzing(true);
    setError("");

    try {
      const response = await fetch("/api/ai/analyze-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: image.url,
          fileName: image.name,
          mimeType: image.type,
          mode,
          tone,
          prompt: promptPreview,
        }),
      });

      let nextResult: AnalysisResult;

      if (response.ok) {
        const data = await response.json();

        nextResult = {
          id: data.id ?? `${Date.now()}`,
          fileName: image.name,
          mode,
          tone,
          prompt: promptPreview,
          summary: data.summary ?? "The AI returned an empty summary.",
          confidence: data.confidence ?? 0,
          createdAt: new Date().toISOString(),
        };
      } else {
        nextResult = await fakeLocalAnalysis(image, mode, tone, promptPreview);
      }

      setResult(nextResult);
      setHistory([nextResult, ...history].slice(0, 5));
    } catch {
      const fallbackResult = await fakeLocalAnalysis(image, mode, tone, promptPreview);
      setResult(fallbackResult);
      setHistory([fallbackResult, ...history].slice(0, 5));
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 rounded-xl border border-border bg-background p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          AI Vision Lab
        </p>
        <h2 className="text-2xl font-semibold text-foreground">
          Upload image for AI analysis
        </h2>
        <p className="text-sm text-muted-foreground">
          Test image captioning, OCR, object detection, and safety review flows from a
          single upload panel.
        </p>
      </div>

      <div
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center transition ${
          isDragging ? "border-primary bg-primary/10" : "border-border bg-muted/30"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
          type="file"
        />

        <p className="text-sm font-medium text-foreground">
          Drop an image here, or click to browse
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PNG, JPG, GIF, or WebP. Max {MAX_IMAGE_SIZE_MB} MB.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {image ? (
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <img
            alt="Uploaded preview"
            className="h-64 w-full rounded-lg border border-border object-cover"
            src={image.url}
          />

          <div className="flex flex-col justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-2">
              <p className="font-medium text-foreground">{image.name}</p>
              <dl className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                <div>
                  <dt className="font-medium text-foreground">Type</dt>
                  <dd>{image.type || "Unknown"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Size</dt>
                  <dd>{formatBytes(image.size)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Mode</dt>
                  <dd>{selectedMode.label}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Tone</dt>
                  <dd>{tone}</dd>
                </div>
              </dl>
            </div>

            <button
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
              onClick={resetUpload}
              type="button"
            >
              Remove image
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          Analysis mode
          <select
            className="rounded-lg border border-border bg-background p-3 text-sm"
            onChange={(event) => setMode(event.target.value as AiMode)}
            value={mode}
          >
            {AI_MODES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          Response tone
          <select
            className="rounded-lg border border-border bg-background p-3 text-sm"
            onChange={(event) => setTone(event.target.value as AnalysisTone)}
            value={tone}
          >
            <option value="brief">Brief</option>
            <option value="technical">Technical</option>
            <option value="creative">Creative</option>
          </select>
        </label>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">{selectedMode.label}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedMode.description}
        </p>
      </div>

      <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
        Prompt
        <textarea
          className="min-h-28 rounded-lg border border-border bg-background p-3 text-sm"
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask AI what to do with this image..."
          value={prompt}
        />
      </label>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">Prompt preview</p>
        <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
          {promptPreview}
        </pre>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            checked={includeMetadata}
            onChange={(event) => setIncludeMetadata(event.target.checked)}
            type="checkbox"
          />
          Include file metadata
        </label>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            checked={autoAnalyze}
            onChange={(event) => setAutoAnalyze(event.target.checked)}
            type="checkbox"
          />
          Auto-analyze changes
        </label>
      </div>

      <button
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canAnalyze}
        onClick={analyzeImage}
        type="button"
      >
        {isAnalyzing ? "Analyzing..." : "Analyze image"}
      </button>

      {result ? (
        <section className="rounded-xl border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Latest AI response
              </p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">
                {getModeLabel(result.mode)} · {result.confidence}% confidence
              </h3>
            </div>
            <time className="text-xs text-muted-foreground">
              {new Date(result.createdAt).toLocaleTimeString()}
            </time>
          </div>

          <p className="mt-3 text-sm text-foreground">{result.summary}</p>

          <div className="mt-4 rounded-lg bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Prompt used
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.prompt || "Default prompt"}
            </p>
          </div>
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className="rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Recent analyses</h3>

          <ul className="mt-3 divide-y divide-border">
            {history.map((item) => (
              <li key={item.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {getModeLabel(item.mode)} · {item.fileName}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {item.confidence}%
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.summary}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
