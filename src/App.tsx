import { useEffect, useMemo, useState } from "react";
import {
  apiGet,
  apiPost,
  type ApiConfig,
  type CreatePassportResponse,
  type GatewayEventsResponse,
  type GatewayFeaturesResponse,
  type GatewaySummaryResponse,
  type PassportPublicResponse,
  type PassportSummaryResponse,
  type ScoreResponse,
  type ScoreFromGatewayResponse,
  type SetPublicResponse,
  type VerifyPassportHashResponse,
} from "./api";

type FinancialData = {
  monthlyIncome: number;
  age: number;
  loanAmount: number;
  loanIntRate: number;
  defaultHistory: boolean;
  creditHistoryLen: number;
};

const defaultFinancialData: FinancialData = {
  monthlyIncome: 5000,
  age: 30,
  loanAmount: 1000,
  loanIntRate: 10,
  defaultHistory: false,
  creditHistoryLen: 3,
};

function toNumber(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatIdrMinor(amountMinor: number): string {
  const v = Math.round(amountMinor);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const rupiah = Math.floor(abs / 100);
  return `${sign}Rp ${rupiah.toLocaleString("id-ID")}`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", { hour12: false });
}

function riskTone(risk?: string | null): "low" | "medium" | "high" | "unknown" {
  if (!risk) return "unknown";
  const v = String(risk).toLowerCase();
  if (v.includes("low")) return "low";
  if (v.includes("medium")) return "medium";
  if (v.includes("high")) return "high";
  return "unknown";
}

type TabKey = "overview" | "gateway" | "passport";

export default function App() {
  const [baseUrl, setBaseUrl] = useState("http://localhost:3000");
  const [config, setConfig] = useState<ApiConfig | null>(null);

  const [accountId, setAccountId] = useState("");
  const [businessId, setBusinessId] = useState("BIZ-123");
  const [financialData, setFinancialData] = useState<FinancialData>(defaultFinancialData);
  const [publicEnabled, setPublicEnabled] = useState(false);

  const [createResult, setCreateResult] = useState<CreatePassportResponse | null>(null);
  const [scoreResult, setScoreResult] = useState<ScoreResponse | null>(null);
  const [publicResult, setPublicResult] = useState<PassportPublicResponse | null>(null);
  const [summaryResult, setSummaryResult] = useState<PassportSummaryResponse | null>(null);
  const [gwSummary, setGwSummary] = useState<GatewaySummaryResponse | null>(null);
  const [gwEvents, setGwEvents] = useState<GatewayEventsResponse | null>(null);
  const [gwFeatures, setGwFeatures] = useState<GatewayFeaturesResponse | null>(null);
  const [gwMerchantId, setGwMerchantId] = useState("umkm-001");
  const [gwSource, setGwSource] = useState("");
  const [gwWindowDays, setGwWindowDays] = useState(90);

  const [scoreGatewayResult, setScoreGatewayResult] = useState<ScoreFromGatewayResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyPassportHashResponse | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("overview");
  const normalizedBaseUrl = useMemo(() => baseUrl.replace(/\/+$/, ""), [baseUrl]);
  const backendStatus = config ? "online" : "unknown";

  async function refreshConfig() {
    setError(null);
    try {
      const cfg = await apiGet<ApiConfig>(normalizedBaseUrl, "/config");
      setConfig(cfg);
      if (!accountId) {
        setAccountId(cfg.oracleAccountId);
      }
    } catch (e: any) {
      setError(e?.message || "Gagal mengambil config");
    }
  }


  async function refreshPassport() {
    setError(null);
    if (!accountId) return;
    try {
      const [summary, pub] = await Promise.all([
        apiGet<PassportSummaryResponse>(normalizedBaseUrl, `/passport/summary/${accountId}`),
        apiGet<PassportPublicResponse>(normalizedBaseUrl, `/passport/public/${accountId}`),
      ]);
      setSummaryResult(summary);
      setPublicResult(pub);
      setPublicEnabled(Boolean(summary.summary?.is_public));
    } catch (e: any) {
      setError(e?.message || "Gagal refresh passport");
    }
  }

  async function createPassport() {
    setError(null);
    setLoading("create");
    setCreateResult(null);
    try {
      const resp = await apiPost<CreatePassportResponse>(normalizedBaseUrl, "/passport/create", { businessId });
      setCreateResult(resp);
      await refreshPassport();
    } catch (e: any) {
      setError(e?.message || "Gagal create passport");
    } finally {
      setLoading(null);
    }
  }

  async function calculateScore() {
    setError(null);
    setLoading("score");
    setScoreResult(null);
    try {
      const resp = await apiPost<ScoreResponse>(normalizedBaseUrl, "/calculate-score", { accountId, financialData });
      setScoreResult(resp);
      await refreshPassport();
    } catch (e: any) {
      setError(e?.message || "Gagal calculate score");
    } finally {
      setLoading(null);
    }
  }

  async function togglePublic(next: boolean) {
    setError(null);
    setLoading("public");
    try {
      const resp = await apiPost<SetPublicResponse>(normalizedBaseUrl, "/passport/public", { enabled: next });
      if (!resp.success) {
        setError(resp.error || "Gagal update public flag");
      }
      await refreshPassport();
    } catch (e: any) {
      setError(e?.message || "Gagal update public flag");
    } finally {
      setLoading(null);
    }
  }

  async function refreshGateway() {
    setError(null);
    try {
      const [s, e, f] = await Promise.all([
        apiGet<GatewaySummaryResponse>(normalizedBaseUrl, "/gateway/summary"),
        apiGet<GatewayEventsResponse>(
          normalizedBaseUrl,
          `/gateway/events?limit=50${gwMerchantId ? `&merchantId=${encodeURIComponent(gwMerchantId)}` : ""}${
            gwSource ? `&source=${encodeURIComponent(gwSource)}` : ""
          }`
        ),
        gwMerchantId
          ? apiGet<GatewayFeaturesResponse>(
              normalizedBaseUrl,
              `/gateway/features?merchantId=${encodeURIComponent(gwMerchantId)}&windowDays=${encodeURIComponent(
                String(gwWindowDays)
              )}`
            )
          : Promise.resolve(null as any),
      ]);
      setGwSummary(s);
      setGwEvents(e);
      setGwFeatures(f);
    } catch (err: any) {
      setError(err?.message || "Gagal refresh gateway");
    }
  }

  async function calculateScoreFromGateway() {
    setError(null);
    setLoading("score_gateway");
    setScoreGatewayResult(null);
    setVerifyResult(null);
    try {
      const resp = await apiPost<ScoreFromGatewayResponse>(normalizedBaseUrl, "/calculate-score-from-gateway", {
        accountId,
        merchantId: gwMerchantId,
        windowDays: gwWindowDays,
      });
      setScoreGatewayResult(resp);
      await refreshPassport();
    } catch (e: any) {
      setError(e?.message || "Gagal scoring dari gateway");
    } finally {
      setLoading(null);
    }
  }

  async function verifyPassportHash() {
    setError(null);
    setLoading("verify_hash");
    setVerifyResult(null);
    try {
      if (!scoreGatewayResult || scoreGatewayResult.success !== true) {
        setError("Belum ada passport payload untuk diverifikasi");
        return;
      }
      const resp = await apiPost<VerifyPassportHashResponse>(normalizedBaseUrl, "/verify-passport-hash", {
        accountId,
        passport: scoreGatewayResult.passport,
        expectedHash: scoreGatewayResult.verificationHash,
      });
      setVerifyResult(resp);
    } catch (e: any) {
      setError(e?.message || "Gagal verifikasi hash");
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    void refreshConfig();
  }, [normalizedBaseUrl]);

  const netGateway = useMemo(() => {
    const bySource = gwSummary?.bySource ?? {};
    let net = 0;
    for (const k of Object.keys(bySource)) net += bySource[k]?.amount_minor ?? 0;
    return net;
  }, [gwSummary]);

  const gatewayAi = useMemo(() => {
    if (!scoreGatewayResult || scoreGatewayResult.success !== true) return null;
    const p: any = scoreGatewayResult.passport as any;
    const ai: any = p?.ai_score ?? null;
    const score = typeof ai?.credit_score === "number" ? ai.credit_score : null;
    const riskCategory = typeof ai?.risk_category === "string" ? ai.risk_category : typeof ai?.risk_level === "string" ? ai.risk_level : null;
    const prob = typeof ai?.probability_of_default === "number" ? ai.probability_of_default : null;
    return { score, riskCategory, prob };
  }, [scoreGatewayResult]);

  const scorePercent = gatewayAi?.score !== null && gatewayAi?.score !== undefined ? clamp01(gatewayAi.score / 1000) : null;
  const scoreTone = riskTone(gatewayAi?.riskCategory ?? null);

  const events = gwEvents?.items ?? [];

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brandTitle">Decentralized Credit Passport</div>
          <div className="brandSub">MSME alternative data + AI scoring + NEAR verification</div>
        </div>

        <div className="topActions">
          <div className={`chip ${backendStatus === "online" ? "ok" : ""}`}>Backend: {backendStatus}</div>
          <label className="field">
            <div className="fieldLabel">Backend URL</div>
            <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:3000" />
          </label>
          <button className="button" onClick={refreshConfig} disabled={loading !== null}>
            Sync
          </button>
        </div>
      </div>

      <div className="container">
        <div className="hero">
          <div className="heroLeft">
            <h1>Credit Passport Dashboard</h1>
            <p className="muted">
              Alur demo: ingest data → feature engineering → AI score → hash passport → update on-chain → verifikasi.
            </p>
            <div className="heroStats">
              <div className="stat">
                <div className="statK">Gateway Events</div>
                <div className="statV">{gwSummary?.totalEvents ?? "-"}</div>
              </div>
              <div className="stat">
                <div className="statK">Net Cashflow</div>
                <div className="statV">{gwSummary ? formatIdrMinor(netGateway) : "-"}</div>
              </div>
              <div className="stat">
                <div className="statK">Contract</div>
                <div className="statV mono">{config?.contractId ? String(config.contractId).slice(0, 18) + "…" : "-"}</div>
              </div>
            </div>
          </div>
          <div className="heroRight">
            <div className="tabs">
              <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>
                Overview
              </button>
              <button className={`tab ${tab === "gateway" ? "active" : ""}`} onClick={() => setTab("gateway")}>
                Data Gateway
              </button>
              <button className={`tab ${tab === "passport" ? "active" : ""}`} onClick={() => setTab("passport")}>
                Passport
              </button>
            </div>

            <div className="quickCard">
              <div className="quickRow">
                <label className="field">
                  <div className="fieldLabel">Account ID</div>
                  <input className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="owner.testnet" />
                </label>
                <label className="field">
                  <div className="fieldLabel">Merchant ID</div>
                  <input className="input" value={gwMerchantId} onChange={(e) => setGwMerchantId(e.target.value)} placeholder="umkm-001" />
                </label>
              </div>
              <div className="quickRow">
                <button className="button secondary" onClick={refreshGateway} disabled={loading !== null}>
                  Refresh Gateway
                </button>
                <button className="button" onClick={calculateScoreFromGateway} disabled={!accountId || !gwMerchantId || loading !== null}>
                  {loading === "score_gateway" ? "Scoring..." : "Score from Gateway"}
                </button>
              </div>
              {gatewayAi?.score !== null && gatewayAi?.score !== undefined ? (
                <div className="scoreMini">
                  <div className="scoreMiniLeft">
                    <div className="scoreMiniLabel">Credit Score</div>
                    <div className="scoreMiniValue">{gatewayAi.score}</div>
                  </div>
                  <div className={`pill ${scoreTone}`}>{gatewayAi.riskCategory ?? "unknown"}</div>
                </div>
              ) : null}
              {scoreGatewayResult?.success ? (
                <div className="kvLine">
                  <div className="k">verification_hash</div>
                  <div className="v mono">{scoreGatewayResult.verificationHash}</div>
                </div>
              ) : null}
              {scoreGatewayResult?.success && scoreGatewayResult.explorerUrl ? (
                <a className="link" href={scoreGatewayResult.explorerUrl} target="_blank" rel="noreferrer">
                  Open NEAR Explorer
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {error ? <div className="alert">{error}</div> : null}

        {tab === "overview" ? (
          <section className="gridCards">
            <div className="card">
              <div className="cardTitle">Konfigurasi</div>
              <div className="kv">
                <div className="k">Network</div>
                <div className="v">{config?.networkId ?? "-"}</div>
              </div>
              <div className="kv">
                <div className="k">RPC</div>
                <div className="v">{config?.rpcUrl ?? "-"}</div>
              </div>
              <div className="kv">
                <div className="k">Oracle</div>
                <div className="v">{config?.oracleAccountId ?? "-"}</div>
              </div>
              <div className="kv">
                <div className="k">Contract</div>
                <div className="v">{config?.contractId ?? "-"}</div>
              </div>
              <div className="kv">
                <div className="k">AI Service</div>
                <div className="v">{config?.aiServiceUrl ?? "-"}</div>
              </div>
            </div>

            <div className="card">
              <div className="cardTitle">Gateway Snapshot</div>
              <div className="kv">
                <div className="k">Merchant</div>
                <div className="v mono">{gwMerchantId}</div>
              </div>
              <div className="kv">
                <div className="k">Total Events</div>
                <div className="v">{gwSummary?.totalEvents ?? "-"}</div>
              </div>
              <div className="kv">
                <div className="k">Net Cashflow</div>
                <div className="v">{gwSummary ? formatIdrMinor(netGateway) : "-"}</div>
              </div>
              <div className="kv">
                <div className="k">Window Days</div>
                <div className="v">{gwWindowDays}</div>
              </div>
              <button className="button secondary full" onClick={refreshGateway} disabled={loading !== null}>
                Refresh Data
              </button>
              <details className="details">
                <summary>Raw summary</summary>
                <pre className="pre">{JSON.stringify(gwSummary, null, 2)}</pre>
              </details>
            </div>

            <div className="card">
              <div className="cardTitle">Score dari Gateway</div>
              <div className="scoreCard">
                <div className="scoreHeader">
                  <div>
                    <div className="scoreK">Credit Score</div>
                    <div className="scoreV">{gatewayAi?.score ?? "-"}</div>
                  </div>
                  <div className={`pill ${scoreTone}`}>{gatewayAi?.riskCategory ?? "unknown"}</div>
                </div>
                <div className="bar">
                  <div className={`barFill ${scoreTone}`} style={{ width: `${scorePercent !== null ? scorePercent * 100 : 0}%` }} />
                </div>
                <div className="scoreMeta">
                  <div className="scoreMetaItem">
                    <div className="scoreMetaK">Probability of Default</div>
                    <div className="scoreMetaV">{gatewayAi?.prob !== null && gatewayAi?.prob !== undefined ? (gatewayAi.prob * 100).toFixed(1) + "%" : "-"}</div>
                  </div>
                  <div className="scoreMetaItem">
                    <div className="scoreMetaK">Window</div>
                    <div className="scoreMetaV">{gwWindowDays} days</div>
                  </div>
                </div>
              </div>
              {scoreGatewayResult && !scoreGatewayResult.success ? (
                <div className="alert subtle">{scoreGatewayResult.error}</div>
              ) : null}
              <div className="row wrap">
                <label className="field">
                  <div className="fieldLabel">Window Days</div>
                  <input className="input" value={gwWindowDays} onChange={(e) => setGwWindowDays(toNumber(e.target.value, gwWindowDays))} />
                </label>
                <button className="button" onClick={calculateScoreFromGateway} disabled={!accountId || !gwMerchantId || loading !== null}>
                  {loading === "score_gateway" ? "Scoring..." : "Score & Update On-chain"}
                </button>
                <button className="button secondary" onClick={verifyPassportHash} disabled={loading !== null || !scoreGatewayResult?.success}>
                  {loading === "verify_hash" ? "Verifying..." : "Verify Hash (off-chain)"}
                </button>
              </div>
              {verifyResult ? (
                <div className="kvLine">
                  <div className="k">Hash match</div>
                  <div className="v">{String(verifyResult.matchesExpected)}</div>
                </div>
              ) : null}
              {scoreGatewayResult?.success ? (
                <details className="details">
                  <summary>Passport payload & response</summary>
                  <pre className="pre">{JSON.stringify(scoreGatewayResult, null, 2)}</pre>
                </details>
              ) : null}
            </div>
          </section>
        ) : null}

        {tab === "passport" ? (
          <section className="gridCards">
            <div className="card">
              <div className="cardTitle">Passport (On-chain)</div>
              <div className="row wrap">
                <button className="button secondary" onClick={refreshPassport} disabled={!accountId || loading !== null}>
                  Refresh Passport
                </button>
                <div className="badge">{publicEnabled ? "Public: ON" : "Public: OFF"}</div>
              </div>

              <div className="row wrap">
                <label className="field">
                  <div className="fieldLabel">Business ID</div>
                  <input className="input" value={businessId} onChange={(e) => setBusinessId(e.target.value)} />
                </label>
                <button className="button" onClick={createPassport} disabled={loading !== null}>
                  {loading === "create" ? "Creating..." : "Create Passport"}
                </button>
                {createResult?.explorerUrl ? (
                  <a className="link" href={createResult.explorerUrl} target="_blank" rel="noreferrer">
                    Explorer
                  </a>
                ) : null}
              </div>

              <div className="row wrap">
                <button className="button secondary" onClick={() => togglePublic(true)} disabled={loading !== null || publicEnabled}>
                  {loading === "public" ? "Updating..." : "Set Public = True"}
                </button>
                <button className="button secondary" onClick={() => togglePublic(false)} disabled={loading !== null || !publicEnabled}>
                  {loading === "public" ? "Updating..." : "Set Public = False"}
                </button>
              </div>

              <div className="split">
                <div className="panel">
                  <h3>Summary</h3>
                  <pre className="pre">{JSON.stringify(summaryResult?.summary ?? null, null, 2)}</pre>
                </div>
                <div className="panel">
                  <h3>Public</h3>
                  <pre className="pre">{JSON.stringify(publicResult?.public ?? null, null, 2)}</pre>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="cardTitle">Legacy Scoring (manual input)</div>
              <div className="grid form">
                <label className="label">
                  Monthly Income
                  <input
                    className="input"
                    value={financialData.monthlyIncome}
                    onChange={(e) => setFinancialData((p) => ({ ...p, monthlyIncome: toNumber(e.target.value, p.monthlyIncome) }))}
                  />
                </label>
                <label className="label">
                  Age
                  <input className="input" value={financialData.age} onChange={(e) => setFinancialData((p) => ({ ...p, age: toNumber(e.target.value, p.age) }))} />
                </label>
                <label className="label">
                  Loan Amount
                  <input className="input" value={financialData.loanAmount} onChange={(e) => setFinancialData((p) => ({ ...p, loanAmount: toNumber(e.target.value, p.loanAmount) }))} />
                </label>
                <label className="label">
                  Loan Interest Rate
                  <input className="input" value={financialData.loanIntRate} onChange={(e) => setFinancialData((p) => ({ ...p, loanIntRate: toNumber(e.target.value, p.loanIntRate) }))} />
                </label>
                <label className="label">
                  Credit History Length
                  <input className="input" value={financialData.creditHistoryLen} onChange={(e) => setFinancialData((p) => ({ ...p, creditHistoryLen: toNumber(e.target.value, p.creditHistoryLen) }))} />
                </label>
                <label className="label checkbox">
                  <span>Default History</span>
                  <input type="checkbox" checked={financialData.defaultHistory} onChange={(e) => setFinancialData((p) => ({ ...p, defaultHistory: e.target.checked }))} />
                </label>
              </div>
              <div className="row wrap">
                <button className="button secondary" onClick={calculateScore} disabled={!accountId || loading !== null}>
                  {loading === "score" ? "Scoring..." : "Calculate Score"}
                </button>
                {scoreResult?.explorerUrl ? (
                  <a className="link" href={scoreResult.explorerUrl} target="_blank" rel="noreferrer">
                    Explorer
                  </a>
                ) : null}
              </div>
              <details className="details">
                <summary>Raw response</summary>
                <pre className="pre">{JSON.stringify(scoreResult, null, 2)}</pre>
              </details>
            </div>
          </section>
        ) : null}

        {tab === "gateway" ? (
          <section className="gridCards">
            <div className="card">
              <div className="cardTitle">Filter</div>
              <div className="row wrap">
                <label className="field">
                  <div className="fieldLabel">Merchant ID</div>
                  <input className="input" value={gwMerchantId} onChange={(e) => setGwMerchantId(e.target.value)} />
                </label>
                <label className="field">
                  <div className="fieldLabel">Source (opsional)</div>
                  <input className="input" value={gwSource} onChange={(e) => setGwSource(e.target.value)} placeholder="qris" />
                </label>
                <label className="field">
                  <div className="fieldLabel">Window Days</div>
                  <input className="input" value={gwWindowDays} onChange={(e) => setGwWindowDays(toNumber(e.target.value, gwWindowDays))} />
                </label>
                <button className="button" onClick={refreshGateway} disabled={loading !== null}>
                  Refresh
                </button>
              </div>
              <div className="hint">
                Untuk mengisi data demo: jalankan <span className="mono">docker compose --profile demo run --rm gateway-demo</span>
              </div>
            </div>

            <div className="card">
              <div className="cardTitle">Summary</div>
              <div className="summaryGrid">
                <div className="summaryItem">
                  <div className="summaryK">Total Events</div>
                  <div className="summaryV">{gwSummary?.totalEvents ?? "-"}</div>
                </div>
                <div className="summaryItem">
                  <div className="summaryK">Net Cashflow</div>
                  <div className="summaryV">{gwSummary ? formatIdrMinor(netGateway) : "-"}</div>
                </div>
                <div className="summaryItem">
                  <div className="summaryK">Active Days</div>
                  <div className="summaryV">{gwFeatures?.features.active_days ?? "-"}</div>
                </div>
                <div className="summaryItem">
                  <div className="summaryK">Tx/Day</div>
                  <div className="summaryV">{gwFeatures ? gwFeatures.features.tx_frequency_per_day.toFixed(2) : "-"}</div>
                </div>
              </div>
              <details className="details">
                <summary>Raw summary</summary>
                <pre className="pre">{JSON.stringify(gwSummary, null, 2)}</pre>
              </details>
            </div>

            <div className="card">
              <div className="cardTitle">Features</div>
              <div className="featureGrid">
                <div className="featureItem">
                  <div className="featureK">Revenue Stability</div>
                  <div className="featureV">{gwFeatures ? (gwFeatures.features.revenue_stability * 100).toFixed(0) + "%" : "-"}</div>
                </div>
                <div className="featureItem">
                  <div className="featureK">Avg Tx Size</div>
                  <div className="featureV">{gwFeatures ? formatIdrMinor(gwFeatures.features.avg_tx_size_minor) : "-"}</div>
                </div>
                <div className="featureItem">
                  <div className="featureK">Cashflow Consistency</div>
                  <div className="featureV">{gwFeatures ? (gwFeatures.features.cashflow_consistency * 100).toFixed(0) + "%" : "-"}</div>
                </div>
                <div className="featureItem">
                  <div className="featureK">Seasonality Index</div>
                  <div className="featureV">{gwFeatures ? gwFeatures.features.seasonality_index.toFixed(2) : "-"}</div>
                </div>
                <div className="featureItem">
                  <div className="featureK">Tx In / Out</div>
                  <div className="featureV">
                    {gwFeatures ? `${gwFeatures.features.tx_count_in} / ${gwFeatures.features.tx_count_out}` : "-"}
                  </div>
                </div>
                <div className="featureItem">
                  <div className="featureK">Avg Monthly Revenue</div>
                  <div className="featureV">{gwFeatures ? formatIdrMinor(gwFeatures.features.monthly_revenue_mean_minor) : "-"}</div>
                </div>
              </div>
              <details className="details">
                <summary>Raw features</summary>
                <pre className="pre">{JSON.stringify(gwFeatures, null, 2)}</pre>
              </details>
            </div>

            <div className="card wide">
              <div className="cardTitle">Latest Events</div>
              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Source</th>
                      <th>Direction</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Tx ID</th>
                      <th>Counterparty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.length ? (
                      events.slice(0, 25).map((e) => (
                        <tr key={e.event_id}>
                          <td className="mono">{formatDateTime(e.occurred_at)}</td>
                          <td>
                            <span className="pill neutral">{e.source}</span>
                          </td>
                          <td>
                            <span className={`pill ${e.direction === "in" ? "low" : "high"}`}>{e.direction}</span>
                          </td>
                          <td className="mono">{formatIdrMinor((e.direction === "out" ? -1 : 1) * e.money.amount_minor)}</td>
                          <td>
                            <span className="pill neutral">{e.status}</span>
                          </td>
                          <td className="mono">{e.source_transaction_id}</td>
                          <td className="mono">{e.counterparty ?? "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="empty">
                          Belum ada event. Jalankan demo ingest dari Docker.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <details className="details">
                <summary>Raw events</summary>
                <pre className="pre">{JSON.stringify(gwEvents, null, 2)}</pre>
              </details>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
