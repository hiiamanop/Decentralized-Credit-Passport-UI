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
  type ScoreFromGatewayResponse,
  type SetPublicResponse,
  type VerifyPassportHashResponse,
} from "./api";

type TabKey = "overview" | "gateway" | "passport";

function toNumber(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatIdrMinor(amountMinor: number): string {
  const v = Math.round(amountMinor);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const rupiah = Math.floor(abs / 100);
  return `${sign}Rp ${rupiah.toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", { hour12: false });
}

function riskTone(risk?: string | null): "success" | "warning" | "danger" | "secondary" {
  if (!risk) return "secondary";
  const v = String(risk).toLowerCase();
  if (v.includes("low")) return "success";
  if (v.includes("medium")) return "warning";
  if (v.includes("high")) return "danger";
  return "secondary";
}

function extractApiErrorMessage(err: any): string {
  const raw = err?.message ? String(err.message) : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const e = (parsed as any).error;
      if (typeof e === "string" && e.trim().length) return e.trim();
    }
  } catch {}
  return raw;
}

export default function AppBootstrap() {
  const [tab, setTab] = useState<TabKey>("overview");

  const [baseUrl, setBaseUrl] = useState("http://localhost:3000");
  const normalizedBaseUrl = useMemo(() => baseUrl.replace(/\/+$/, ""), [baseUrl]);

  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [accountId, setAccountId] = useState("");
  const [businessId, setBusinessId] = useState("BIZ-123");
  const [publicEnabled, setPublicEnabled] = useState(false);

  const [gwMerchantId, setGwMerchantId] = useState("umkm-001");
  const [gwSource, setGwSource] = useState("");
  const [gwWindowDays, setGwWindowDays] = useState(180);

  const [gwSummary, setGwSummary] = useState<GatewaySummaryResponse | null>(null);
  const [gwEvents, setGwEvents] = useState<GatewayEventsResponse | null>(null);
  const [gwFeatures, setGwFeatures] = useState<GatewayFeaturesResponse | null>(null);

  const [scoreGatewayResult, setScoreGatewayResult] = useState<ScoreFromGatewayResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyPassportHashResponse | null>(null);

  const [summaryResult, setSummaryResult] = useState<PassportSummaryResponse | null>(null);
  const [publicResult, setPublicResult] = useState<PassportPublicResponse | null>(null);
  const [createResult, setCreateResult] = useState<CreatePassportResponse | null>(null);
  const [passportNotice, setPassportNotice] = useState<{ tone: "info" | "warning" | "success"; text: string } | null>(null);

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const backendStatus = config ? "online" : "unknown";

  async function refreshConfig() {
    setError(null);
    try {
      const cfg = await apiGet<ApiConfig>(normalizedBaseUrl, "/config");
      setConfig(cfg);
      if (!accountId) setAccountId(cfg.oracleAccountId);
    } catch (e: any) {
      setError(e?.message || "Gagal mengambil config");
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
    } catch (e: any) {
      setError(extractApiErrorMessage(e) || "Gagal scoring dari gateway");
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
      setError(extractApiErrorMessage(e) || "Gagal verifikasi hash");
    } finally {
      setLoading(null);
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
      setError(extractApiErrorMessage(e) || "Gagal refresh passport");
    }
  }

  async function createPassport() {
    setError(null);
    setLoading("create");
    setCreateResult(null);
    setPassportNotice(null);
    try {
      const resp = await apiPost<CreatePassportResponse>(normalizedBaseUrl, "/passport/create", { businessId, accountId });
      setCreateResult(resp);
      await refreshPassport();
    } catch (e: any) {
      const msg = extractApiErrorMessage(e) || "Gagal create passport";
      if (msg.toLowerCase().includes("already exists")) {
        setCreateResult({ success: false, error: msg });
        setPassportNotice({ tone: "info", text: "Passport sudah ada untuk akun ini. Klik Refresh untuk melihat summary." });
        return;
      }
      setError(msg);
    } finally {
      setLoading(null);
    }
  }

  async function togglePublic(next: boolean) {
    setError(null);
    setLoading("public");
    try {
      const resp = await apiPost<SetPublicResponse>(normalizedBaseUrl, "/passport/public", { enabled: next, accountId });
      if (!resp.success) setError(resp.error || "Gagal update public flag");
      await refreshPassport();
    } catch (e: any) {
      setError(extractApiErrorMessage(e) || "Gagal update public flag");
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

  const gatewayExplorerUrl = scoreGatewayResult?.success ? scoreGatewayResult.explorerUrl : null;
  const gatewayOnchain = scoreGatewayResult?.success ? Boolean((scoreGatewayResult as any).onchainUpdated) : false;

  return (
    <div>
      <nav className="navbar navbar-expand-lg bg-light border-bottom">
        <div className="container">
          <span className="navbar-brand fw-semibold">Credit Passport</span>
          <div className="d-flex align-items-center gap-3 ms-auto">
            <span className={`badge text-bg-${backendStatus === "online" ? "success" : "secondary"}`}>
              Backend: {backendStatus}
            </span>
            <div className="input-group input-group-sm">
              <span className="input-group-text">Backend URL</span>
              <input className="form-control" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              <button className="btn btn-primary" onClick={refreshConfig} disabled={loading !== null}>
                Sync
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="container my-4">
        {error ? <div className="alert alert-danger">{error}</div> : null}

        <ul className="nav nav-tabs">
          <li className="nav-item">
            <button className={`nav-link ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>
              Overview
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === "gateway" ? "active" : ""}`} onClick={() => setTab("gateway")}>
              Data Gateway
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === "passport" ? "active" : ""}`} onClick={() => setTab("passport")}>
              Passport
            </button>
          </li>
        </ul>

        <div className="row g-3 mt-1">
          <div className="col-lg-4">
            <div className="card">
              <div className="card-header fw-semibold">Quick</div>
              <div className="card-body">
                <div className="mb-2">
                  <label className="form-label">Account ID</label>
                  <input className="form-control" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
                </div>
                <div className="mb-2">
                  <label className="form-label">Merchant ID</label>
                  <input className="form-control" value={gwMerchantId} onChange={(e) => setGwMerchantId(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label">Window Days</label>
                  <input
                    className="form-control"
                    value={gwWindowDays}
                    onChange={(e) => setGwWindowDays(toNumber(e.target.value, gwWindowDays))}
                  />
                </div>

                <div className="d-flex flex-wrap gap-2">
                  <button className="btn btn-outline-secondary" onClick={refreshGateway} disabled={loading !== null}>
                    Refresh Gateway
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={calculateScoreFromGateway}
                    disabled={!accountId || !gwMerchantId || loading !== null}
                  >
                    {loading === "score_gateway" ? "Scoring..." : "Score from Gateway"}
                  </button>
                  <button
                    className="btn btn-outline-primary"
                    onClick={verifyPassportHash}
                    disabled={loading !== null || !scoreGatewayResult?.success}
                  >
                    {loading === "verify_hash" ? "Verifying..." : "Verify Hash"}
                  </button>
                </div>

                {scoreGatewayResult?.success ? (
                  <div className="mt-3">
                    <div className="d-flex align-items-center gap-2">
                      <span className={`badge text-bg-${gatewayOnchain ? "success" : "secondary"}`}>
                        {gatewayOnchain ? "On-chain" : "Off-chain"}
                      </span>
                      {gatewayExplorerUrl ? (
                        <a className="btn btn-link px-0" href={gatewayExplorerUrl} target="_blank" rel="noreferrer">
                          Explorer
                        </a>
                      ) : null}
                    </div>
                    <div className="small text-secondary">verification_hash</div>
                    <div className="font-monospace small">{scoreGatewayResult.verificationHash}</div>
                  </div>
                ) : null}

                {verifyResult ? (
                  <div className={`alert mt-3 mb-0 ${verifyResult.matchesExpected ? "alert-success" : "alert-warning"}`}>
                    Hash match: {String(verifyResult.matchesExpected)}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="col-lg-8">
            {tab === "overview" ? (
              <div className="row g-3">
                <div className="col-md-6">
                  <div className="card">
                    <div className="card-header fw-semibold">Config</div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-4 text-secondary">Network</div>
                        <div className="col-8">{config?.networkId ?? "-"}</div>
                      </div>
                      <div className="row">
                        <div className="col-4 text-secondary">RPC</div>
                        <div className="col-8 text-truncate">{config?.rpcUrl ?? "-"}</div>
                      </div>
                      <div className="row">
                        <div className="col-4 text-secondary">Oracle</div>
                        <div className="col-8">{config?.oracleAccountId ?? "-"}</div>
                      </div>
                      <div className="row">
                        <div className="col-4 text-secondary">Contract</div>
                        <div className="col-8 text-truncate">{config?.contractId ?? "-"}</div>
                      </div>
                      <div className="row">
                        <div className="col-4 text-secondary">AI</div>
                        <div className="col-8 text-truncate">{config?.aiServiceUrl ?? "-"}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="card">
                    <div className="card-header fw-semibold d-flex align-items-center justify-content-between">
                      <span>Gateway Score</span>
                      <span className={`badge text-bg-${scoreTone}`}>{gatewayAi?.riskCategory ?? "unknown"}</span>
                    </div>
                    <div className="card-body">
                      <div className="display-6 fw-semibold">{gatewayAi?.score ?? "-"}</div>
                      <div className="progress my-2" role="progressbar" aria-label="score">
                        <div className={`progress-bar bg-${scoreTone}`} style={{ width: `${scorePercent !== null ? scorePercent * 100 : 0}%` }} />
                      </div>
                      <div className="d-flex justify-content-between text-secondary small">
                        <span>0</span>
                        <span>1000</span>
                      </div>
                      {gatewayExplorerUrl ? (
                        <div className="mt-2">
                          <span className={`badge text-bg-${gatewayOnchain ? "success" : "secondary"} me-2`}>
                            {gatewayOnchain ? "On-chain updated" : "Off-chain"}
                          </span>
                          <a href={gatewayExplorerUrl} target="_blank" rel="noreferrer">
                            Open explorer
                          </a>
                        </div>
                      ) : null}
                      <div className="mt-2 small">
                        Probability of Default:{" "}
                        <span className="fw-semibold">
                          {gatewayAi?.prob !== null && gatewayAi?.prob !== undefined ? (gatewayAi.prob * 100).toFixed(1) + "%" : "-"}
                        </span>
                      </div>
                      <details className="mt-3">
                        <summary className="small">Raw response</summary>
                        <pre className="small bg-body-tertiary border rounded p-2 mt-2 mb-0">
                          {JSON.stringify(scoreGatewayResult, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                </div>

                <div className="col-12">
                  <div className="card">
                    <div className="card-header fw-semibold">Gateway Snapshot</div>
                    <div className="card-body">
                      <div className="row g-2">
                        <div className="col-sm-4">
                          <div className="text-secondary small">Total Events</div>
                          <div className="fw-semibold">{gwSummary?.totalEvents ?? "-"}</div>
                        </div>
                        <div className="col-sm-4">
                          <div className="text-secondary small">Net Cashflow</div>
                          <div className="fw-semibold">{gwSummary ? formatIdrMinor(netGateway) : "-"}</div>
                        </div>
                        <div className="col-sm-4">
                          <div className="text-secondary small">Merchant</div>
                          <div className="fw-semibold font-monospace">{gwMerchantId}</div>
                        </div>
                      </div>
                      <details className="mt-3">
                        <summary className="small">Raw summary</summary>
                        <pre className="small bg-body-tertiary border rounded p-2 mt-2 mb-0">{JSON.stringify(gwSummary, null, 2)}</pre>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "gateway" ? (
              <div className="row g-3">
                <div className="col-12">
                  <div className="card">
                    <div className="card-header fw-semibold">Filters</div>
                    <div className="card-body">
                      <div className="row g-2">
                        <div className="col-md-4">
                          <label className="form-label">Merchant ID</label>
                          <input className="form-control" value={gwMerchantId} onChange={(e) => setGwMerchantId(e.target.value)} />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Source (optional)</label>
                          <input className="form-control" value={gwSource} onChange={(e) => setGwSource(e.target.value)} placeholder="qris" />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Window Days</label>
                          <input className="form-control" value={gwWindowDays} onChange={(e) => setGwWindowDays(toNumber(e.target.value, gwWindowDays))} />
                        </div>
                      </div>
                      <div className="d-flex gap-2 mt-3">
                        <button className="btn btn-primary" onClick={refreshGateway} disabled={loading !== null}>
                          Refresh
                        </button>
                        <span className="text-secondary small align-self-center">
                          demo ingest: <span className="font-monospace">docker compose --profile demo run --rm gateway-demo</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-md-5">
                  <div className="card">
                    <div className="card-header fw-semibold">Features</div>
                    <div className="card-body">
                      <div className="d-flex justify-content-between">
                        <div className="text-secondary">Revenue Stability</div>
                        <div className="fw-semibold">{gwFeatures ? (gwFeatures.features.revenue_stability * 100).toFixed(0) + "%" : "-"}</div>
                      </div>
                      <div className="d-flex justify-content-between">
                        <div className="text-secondary">Avg Tx Size</div>
                        <div className="fw-semibold">{gwFeatures ? formatIdrMinor(gwFeatures.features.avg_tx_size_minor) : "-"}</div>
                      </div>
                      <div className="d-flex justify-content-between">
                        <div className="text-secondary">Cashflow Consistency</div>
                        <div className="fw-semibold">{gwFeatures ? (gwFeatures.features.cashflow_consistency * 100).toFixed(0) + "%" : "-"}</div>
                      </div>
                      <div className="d-flex justify-content-between">
                        <div className="text-secondary">Seasonality</div>
                        <div className="fw-semibold">{gwFeatures ? gwFeatures.features.seasonality_index.toFixed(2) : "-"}</div>
                      </div>
                      <div className="d-flex justify-content-between">
                        <div className="text-secondary">Tx In / Out</div>
                        <div className="fw-semibold">{gwFeatures ? `${gwFeatures.features.tx_count_in} / ${gwFeatures.features.tx_count_out}` : "-"}</div>
                      </div>
                      <details className="mt-3">
                        <summary className="small">Raw features</summary>
                        <pre className="small bg-body-tertiary border rounded p-2 mt-2 mb-0">{JSON.stringify(gwFeatures, null, 2)}</pre>
                      </details>
                    </div>
                  </div>
                </div>

                <div className="col-md-7">
                  <div className="card">
                    <div className="card-header fw-semibold">Latest Events</div>
                    <div className="table-responsive">
                      <table className="table table-sm mb-0">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Source</th>
                            <th>Dir</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Tx ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {events.length ? (
                            events.slice(0, 25).map((e) => (
                              <tr key={e.event_id}>
                                <td className="font-monospace">{formatDateTime(e.occurred_at)}</td>
                                <td>{e.source}</td>
                                <td>
                                  <span className={`badge text-bg-${e.direction === "in" ? "success" : "danger"}`}>{e.direction}</span>
                                </td>
                                <td className="font-monospace">{formatIdrMinor((e.direction === "out" ? -1 : 1) * e.money.amount_minor)}</td>
                                <td>{e.status}</td>
                                <td className="font-monospace">{e.source_transaction_id}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="text-secondary">
                                Belum ada event.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="card-body">
                      <details>
                        <summary className="small">Raw events</summary>
                        <pre className="small bg-body-tertiary border rounded p-2 mt-2 mb-0">{JSON.stringify(gwEvents, null, 2)}</pre>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "passport" ? (
              <div className="row g-3">
                <div className="col-md-6">
                  <div className="card">
                    <div className="card-header fw-semibold">Passport</div>
                    <div className="card-body">
                      {passportNotice ? (
                        <div className={`alert alert-${passportNotice.tone} py-2`}>{passportNotice.text}</div>
                      ) : null}
                      <div className="d-flex flex-wrap gap-2">
                        <button className="btn btn-outline-secondary" onClick={refreshPassport} disabled={!accountId || loading !== null}>
                          Refresh
                        </button>
                        <span className={`badge text-bg-${publicEnabled ? "success" : "secondary"}`}>Public: {publicEnabled ? "ON" : "OFF"}</span>
                      </div>

                      <div className="mt-3">
                        <label className="form-label">Business ID</label>
                        <div className="input-group">
                          <input className="form-control" value={businessId} onChange={(e) => setBusinessId(e.target.value)} />
                          <button className="btn btn-primary" onClick={createPassport} disabled={loading !== null}>
                            {loading === "create" ? "Creating..." : "Create"}
                          </button>
                        </div>
                        {createResult ? (
                          <div className="mt-2 d-flex align-items-center gap-2">
                            <span className={`badge text-bg-${createResult.success ? "success" : "secondary"}`}>
                              {createResult.success ? (createResult.onchainUpdated ? "Created on-chain" : "Created off-chain") : "Not created"}
                            </span>
                            {createResult.explorerUrl ? (
                              <a className="btn btn-link px-0" href={createResult.explorerUrl} target="_blank" rel="noreferrer">
                                Explorer
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3 d-flex gap-2 flex-wrap">
                        <button className="btn btn-outline-success" onClick={() => togglePublic(true)} disabled={loading !== null || publicEnabled}>
                          Set Public
                        </button>
                        <button className="btn btn-outline-secondary" onClick={() => togglePublic(false)} disabled={loading !== null || !publicEnabled}>
                          Set Private
                        </button>
                      </div>

                      <div className="mt-3">
                        <details>
                          <summary className="small">Summary</summary>
                          <pre className="small bg-body-tertiary border rounded p-2 mt-2 mb-0">{JSON.stringify(summaryResult?.summary ?? null, null, 2)}</pre>
                        </details>
                        <details className="mt-2">
                          <summary className="small">Public detail</summary>
                          <pre className="small bg-body-tertiary border rounded p-2 mt-2 mb-0">{JSON.stringify(publicResult?.public ?? null, null, 2)}</pre>
                        </details>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
