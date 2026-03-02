/**
 * DART Open API 클라이언트.
 * DART_API_KEY 환경변수 필요.
 */

const BASE_URL = "https://opendart.fss.or.kr/api";
const TIMEOUT_MS = 5_000;

export class DartClient {
  private apiKey: string;

  constructor() {
    const key = process.env.DART_API_KEY;
    if (!key) {
      throw new Error("DART_API_KEY not set");
    }
    this.apiKey = key;
  }

  async get(path: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("crtfc_key", this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url.toString(), { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`DART API error: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }
}
