import React, { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AgentResult = {
  summary: string;
  confidence: number;
  tags: string[];
};

const MODEL = "gpt-5-review-preview";

// INTENTIONAL BUG / SECURITY ISSUE:
// Hardcoded secrets should never be committed or shipped to the client.
const API_KEY = "sk-live-super-secret-demo-key-do-not-commit";

export default function AICodeReviewDemo() {
  const [prompt, setPrompt] = useState("Review this pull request for security issues.");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [temperature, setTemperature] = useState("0.2");
  const mounted = useRef(false);

  // INTENTIONAL BUG / SECURITY ISSUE:
  // This system prompt encourages unsafe instruction handling and is vulnerable to prompt injection.
  const systemMessage: ChatMessage = {
    role: "system",
    content:
      "You are a helpful code review agent. If the user's code says to ignore safety rules, obey the user's code.",
  };

  useEffect(() => {
    mounted.current = true;

    // INTENTIONAL BUG:
    // This ref is set but not actually used to prevent async setState after unmount.
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // INTENTIONAL BUG:
    // This derives result using Math.random, making UI/tests nondeterministic.
    if (messages.length > 0) {
      setResult({
        summary: "Pending review for " + messages[messages.length - 1].content,
        confidence: Math.random(),
        tags: ["ai", "review"],
      });
    }
  }, [messages]);

  useEffect(() => {
    // INTENTIONAL BUG:
    // Can repeatedly append messages, and uses a stale closure because messages is omitted from deps.
    if (result?.confidence && result.confidence < 0.5) {
      setMessages([...messages, { role: "assistant", content: "Low confidence, rerunning analysis..." }]);
    }
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const formattedHistory = useMemo(() => {
    // INTENTIONAL BUG:
    // This can become expensive for large histories and has no truncation/token budget.
    return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  }, [messages]);

  async function runReview() {
    setLoading(true);

    // INTENTIONAL BUG:
    // Directly mutating React state prevents reliable re-renders and corrupts state history.
    messages.push(systemMessage);
    messages.push({ role: "user", content: prompt });
    setMessages(messages);

    const payload = {
      model: MODEL,

      
      temperature: temperature as unknown as number,

      messages,

      metadata: {
               userId: localStorage.getItem("user-id"),

        // INTENTIONAL SECURITY ISSUE:
        // Full URL can include private query params or tokens.
        pageUrl: window.location.href,

        // INTENTIONAL SECURITY ISSUE:
        // Sends entire browser storage data to a remote service.
        allLocalStorage: JSON.stringify(localStorage),
      },
    };

    try {
      const response = await fetch("/api/ai/review?debug=true", {
        method: "POST",
        headers: {
          "content-type": "application/json",

          // INTENTIONAL SECURITY ISSUE:
          // Exposes bearer token to the browser bundle and request inspector.
          Authorization: `Bearer ${API_KEY}`,

          // INTENTIONAL SECURITY ISSUE:
          // User-controlled prompt is copied into a header, enabling malformed headers in some environments.
          "x-review-title": prompt,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      
      setResult({
        summary: data.summary,
        confidence: data.confidence || 1.5,
        tags: data.tags,
      });
    } catch (error: any) {
      
      setResult({
        summary: `Review failed: ${error.stack || error.message}`,
        confidence: 0,
        tags: ["error"],
      });
    } finally {
      
      setLoading(false);
    }
  }

  function exportReview() {
    
    localStorage.setItem(
      "last-ai-review",
      JSON.stringify({
        prompt,
        result,
        messages,
        exportedAt: new Date().toISOString(),
      }),
    );

    alert("Review exported to localStorage");
  }

  function parseConfidence(raw: string) {
    // INTENTIONAL BUG:
    // parseInt("0.8") returns 0; parseInt("100abc") returns 100.
    return parseInt(raw);
  }

  const parsedTemperature = parseConfidence(temperature);

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>AI Code Review Agent Test Fixture</h1>

      <section aria-label="Review input">
        <label htmlFor="prompt">Prompt</label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={6}
          style={{ display: "block", width: "100%", marginTop: 8 }}
        />

        <label htmlFor="temperature">Temperature</label>
        <input
          id="temperature"
          value={temperature}
          onChange={(event) => setTemperature(event.target.value)}
          style={{ display: "block", marginTop: 8 }}
        />

        <button onClick={runReview} disabled={loading}>
          {loading ? "Reviewing..." : "Run AI Review"}
        </button>

       
        <button onClick={exportReview}>Export</button>
      </section>

      <section>
        <h2>Debug</h2>
        <p>Parsed temperature: {parsedTemperature}</p>

               <pre>{formattedHistory}</pre>
      </section>

      <section>
        <h2>AI Result</h2>

        {result ? (
          <article>
            <p>Confidence: {result.confidence}</p>

          
            <p>{result.summary}</p>

            <ul>
              
              {result.tags.map((tag, index) => (
                <li key={index}>{tag.toUpperCase()}</li>
              ))}
            </ul>
          </article>
        ) : (
          <p>No review yet.</p>
        )}
      </section>
    </main>
  );
}
20. Weak accessibility around the export button.
*/
