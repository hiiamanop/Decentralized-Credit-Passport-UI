import { useEffect, useMemo, useState } from "react";
import {
  apiGet,
  apiPost,
  type ApiConfig,
  type CreatePassportResponse,
  type PassportPublicResponse,
  type PassportSummaryResponse,
  type ScoreResponse,
  type SetPublicResponse,
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
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedBaseUrl = useMemo(() => baseUrl.replace(/\/+$/, ""), [baseUrl]);

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

  useEffect(() => {
    void refreshConfig();
  }, [normalizedBaseUrl]);

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Credit Passport AI Oracle</h1>
          <p className="muted">Demo UI untuk create passport, scoring, dan privacy toggle</p>
        </div>
        <div className="row">
          <label className="label">
            Backend URL
            <input
              className="input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:3000"
            />
          </label>
          <button className="button" onClick={refreshConfig} disabled={loading !== null}>
            Refresh Config
          </button>
        </div>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <section className="card">
        <h2>Config</h2>
        <div className="grid">
          <div className="kv">
            <div className="k">Network</div>
            <div className="v">{config?.networkId ?? "-"}</div>
          </div>
          <div className="kv">
            <div className="k">RPC</div>
            <div className="v">{config?.rpcUrl ?? "-"}</div>
          </div>
          <div className="kv">
            <div className="k">Oracle Account</div>
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
      </section>

      <section className="card">
        <h2>Passport</h2>
        <div className="row wrap">
          <label className="label">
            Account ID
            <input className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
          </label>
          <button className="button" onClick={refreshPassport} disabled={!accountId || loading !== null}>
            Refresh Passport
          </button>
        </div>

        <div className="row wrap">
          <label className="label">
            Business ID
            <input className="input" value={businessId} onChange={(e) => setBusinessId(e.target.value)} />
          </label>
          <button className="button" onClick={createPassport} disabled={loading !== null}>
            {loading === "create" ? "Creating..." : "Create Passport"}
          </button>
        </div>

        {createResult ? (
          <div className="result">
            <div className="kv">
              <div className="k">Create Result</div>
              <div className="v">
                {createResult.success ? "Success" : "Failed"}
                {createResult.explorerUrl ? (
                  <span>
                    {" "}
                    ·{" "}
                    <a href={createResult.explorerUrl} target="_blank" rel="noreferrer">
                      Explorer
                    </a>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="split">
          <div className="panel">
            <h3>Summary (view-safe)</h3>
            <pre className="pre">{JSON.stringify(summaryResult?.summary ?? null, null, 2)}</pre>
          </div>
          <div className="panel">
            <h3>Public Detail (opt-in)</h3>
            <pre className="pre">{JSON.stringify(publicResult?.public ?? null, null, 2)}</pre>
          </div>
        </div>

        <div className="row wrap">
          <button
            className="button secondary"
            onClick={() => togglePublic(true)}
            disabled={loading !== null || publicEnabled}
          >
            {loading === "public" ? "Updating..." : "Set Public = True"}
          </button>
          <button
            className="button secondary"
            onClick={() => togglePublic(false)}
            disabled={loading !== null || !publicEnabled}
          >
            {loading === "public" ? "Updating..." : "Set Public = False"}
          </button>
          <div className="badge">{publicEnabled ? "Public: ON" : "Public: OFF"}</div>
        </div>
      </section>

      <section className="card">
        <h2>Scoring</h2>
        <div className="grid form">
          <label className="label">
            Monthly Income
            <input
              className="input"
              value={financialData.monthlyIncome}
              onChange={(e) =>
                setFinancialData((p) => ({ ...p, monthlyIncome: toNumber(e.target.value, p.monthlyIncome) }))
              }
            />
          </label>
          <label className="label">
            Age
            <input
              className="input"
              value={financialData.age}
              onChange={(e) => setFinancialData((p) => ({ ...p, age: toNumber(e.target.value, p.age) }))}
            />
          </label>
          <label className="label">
            Loan Amount
            <input
              className="input"
              value={financialData.loanAmount}
              onChange={(e) => setFinancialData((p) => ({ ...p, loanAmount: toNumber(e.target.value, p.loanAmount) }))}
            />
          </label>
          <label className="label">
            Loan Interest Rate
            <input
              className="input"
              value={financialData.loanIntRate}
              onChange={(e) =>
                setFinancialData((p) => ({ ...p, loanIntRate: toNumber(e.target.value, p.loanIntRate) }))
              }
            />
          </label>
          <label className="label">
            Credit History Length
            <input
              className="input"
              value={financialData.creditHistoryLen}
              onChange={(e) =>
                setFinancialData((p) => ({ ...p, creditHistoryLen: toNumber(e.target.value, p.creditHistoryLen) }))
              }
            />
          </label>
          <label className="label checkbox">
            <span>Default History</span>
            <input
              type="checkbox"
              checked={financialData.defaultHistory}
              onChange={(e) => setFinancialData((p) => ({ ...p, defaultHistory: e.target.checked }))}
            />
          </label>
        </div>
        <div className="row wrap">
          <button className="button" onClick={calculateScore} disabled={!accountId || loading !== null}>
            {loading === "score" ? "Scoring..." : "Calculate Score"}
          </button>
          {scoreResult?.explorerUrl ? (
            <a className="link" href={scoreResult.explorerUrl} target="_blank" rel="noreferrer">
              Open Explorer
            </a>
          ) : null}
        </div>
        <pre className="pre">{JSON.stringify(scoreResult, null, 2)}</pre>
      </section>
    </div>
  );
}
