export type ApiConfig = {
  networkId: string;
  rpcUrl: string;
  oracleAccountId: string;
  contractId: string;
  aiServiceUrl: string;
};

export type ScoreResponse = {
  success: boolean;
  score?: number;
  risk?: string;
  verificationHash?: string;
  explorerUrl?: string | null;
  aiDetails?: unknown;
  error?: string;
};

export type CreatePassportResponse = {
  success: boolean;
  businessId?: string;
  verificationHash?: string;
  explorerUrl?: string | null;
  error?: string;
};

export type SetPublicResponse = {
  success: boolean;
  enabled?: boolean;
  explorerUrl?: string | null;
  error?: string;
};

export type PassportSummaryResponse = {
  accountId: string;
  summary: null | {
    business_id: string;
    owner: string;
    last_updated: number;
    is_public: boolean;
  };
};

export type PassportPublicResponse = {
  accountId: string;
  public: null | {
    business_id: string;
    owner: string;
    credit_score: number;
    risk_level: string;
    last_updated: number;
  };
};

export async function apiGet<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}
