/**
 * Unified AI client — abstracts the underlying model provider.
 * Free plan: standard AI (fast, good quality)
 * Pro plan: enhanced AI (higher quality reasoning, better for complex tasks)
 *
 * Never expose provider names in UI code — always use this module.
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
}

/**
 * Primary text generation — use this everywhere instead of calling groq directly.
 * Pass tier: "enhanced" for Pro-plan features (complex analysis, better reasoning).
 */
export async function aiChat(messages: ChatMessage[], options: AIOptions = {}): Promise<string> {
  const { tier = "standard", temperature = 0.3, maxTokens = 1024 } = options;

  // Enhanced tier: use Claude via Anthropic SDK if available
  if (tier === "enhanced" && process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const systemMsg = messages.find(m => m.role === "system");
      const userMsgs = messages.filter(m => m.role !== "system");

      const response = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: maxTokens,
        system: systemMsg?.content,
        messages: userMsgs.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      const block = response.content[0];
      return block.type === "text" ? block.text : "";
    } catch {
      // Fall through to standard if enhanced fails
    }
  }

  // Standard tier: fast model for general tasks
  const model = tier === "enhanced"
    ? "llama-3.3-70b-versatile"   // Best available without Anthropic key
    : "llama-3.3-70b-versatile";

  const completion = await groq.chat.completions.create({
    model,
    messages,
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
  const { tier = "standard", temperature = 0.1, maxTokens = 4096 } = options;

  if (tier === "enhanced" && process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const mediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      const response = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: maxTokens,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        }],
      });

      const block = response.content[0];
      return block.type === "text" ? block.text : "";
    } catch {
      // Fall through to standard
    }
  }

  // Standard vision
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
