// ImageUploadForAi.tsx
"use client";

import { useEffect, useState } from "react";

export default function ImageUploadForAi() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");

  function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    // BUG: This object URL is never revoked.
    // If the user uploads multiple images, the browser keeps the old blobs in memory.
    const previewUrl = URL.createObjectURL(file);

    setImageUrl(previewUrl);
  }
  useEffect(() => {\n    return () => {\n      if (imageUrl) {\n        URL.revokeObjectURL(imageUrl);\n      }\n    };\n  }, [imageUrl]);
  async function analyzeImage() {
    if (!imageUrl) {
      alert("Upload an image first.");
      return;
    }

    const response = await fetch("/api/ai/analyze-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: imageUrl,
        prompt,
      }),
    });

    const data = await response.json();

    console.log("AI response:", data);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 rounded-xl border border-border p-6">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">
          Upload image for AI
        </label>

        <input
          accept="image/*"
          className="text-sm text-muted-foreground"
          onChange={handleImageUpload}
          type="file"
        />
      </div>

      {imageUrl ? (
        <img
          alt="Uploaded preview"
          className="h-64 w-full rounded-lg border border-border object-cover"
          src={imageUrl}
        />
      ) : null}

      <textarea
        className="min-h-24 rounded-lg border border-border bg-background p-3 text-sm"
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Ask AI what to do with this image..."
        value={prompt}
      />

      <button
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        onClick={analyzeImage}
        type="button"
      >
        Analyze image
      </button>
    </div>
  );
}