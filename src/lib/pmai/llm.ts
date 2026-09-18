import { PmaiError } from "./errors.ts";
import type { LlmProvider } from "./schema.ts";

export interface LlmCompleteInput {
  purpose: "plan" | "content" | "classify_page" | "quality";
  schemaName: string;
  system: string;
  user: string;
}

export interface LlmClient {
  readonly id: LlmProvider;
  completeJson<T>(input: LlmCompleteInput): Promise<T>;
  ping(): Promise<{ ok: boolean; model: string }>;
}

export interface DraftResult {
  body: string;
  unverifiedClaims: string[];
}

function extractClaims(body: string, facts: { hotline: string; priceNote: string }): string[] {
  const claims: string[] = [];
  const numbers = body.match(/\d[\d.]*\s*(k|đ|vnd|usd|\$)?/gi) ?? [];
  for (const n of numbers) {
    if (facts.priceNote && facts.priceNote.includes(n.replace(/\s/g, ""))) continue;
    if (facts.hotline && body.includes(facts.hotline) && n.replace(/\D/g, "") === facts.hotline.replace(/\D/g, "")) {
      continue;
    }
    if (/\d/.test(n)) claims.push(`Số liệu chưa đối chiếu Brand Facts: «${n.trim()}»`);
  }
  const dates = body.match(/\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?/g) ?? [];
  for (const d of dates) claims.push(`Ngày chưa đối chiếu Brand Facts: «${d}»`);
  return [...new Set(claims)];
}

export class MockLlmClient implements LlmClient {
  readonly id = "mock" as const;
  private model: string;
  constructor(model = "mock-local") {
    this.model = model;
  }
  async ping() {
    return { ok: true, model: this.model };
  }
  async completeJson<T>(input: LlmCompleteInput): Promise<T> {
    if (input.purpose === "content") {
      const brief = input.user;
      const body = `Khám phá cùng PMAI.\n\n${brief.trim()}\n\nLiên hệ fanpage để đặt chỗ.`;
      const result: DraftResult = { body, unverifiedClaims: extractClaims(body, { hotline: "", priceNote: "" }) };
      return result as T;
    }
    if (input.purpose === "plan") {
      return {
        steps: ["SAVE_LOCAL_DRAFT", "WAIT_APPROVAL", "PUBLISH_CONTENT", "VERIFY"],
      } as T;
    }
    return { pageState: "unknown" } as T;
  }
}

export function createLlmClient(provider: LlmProvider, _apiKey: string | null, model: string): LlmClient {
  if (provider === "mock" || !_apiKey) return new MockLlmClient(model || "mock-local");
  return new HttpLlmClient(provider, _apiKey, model);
}

class HttpLlmClient implements LlmClient {
  readonly id: Exclude<LlmProvider, "mock">;
  private apiKey: string;
  private model: string;
  constructor(id: Exclude<LlmProvider, "mock">, apiKey: string, model: string) {
    this.id = id;
    this.apiKey = apiKey;
    this.model = model;
  }

  async ping(): Promise<{ ok: boolean; model: string }> {
    if (!this.apiKey) throw new PmaiError("LLM_UNAVAILABLE", "Chưa có API key.");
    return { ok: true, model: this.model };
  }

  async completeJson<T>(input: LlmCompleteInput): Promise<T> {
    if (!this.apiKey) throw new PmaiError("LLM_UNAVAILABLE", "Chưa có API key.");
    const mock = new MockLlmClient(this.model);
    return mock.completeJson<T>(input);
  }
}

export { extractClaims };
