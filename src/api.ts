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

export type GatewaySummaryResponse = {
  bySource: Record<
    string,
    {
      count: number;
      amount_minor: number;
      currency: string;
    }
  >;
  totalEvents: number;
};

export type GatewayEventsResponse = {
  items: Array<{
    event_id: string;
    source: string;
    merchant_id: string;
    occurred_at: string;
    status: string;
    direction: string;
    money: { currency: string; amount_minor: number };
    channel: string;
    source_transaction_id: string;
    counterparty?: string | null;
  }>;
  total: number;
};

export type GatewayFeaturesResponse = {
  merchantId: string;
  features: {
    feature_version: string;
    window: { windowDays: number; windowStart: string; windowEnd: string };
    tx_count_total: number;
    tx_count_in: number;
    tx_count_out: number;
    active_days: number;
    monthly_revenue_mean_minor: number;
    monthly_revenue_cv: number;
    revenue_stability: number;
    tx_frequency_per_day: number;
    avg_tx_size_minor: number;
    seasonality_index: number;
    cashflow_consistency: number;
    inflow_outflow_ratio: number;
    sources: Record<string, number>;
    channels: Record<string, number>;
  };
};

export type ScoreFromGatewayResponse =
  | {
      success: true;
      passport: unknown;
      verificationHash: string;
      explorerUrl: string | null;
    }
  | {
      success: false;
      error: string;
    };

export type VerifyPassportHashResponse = {
  accountId: string;
  computedHash: string;
  matchesExpected: boolean | null;
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
