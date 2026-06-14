import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Papa from 'papaparse';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import { Upload, FileText, AlertTriangle, CheckCircle, XCircle, Info, ArrowRight, ArrowLeft, Check, X, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Step indicators ──────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Upload CSV' },
  { id: 2, label: 'Review Anomalies' },
  { id: 3, label: 'Confirm Import' },
  { id: 4, label: 'Import Report' },
];

const SEVERITY_META = {
  ERROR:   { color: 'var(--danger)',  bg: 'var(--danger-dim)',  icon: XCircle,        label: 'Error'   },
  WARNING: { color: 'var(--warning)', bg: 'var(--warning-dim)', icon: AlertTriangle,  label: 'Warning' },
  INFO:    { color: 'var(--info)',     bg: 'var(--info-dim)',    icon: Info,           label: 'Info'    },
};

const STATUS_META = {
  OK:          { color: 'var(--success)', label: 'OK' },
  WARNING:     { color: 'var(--warning)', label: 'Review' },
  ERROR:       { color: 'var(--danger)',  label: 'Error' },
  INFO:        { color: 'var(--info)',    label: 'Info' },
  SKIP:        { color: 'var(--text-muted)', label: 'Skip' },
  RECLASSIFY:  { color: 'var(--primary)', label: 'Reclassify' },
};

export default function ImportFlow() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [step, setStep] = useState(1);
  const [dragOver, setDragOver] = useState(false);
  const [filename, setFilename] = useState('');
  const [rawRows, setRawRows] = useState([]);
  const [report, setReport] = useState(null);
  const [decisions, setDecisions] = useState({}); // rowNumber -> 'ACCEPT' | 'REJECT' | 'OVERRIDE'
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  // ── File Handling ─────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('Please upload a .csv file');
      return;
    }
    setFilename(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: '\t', // TSV (the provided data uses tabs)
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          // Try comma delimiter fallback
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (r2) => {
              setRawRows(r2.data);
              previewImport(r2.data, file.name);
            },
          });
          return;
        }
        setRawRows(results.data);
        previewImport(results.data, file.name);
      },
    });
  }, []);

  const previewImport = async (rows, fname) => {
    setLoading(true);
    try {
      const res = await api.post(`/groups/${groupId}/import/preview`, {
        rows,
        filename: fname,
      });
      setReport(res.data.report);
      // Initialize decisions: auto-accept OK, SKIP, RECLASSIFY rows
      const initial = {};
      for (const row of res.data.report.processedRows) {
        if (row.status === 'OK' || row.status === 'SKIP' || row.status === 'RECLASSIFY' || row.status === 'INFO') {
          initial[row.rowNumber] = 'ACCEPT';
        }
        // ERROR and WARNING rows need explicit user decision
      }
      setDecisions(initial);
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to analyze CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ── Decisions ─────────────────────────────────────────────────────
  const setDecision = (rowNumber, decision) => {
    setDecisions((prev) => ({ ...prev, [rowNumber]: decision }));
  };

  const acceptAll = () => {
    const next = {};
    for (const row of report.processedRows) {
      next[row.rowNumber] = 'ACCEPT';
    }
    setDecisions(next);
  };

  const rejectAll = (severity) => {
    const next = { ...decisions };
    for (const row of report.processedRows) {
      if (severity === 'ALL' || row.anomalies.some((a) => a.severity === severity)) {
        next[row.rowNumber] = 'REJECT';
      }
    }
    setDecisions(next);
  };

  // Check if all flagged rows have decisions
  const pendingDecisions = report?.processedRows?.filter(
    (row) => (row.status === 'ERROR' || row.status === 'WARNING') && !decisions[row.rowNumber]
  ) || [];

  // ── Confirm Import ────────────────────────────────────────────────
  const confirmImport = async () => {
    if (pendingDecisions.length > 0) {
      toast.error(`Please review all flagged rows (${pendingDecisions.length} remaining)`);
      return;
    }

    setLoading(true);
    try {
      // Attach user decisions to processed rows
      const rowsWithDecisions = report.processedRows.map((row) => ({
        ...row,
        userDecision: decisions[row.rowNumber] || (row.status === 'OK' ? 'ACCEPT' : 'REJECT'),
      }));

      const res = await api.post(`/groups/${groupId}/import/confirm`, {
        rows: rowsWithDecisions,
        filename,
      });

      setImportResult(res.data);
      setStep(4);
      toast.success('Import complete!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Filter rows ───────────────────────────────────────────────────
  const filteredRows = report?.processedRows?.filter((row) => {
    if (filterSeverity === 'ALL') return true;
    if (filterSeverity === 'OK') return row.status === 'OK';
    return row.anomalies.some((a) => a.severity === filterSeverity);
  }) || [];

  const anomalyStats = {
    errors:   report?.processedRows?.filter((r) => r.status === 'ERROR').length || 0,
    warnings: report?.processedRows?.filter((r) => r.status === 'WARNING').length || 0,
    ok:       report?.processedRows?.filter((r) => r.status === 'OK').length || 0,
    skipped:  report?.processedRows?.filter((r) => r.status === 'SKIP').length || 0,
    reclassified: report?.processedRows?.filter((r) => r.status === 'RECLASSIFY').length || 0,
  };

  return (
    <div className="app-layout">
      <Sidebar groups={[]} />
      <main className="main-content">
        <div className="content-container animate-fade-in">

          {/* Header */}
          <Link to={`/groups/${groupId}`} className="btn btn-ghost btn-sm" style={{ marginBottom: '1.25rem', width: 'fit-content' }}>
            <ArrowLeft size={16} /> Back to Group
          </Link>
          <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>📥 Import CSV</h1>
          <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
            Ingest your expenses_export.csv — all anomalies will be detected and surfaced for your review.
          </p>

          {/* Step Indicator */}
          <div className="import-stepper" style={{ marginBottom: '2.5rem' }}>
            {STEPS.map((s, i) => (
              <div key={s.id} className="step-item" style={{ flex: i < STEPS.length - 1 ? 1 : 'unset' }}>
                <div className={`step-circle ${step > s.id ? 'done' : step === s.id ? 'active' : 'inactive'}`}>
                  {step > s.id ? <Check size={14} /> : s.id}
                </div>
                <span className={`step-label ${step === s.id ? 'active' : ''}`}>{s.label}</span>
                {i < STEPS.length - 1 && (
                  <div className={`step-connector ${step > s.id ? 'done' : ''}`} style={{ flex: 1 }} />
                )}
              </div>
            ))}
          </div>

          {/* ── STEP 1: Upload ─────────────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <div
                className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                id="csv-drop-zone"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/tab-separated-values,.tsv"
                  style={{ display: 'none' }}
                  onChange={handleFileInput}
                  id="csv-file-input"
                />
                <div style={{
                  width: 64, height: 64, borderRadius: 'var(--radius-xl)',
                  background: 'var(--primary-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1rem',
                }}>
                  <Upload size={28} style={{ color: 'var(--primary)' }} />
                </div>
                <h3 style={{ marginBottom: '0.5rem' }}>Drop your CSV file here</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  or click to browse — supports .csv and .tsv files
                </p>
                <div className="btn btn-primary" style={{ marginTop: '1.5rem', pointerEvents: 'none' }}>
                  <FileText size={16} /> Choose File
                </div>
              </div>

              <div className="alert alert-info" style={{ marginTop: '1.5rem' }}>
                <Info size={18} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Import notes:</strong>
                  <ul style={{ marginTop: '0.375rem', paddingLeft: '1rem', fontSize: '0.875rem', lineHeight: 1.7 }}>
                    <li>18 anomaly types are detected automatically (duplicates, currency issues, missing fields, etc.)</li>
                    <li>You must approve or reject every flagged row before data is imported</li>
                    <li>Settlements disguised as expenses are automatically reclassified</li>
                    <li>USD expenses are converted at 1 USD = ₹83.5 (March 2026 rate)</li>
                  </ul>
                </div>
              </div>

              {loading && (
                <div className="loading-overlay" style={{ marginTop: '2rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div className="spinner spinner-lg" style={{ margin: '0 auto 1rem' }} />
                    <p style={{ color: 'var(--text-muted)' }}>Analyzing your CSV for anomalies…</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Review Anomalies ────────────────────────────────────── */}
          {step === 2 && report && (
            <div>
              {/* Summary stats */}
              <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-card">
                  <div className="stat-label">Total Rows</div>
                  <div className="stat-value">{report.totalRows}</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid var(--success)' }}>
                  <div className="stat-label">Clean Rows</div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>{anomalyStats.ok}</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid var(--danger)' }}>
                  <div className="stat-label">Errors</div>
                  <div className="stat-value" style={{ color: 'var(--danger)' }}>{anomalyStats.errors}</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid var(--warning)' }}>
                  <div className="stat-label">Warnings</div>
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>{anomalyStats.warnings}</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid var(--primary)' }}>
                  <div className="stat-label">Reclassified</div>
                  <div className="stat-value" style={{ color: 'var(--primary)' }}>{anomalyStats.reclassified}</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid var(--text-muted)' }}>
                  <div className="stat-label">Auto-Skip</div>
                  <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{anomalyStats.skipped}</div>
                </div>
              </div>

              {/* Pending decisions banner */}
              {pendingDecisions.length > 0 && (
                <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>{pendingDecisions.length} row{pendingDecisions.length !== 1 ? 's' : ''}</strong> need your decision before you can proceed.
                    Rows with errors cannot be auto-imported.
                  </span>
                </div>
              )}

              {/* Bulk actions */}
              <div className="flex items-center gap-2" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button className="btn btn-success btn-sm" onClick={acceptAll} id="accept-all-btn">
                  <Check size={14} /> Accept All
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => rejectAll('ERROR')} id="reject-errors-btn">
                  <X size={14} /> Reject Errors
                </button>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  {['ALL', 'ERROR', 'WARNING', 'INFO', 'OK'].map((f) => (
                    <button
                      key={f}
                      className={`btn btn-sm ${filterSeverity === f ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setFilterSeverity(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filteredRows.map((row) => (
                  <AnomalyRow
                    key={row.rowNumber}
                    row={row}
                    decision={decisions[row.rowNumber]}
                    onDecision={(d) => setDecision(row.rowNumber, d)}
                    expanded={expandedRow === row.rowNumber}
                    onToggle={() => setExpandedRow(expandedRow === row.rowNumber ? null : row.rowNumber)}
                  />
                ))}
              </div>

              <div className="flex justify-end gap-3" style={{ marginTop: '2rem' }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  id="proceed-to-confirm-btn"
                  className="btn btn-primary btn-lg"
                  onClick={() => setStep(3)}
                  disabled={pendingDecisions.length > 0}
                >
                  Proceed to Confirm <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Confirm ─────────────────────────────────────────────── */}
          {step === 3 && report && (
            <div>
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Import Summary</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <SummaryLine
                    label="Rows to import as expenses"
                    count={report.processedRows.filter((r) => (decisions[r.rowNumber] === 'ACCEPT') && r.status !== 'SKIP' && r.computed?.reclassify !== 'SETTLEMENT').length}
                    color="var(--success)"
                  />
                  <SummaryLine
                    label="Rows to import as settlements"
                    count={report.processedRows.filter((r) => decisions[r.rowNumber] === 'ACCEPT' && r.computed?.reclassify === 'SETTLEMENT').length}
                    color="var(--primary)"
                  />
                  <SummaryLine
                    label="Rows to skip"
                    count={report.processedRows.filter((r) => decisions[r.rowNumber] === 'REJECT' || r.status === 'SKIP').length}
                    color="var(--text-muted)"
                  />
                  <SummaryLine
                    label="Total anomalies recorded"
                    count={report.anomalies?.length || 0}
                    color="var(--warning)"
                  />
                </div>
              </div>

              <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <div>
                  <strong>This action cannot be undone automatically.</strong>
                  <br />
                  <span style={{ fontSize: '0.875rem' }}>
                    Review the summary above. After confirming, each imported expense and settlement will
                    affect group balances. You can delete individual expenses afterwards if needed.
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button className="btn btn-ghost" onClick={() => setStep(2)}>
                  <ArrowLeft size={16} /> Review Again
                </button>
                <button
                  id="confirm-import-btn"
                  className="btn btn-primary btn-lg"
                  onClick={confirmImport}
                  disabled={loading}
                >
                  {loading ? (
                    <><div className="spinner" /> Importing…</>
                  ) : (
                    <><Check size={18} /> Confirm Import</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Result ──────────────────────────────────────────────── */}
          {step === 4 && importResult && (
            <div className="animate-fade-in">
              <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', marginBottom: '1.5rem' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: 'var(--success-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.5rem',
                }}>
                  <CheckCircle size={36} style={{ color: 'var(--success)' }} />
                </div>
                <h2 style={{ marginBottom: '0.5rem' }}>Import Complete!</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>{importResult.message}</p>

                <div className="stats-grid" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                  <div className="stat-card">
                    <div className="stat-label">Expenses Imported</div>
                    <div className="stat-value" style={{ color: 'var(--success)' }}>{importResult.importedExpenses}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Settlements Imported</div>
                    <div className="stat-value" style={{ color: 'var(--primary)' }}>{importResult.importedSettlements}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Rows Skipped</div>
                    <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{importResult.skippedRows}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Anomalies Logged</div>
                    <div className="stat-value" style={{ color: 'var(--warning)' }}>{importResult.anomalyCount}</div>
                  </div>
                </div>

                <div className="flex gap-3 justify-center">
                  <Link to={`/groups/${groupId}/import/${importResult.batchId}/report`} className="btn btn-ghost">
                    <FileText size={16} /> View Full Report
                  </Link>
                  <Link to={`/groups/${groupId}`} className="btn btn-primary">
                    <ArrowRight size={16} /> Back to Group
                  </Link>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

// ── Anomaly Row Component ─────────────────────────────────────────────────
function AnomalyRow({ row, decision, onDecision, expanded, onToggle }) {
  const worstSeverity = row.anomalies.reduce((worst, a) => {
    const order = { ERROR: 3, WARNING: 2, INFO: 1 };
    return (order[a.severity] || 0) > (order[worst] || 0) ? a.severity : worst;
  }, null);

  const meta = SEVERITY_META[worstSeverity] || null;
  const statusMeta = STATUS_META[row.status] || STATUS_META['OK'];

  return (
    <div
      className={`anomaly-row ${worstSeverity ? `severity-${worstSeverity.toLowerCase()}` : ''}`}
      id={`anomaly-row-${row.rowNumber}`}
    >
      <div className="flex items-center gap-3">
        {/* Row number */}
        <span style={{
          fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
          minWidth: 28, textAlign: 'right', flexShrink: 0,
        }}>
          #{row.rowNumber}
        </span>

        {/* Description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }} className="truncate">
              {row.raw?.description || '(no description)'}
            </span>
            <span className="badge" style={{
              backgroundColor: statusMeta.color + '22',
              color: statusMeta.color,
              flexShrink: 0,
            }}>
              {statusMeta.label}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
            {row.raw?.date} · {row.raw?.paid_by || '—'} · {row.raw?.amount} {row.raw?.currency}
          </div>
        </div>

        {/* Anomaly count */}
        {row.anomalies.length > 0 && (
          <span style={{ color: meta?.color || 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>
            {row.anomalies.length} issue{row.anomalies.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Decision selector */}
        {(row.status === 'ERROR' || row.status === 'WARNING') && (
          <div className="flex gap-1" style={{ flexShrink: 0 }}>
            <button
              className={`btn btn-sm ${decision === 'ACCEPT' ? 'btn-success' : 'btn-ghost'}`}
              onClick={() => onDecision('ACCEPT')}
              id={`decision-accept-${row.rowNumber}`}
              title="Accept with auto-fix"
            >
              <Check size={13} />
            </button>
            <button
              className={`btn btn-sm ${decision === 'REJECT' ? 'btn-danger' : 'btn-ghost'}`}
              onClick={() => onDecision('REJECT')}
              id={`decision-reject-${row.rowNumber}`}
              title="Skip this row"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Expand toggle */}
        <button
          className="btn btn-icon btn-ghost btn-sm"
          onClick={onToggle}
          style={{ color: 'var(--text-muted)', flexShrink: 0 }}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {/* Expanded: show each anomaly */}
      {expanded && row.anomalies.length > 0 && (
        <div style={{
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>
          {row.anomalies.map((a, i) => {
            const am = SEVERITY_META[a.severity];
            const Icon = am?.icon || Info;
            return (
              <div key={i} style={{
                display: 'flex', gap: '0.625rem', alignItems: 'flex-start',
                padding: '0.625rem 0.75rem',
                background: am?.bg || 'transparent',
                borderRadius: 'var(--radius-sm)',
              }}>
                <Icon size={15} style={{ color: am?.color, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: am?.color }}>
                    {a.type.replace(/_/g, ' ')} · {am?.label}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.125rem 0' }}>
                    {a.description}
                  </div>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                    ✅ Action: {a.suggestedAction}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Show auto-computed value for OK rows */}
      {expanded && row.anomalies.length === 0 && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <span className="badge badge-success">✓ No issues detected — will be imported as-is</span>
        </div>
      )}
    </div>
  );
}

function SummaryLine({ label, count, color }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 700, color, fontSize: '1.125rem' }}>{count}</span>
    </div>
  );
}
