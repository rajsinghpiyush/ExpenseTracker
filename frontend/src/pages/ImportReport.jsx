import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import { format } from 'date-fns';
import { ArrowLeft, FileText, CheckCircle, XCircle, AlertTriangle, Info, Download } from 'lucide-react';

const SEVERITY_COLORS = {
  ERROR:   { color: 'var(--danger)',  bg: 'var(--danger-dim)',  icon: XCircle       },
  WARNING: { color: 'var(--warning)', bg: 'var(--warning-dim)', icon: AlertTriangle },
  INFO:    { color: 'var(--info)',     bg: 'var(--info-dim)',    icon: Info          },
};

export default function ImportReport() {
  const { groupId, batchId } = useParams();
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/groups/${groupId}/import/batches/${batchId}`)
      .then((res) => setBatch(res.data.batch))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [batchId, groupId]);

  const downloadReport = () => {
    if (!batch) return;
    const report = {
      importedAt: batch.importedAt,
      filename: batch.filename,
      importedBy: batch.importedBy?.name,
      summary: {
        totalRows: batch.totalRows,
        importedExpenses: batch.importedExpenses,
        importedSettlements: batch.importedSettlements,
        skippedRows: batch.skippedRows,
        anomalyCount: batch.anomalyCount,
      },
      anomalies: batch.anomalies.map((a) => ({
        row: a.rowNumber,
        type: a.anomalyType,
        severity: a.severity,
        description: a.description,
        action: a.suggestedAction,
        userDecision: a.userDecision,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_report_${batchId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="app-layout">
        <Sidebar groups={[]} />
        <main className="main-content">
          <div className="loading-overlay"><div className="spinner spinner-lg" /></div>
        </main>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="app-layout">
        <Sidebar groups={[]} />
        <main className="main-content">
          <div className="content-container">
            <p style={{ color: 'var(--text-muted)' }}>Import batch not found.</p>
          </div>
        </main>
      </div>
    );
  }

  // Group anomalies by type for summary
  const anomalyByType = batch.anomalies.reduce((acc, a) => {
    acc[a.anomalyType] = (acc[a.anomalyType] || 0) + 1;
    return acc;
  }, {});

  const errorCount = batch.anomalies.filter((a) => a.severity === 'ERROR').length;
  const warningCount = batch.anomalies.filter((a) => a.severity === 'WARNING').length;
  const infoCount = batch.anomalies.filter((a) => a.severity === 'INFO').length;

  return (
    <div className="app-layout">
      <Sidebar groups={[]} />
      <main className="main-content">
        <div className="content-container animate-fade-in">

          <Link to={`/groups/${groupId}`} className="btn btn-ghost btn-sm" style={{ marginBottom: '1.25rem', width: 'fit-content' }}>
            <ArrowLeft size={16} /> Back to Group
          </Link>

          {/* Header */}
          <div className="page-header">
            <div>
              <h1 className="page-title">📊 Import Report</h1>
              <p className="page-subtitle">
                {batch.filename} · Imported {format(new Date(batch.importedAt), 'dd MMM yyyy, HH:mm')}
                {batch.importedBy && ` by ${batch.importedBy.name}`}
              </p>
            </div>
            <button className="btn btn-ghost" onClick={downloadReport} id="download-report-btn">
              <Download size={16} /> Download JSON
            </button>
          </div>

          {/* Summary stats */}
          <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-label">Total Rows Processed</div>
              <div className="stat-value">{batch.totalRows}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid var(--success)' }}>
              <div className="stat-label">Expenses Imported</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{batch.importedExpenses}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid var(--primary)' }}>
              <div className="stat-label">Settlements Imported</div>
              <div className="stat-value" style={{ color: 'var(--primary)' }}>{batch.importedSettlements}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid var(--text-muted)' }}>
              <div className="stat-label">Rows Skipped</div>
              <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{batch.skippedRows}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid var(--danger)' }}>
              <div className="stat-label">Errors Detected</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{errorCount}</div>
            </div>
            <div className="stat-card" style={{ borderLeft: '3px solid var(--warning)' }}>
              <div className="stat-label">Warnings Detected</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{warningCount}</div>
            </div>
          </div>

          {/* Anomaly type breakdown */}
          {Object.keys(anomalyByType).length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>Anomaly Type Breakdown</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {Object.entries(anomalyByType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div
                      key={type}
                      style={{
                        padding: '0.375rem 0.75rem',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        fontSize: '0.8125rem',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{type.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Full anomaly log */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>
              Full Anomaly Log ({batch.anomalies.length})
            </h3>

            {batch.anomalies.length === 0 ? (
              <div className="flex items-center gap-2" style={{ color: 'var(--success)' }}>
                <CheckCircle size={18} />
                <span>No anomalies detected — clean import!</span>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>Description</th>
                      <th>Action Taken</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.anomalies.map((anomaly) => {
                      const sev = SEVERITY_COLORS[anomaly.severity] || SEVERITY_COLORS.INFO;
                      const Icon = sev.icon;
                      return (
                        <tr key={anomaly.id} id={`anomaly-log-${anomaly.id}`}>
                          <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>#{anomaly.rowNumber}</td>
                          <td>
                            <code style={{ fontSize: '0.75rem', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                              {anomaly.anomalyType}
                            </code>
                          </td>
                          <td>
                            <div className="flex items-center gap-1" style={{ color: sev.color }}>
                              <Icon size={14} />
                              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{anomaly.severity}</span>
                            </div>
                          </td>
                          <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: 300 }}>
                            {anomaly.description}
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', maxWidth: 220 }}>
                            {anomaly.suggestedAction}
                          </td>
                          <td>
                            {anomaly.userDecision ? (
                              <span
                                className="badge"
                                style={{
                                  background: anomaly.userDecision === 'ACCEPT' ? 'var(--success-dim)' : 'var(--danger-dim)',
                                  color: anomaly.userDecision === 'ACCEPT' ? 'var(--success-light)' : 'var(--danger-light)',
                                }}
                              >
                                {anomaly.userDecision}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>auto</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
