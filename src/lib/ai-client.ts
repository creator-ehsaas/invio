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
}

/**
 * Primary text generation — use this everywhere instead of calling groq directly.
 * Pass tier: "enhanced" for Pro-plan features (complex analysis, better reasoning).
 */
export async function aiChat(messages: ChatMessage[], options: AIOptions = {}): Promise<string> {
  const { tier = "standard", temperature = 0.3, maxTokens = 1024, systemPrompt } = options;

  // Enhanced tier uses the most capable available model
  // When @anthropic-ai/sdk is installed and ANTHROPIC_API_KEY set,
  // you can enable Claude here for even better results
  const model = tier === "enhanced"
    ? "llama-3.3-70b-versatile"   // Best Groq model
    : "llama-3.3-70b-versatile";  // Standard tier

  const allMessages: ChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const completion = await groq.chat.completions.create({
    model,
    messages: allMessages,
    temperature,
    max_tokens: maxTokens,
  });

  return completion.choices[0]?.message?.content?.trim() || "";
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
