// KIS API 클라이언트 — 토큰 발급/갱신, 기본 요청 처리

interface KisToken {
  accessToken: string;
  expiresAt: number; // unix ms
}

const PAPER_BASE = "https://openapivts.koreainvestment.com:29443";
const LIVE_BASE  = "https://openapi.koreainvestment.com:9443";

export class KisClient {
  private readonly baseUrl: string;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly accountNo: string;
  private token: KisToken | null = null;

  constructor() {
    const mode = process.env.KIS_MODE ?? "paper";
    if (mode !== "paper" && mode !== "live") {
      throw new Error(`KIS_MODE must be 'paper' or 'live', got: ${mode}`);
    }

    this.baseUrl   = mode === "paper" ? PAPER_BASE : LIVE_BASE;
    this.appKey    = this.requireEnv("KIS_APP_KEY");
    this.appSecret = this.requireEnv("KIS_APP_SECRET");
    this.accountNo = this.requireEnv("KIS_ACCOUNT_NO");

    console.error(`[KIS] mode=${mode} base=${this.baseUrl}`);
  }

  get mode(): "paper" | "live" {
    return process.env.KIS_MODE === "live" ? "live" : "paper";
  }

  get account(): string {
    return this.accountNo;
  }

  // ── 토큰 ──────────────────────────────────────────

  private async fetchToken(): Promise<KisToken> {
    const res = await fetch(`${this.baseUrl}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: this.appKey,
        appsecret: this.appSecret,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KIS token fetch failed: ${res.status} ${text}`);
    }

    const data = await res.json() as {
      access_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      // expires_in은 초 단위. 1분 여유를 두고 만료 처리
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
  }

  private async getToken(): Promise<string> {
    if (!this.token || Date.now() >= this.token.expiresAt) {
      console.error("[KIS] 토큰 발급/갱신 중...");
      this.token = await this.fetchToken();
      console.error("[KIS] 토큰 발급 완료");
    }
    return this.token.accessToken;
  }

  // ── 공통 요청 ──────────────────────────────────────

  async get<T>(path: string, params: Record<string, string>, trId: string): Promise<T> {
    const token = await this.getToken();
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: this.appKey,
        appsecret: this.appSecret,
        tr_id: trId,
        custtype: "P",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KIS GET ${path} failed: ${res.status} ${text}`);
    }

    const json = await res.json() as { rt_cd: string; msg1: string; output?: unknown; output1?: unknown; output2?: unknown };
    if (json.rt_cd !== "0") {
      throw new Error(`KIS API error: ${json.msg1}`);
    }

    return json as T;
  }

  async post<T>(path: string, body: Record<string, unknown>, trId: string): Promise<T> {
    const token = await this.getToken();

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
        appkey: this.appKey,
        appsecret: this.appSecret,
        tr_id: trId,
        custtype: "P",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KIS POST ${path} failed: ${res.status} ${text}`);
    }

    const json = await res.json() as { rt_cd: string; msg1: string; output?: unknown };
    if (json.rt_cd !== "0") {
      throw new Error(`KIS API error: ${json.msg1}`);
    }

    return json as T;
  }

  private requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`환경변수 ${key}가 설정되지 않았습니다`);
    return val;
  }
}
