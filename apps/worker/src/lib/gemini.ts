import { ApiError } from "./errors";

function extractLikelyJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return text.trim();
  return text.slice(start, end + 1).trim();
}

export async function callGeminiJson(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  image: { mimeType: string; base64: string };
}): Promise<any> {
  if (!opts.apiKey) throw new ApiError(500, "missing_gemini_key", "缺少 GEMINI_API_KEY");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    opts.model
  )}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: opts.prompt },
            {
              inline_data: {
                mime_type: opts.image.mimeType,
                data: opts.image.base64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json"
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(502, "gemini_failed", `Gemini 调用失败 (${res.status}): ${text}`);
  }

  const data = (await res.json()) as any;
  const parts = data?.candidates?.[0]?.content?.parts;
  const text =
    Array.isArray(parts) ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("") : "";

  if (!text) throw new ApiError(502, "gemini_empty", "Gemini 返回为空");

  const jsonText = extractLikelyJson(text);
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new ApiError(502, "gemini_bad_json", "Gemini 返回 JSON 解析失败");
  }
}

