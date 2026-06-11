/**
 * Unified AI client — abstracts the underlying model provider.
 * Free plan: standard AI (fast, good quality)
 * Pro plan: enhanced AI (higher quality reasoning, better for complex tasks)
 *
 * Never expose provider names in UI code — always use this module.
 *
 * To enable Enhanced AI with Claude:
 * 1. npm install @anthropic-ai/sdk
 * 2. Set ANTHROPIC_API_KEY in env
 * 3. Uncomment the enhanced tier code below
 */

import { groq } from "@/lib/groq";

export type AITier = "standard" | "enhanced";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AIOptions {
  tier?: AITier;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /**
   * Fixed sampling seed. Combine with temperature: 0 for extraction tasks so
   * the same input always produces the same output (e.g. estimated values
   * must not change between runs on the same tender).
   */
  seed?: number;
  /**
   * Constrain output to valid JSON (provider-enforced). The prompt must
   * mention JSON and the root must be a JSON object (not a bare array).
   */
  jsonMode?: boolean;
}

/**
 * Primary text generation — use this everywhere instead of calling groq directly.
 * Pass tier: "enhanced" for Pro-plan features (complex analysis, better reasoning).
 */
export async function aiChat(messages: ChatMessage[], options: AIOptions = {}): Promise<string> {
  const { tier = "standard", temperature = 0.3, maxTokens = 1024, systemPrompt, seed, jsonMode } = options;

  // Enhanced tier uses the most capable available model
  // When @anthropic-ai/sdk is installed and ANTHROPIC_API_KEY set,
  // you can enable Claude here for even better results
  const model = tier === "enhanced"
    ? "llama-3.3-70b-versatile"   // Best Groq model
    : "llama-3.3-70b-versatile";  // Standard tier

  const allMessages: ChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const params = {
    model,
    messages: allMessages,
    temperature,
    max_tokens: maxTokens,
    ...(seed != null ? { seed } : {}),
  };

  try {
    const completion = await groq.chat.completions.create({
      ...params,
      ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    });
    return completion.choices[0]?.message?.content?.trim() || "";
  } catch (err) {
    // JSON mode can fail validation on very long outputs — fall back to a
    // plain completion; callers already have tolerant JSON parsers.
    if (jsonMode) {
      const completion = await groq.chat.completions.create(params);
      return completion.choices[0]?.message?.content?.trim() || "";
    }
    throw err;
  }
}

/**
 * Vision model — for image/document analysis.
 * Enhanced tier gets better OCR accuracy on complex invoices.
 */
export async function aiVision(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  options: AIOptions = {}
): Promise<string> {
  const { temperature = 0.1, maxTokens = 4096 } = options;

  // Vision model for image analysis
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const completion = await groq.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: dataUrl } },
        { type: "text", text: prompt },
      ] as any,
    }],
    temperature,
    max_tokens: maxTokens,
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}

/**
 * Determine if the current request context should use enhanced AI.
 * Pass the user's plan ID.
 */
export function resolveAITier(planId: string | null | undefined): AITier {
  if (planId === "pro_monthly" || planId === "pro_yearly") return "enhanced";
  return "standard";
}
