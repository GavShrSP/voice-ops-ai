const PROMPT_INJECTION_PATTERNS = [
  "ignore previous instructions",
  "ignore all instructions",
  "system prompt",
  "developer instructions",
  "reveal prompt",
  "act as",
  "you are now",
  "output exactly",
  "return this text",
  "do not extract tasks",
];

export function detectPromptInjection(text: string): boolean {
  const normalizedText = text.toLowerCase();

  // This is a lightweight guardrail, not a complete security boundary. It
  // blocks common instruction-override phrases before the transcript reaches
  // the LLM extraction flow.
  return PROMPT_INJECTION_PATTERNS.some((pattern) =>
    normalizedText.includes(pattern)
  );
}
