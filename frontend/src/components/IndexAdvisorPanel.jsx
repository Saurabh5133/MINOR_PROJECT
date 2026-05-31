import React, { useState } from 'react'

const PRIORITY_CONFIG = {
  HIGH:   { color: '#ff4757', bg: 'rgba(255,71,87,0.12)',   icon: '🔴', label: 'HIGH PRIORITY'   },
  MEDIUM: { color: '#ffa040', bg: 'rgba(255,160,64,0.12)',  icon: '🟡', label: 'MEDIUM PRIORITY' },
  LOW:    { color: '#00e676', bg: 'rgba(0,230,118,0.12)',   icon: '🟢', label: 'LOW PRIORITY'    },
}

export default function IndexAdvisorPanel({ indexAnalysis }) {
  const [copied, setCopied]     = useState(null)
  const [expanded, setExpanded] = useState({})

  if (!indexAnalysis) return null

  const recs    = indexAnalysis.recommendations || []
  const high    = recs.filter(r => r.priority === 'HIGH')
  const medium  = recs.filter(r => r.priority === 'MEDIUM')
  const low     = recs.filter(r => r.priority === 'LOW')

  const copySQL = (sql, idx) => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(idx)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const copyAll = () => {
    const all = recs.map(r => r.create_sql).join('\n')
    navigator.clipboard.writeText(all).then(() => {
      setCopied('all')
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const toggleExpand = (idx) =>
    setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }))

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary banner */}
      <div className="index-summary-banner">
        <div className="index-summary-left">
          <div className="index-summary-icon">⚡</div>
          <div>
            <div className="index-summary-title">
              {recs.length === 0
                ? 'All columns are already indexed'
                : `${recs.length} Missing Index${recs.length > 1 ? 'es' : ''} Found`}
            </div>
            <div className="index-summary-sub">{indexAnalysis.summary}</div>
          </div>
        </div>
        {recs.length > 0 && (
          <div className="index-summary-right">
            <div className="index-cost-compare">
              <div className="index-cost-item">
                <div className="index-cost-label">Current Cost</div>
                <div className="index-cost-val red">
                  {indexAnalysis.query_cost_current?.toLocaleString()}
                </div>
                <div className="index-cost-unit">page I/O units</div>
              </div>
              <div style={{ fontSize: 20, color: 'var(--text-muted)', alignSelf: 'center' }}>→</div>
              <div className="index-cost-item">
                <div className="index-cost-label">With All Indexes</div>
                <div className="index-cost-val green">
                  {indexAnalysis.query_cost_ideal?.toLocaleString()}
                </div>
                <div className="index-cost-unit">page I/O units</div>
              </div>
              <div className="index-savings-badge">
                ↓{indexAnalysis.overall_savings_pct}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Priority breakdown */}
      {recs.length > 0 && (
        <div className="index-priority-row">
          {[['HIGH', high], ['MEDIUM', medium], ['LOW', low]].map(([label, items]) => (
            items.length > 0 && (
              <div key={label} className="index-priority-chip"
                style={{ background: PRIORITY_CONFIG[label].bg, border: `1px solid ${PRIORITY_CONFIG[label].color}40` }}>
                <span>{PRIORITY_CONFIG[label].icon}</span>
                <span style={{ color: PRIORITY_CONFIG[label].color, fontWeight: 700 }}>
                  {items.length}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{label}</span>
              </div>
            )
          ))}
          <button className="copy-all-btn" onClick={copyAll}>
            {copied === 'all' ? '✓ Copied!' : '⎘ Copy All SQL'}
          </button>
        </div>
      )}

      {/* Recommendation cards */}
      {recs.length === 0 ? (
        <div className="index-empty">
          <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            No missing indexes
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            All columns used in WHERE, JOIN ON, ORDER BY, and GROUP BY are already indexed.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {recs.map((rec, idx) => {
            const cfg  = PRIORITY_CONFIG[rec.priority]
            const isEx = expanded[idx]
            return (
              <div key={idx} className="index-card" style={{ borderLeft: `3px solid ${cfg.color}` }}>

                {/* Card header */}
                <div className="index-card-header">
                  <div className="index-card-left">
                    <span className="index-priority-badge"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <span className="index-name">
                      idx_{rec.table}_{rec.column}
                    </span>
                  </div>
                  <div className="index-card-right">
                    <span className="index-clause-tag">{rec.clause}</span>
                    <span className="index-savings-pct" style={{ color: cfg.color }}>
                      ↓{rec.savings_pct}%
                    </span>
                  </div>
                </div>

                {/* Cost bar */}
                <div className="index-cost-bar-row">
                  <div className="index-cost-bar-label">Without index</div>
                  <div className="index-cost-bar-track">
                    <div className="index-cost-bar-fill without"
                      style={{ width: '100%' }} />
                    <span className="index-cost-bar-val">{rec.cost_without?.toLocaleString()} pages</span>
                  </div>
                </div>
                <div className="index-cost-bar-row">
                  <div className="index-cost-bar-label">With index</div>
                  <div className="index-cost-bar-track">
                    <div className="index-cost-bar-fill with"
                      style={{ width: `${Math.max(2, 100 - rec.savings_pct)}%` }} />
                    <span className="index-cost-bar-val">{rec.cost_with?.toLocaleString()} pages</span>
                  </div>
                </div>

                {/* SQL block */}
                <div className="index-sql-block">
                  <code className="index-sql-code">{rec.create_sql}</code>
                  <button
                    className="index-copy-btn"
                    onClick={() => copySQL(rec.create_sql, idx)}
                  >
                    {copied === idx ? '✓' : '⎘'}
                  </button>
                </div>

                {/* Expandable details */}
                <button className="index-expand-btn" onClick={() => toggleExpand(idx)}>
                  {isEx ? '▲ Hide details' : '▼ Why this index?'}
                </button>
                {isEx && (
                  <div className="index-detail animate-fade">
                    <div className="index-detail-row">
                      <span className="index-detail-label">Table</span>
                      <span className="index-detail-val">{rec.table}</span>
                    </div>
                    <div className="index-detail-row">
                      <span className="index-detail-label">Column</span>
                      <span className="index-detail-val mono">{rec.column}</span>
                    </div>
                    <div className="index-detail-row">
                      <span className="index-detail-label">Row count</span>
                      <span className="index-detail-val">{rec.row_count?.toLocaleString()}</span>
                    </div>
                    <div className="index-detail-row">
                      <span className="index-detail-label">Index type</span>
                      <span className="index-detail-val">{rec.index_type}</span>
                    </div>
                    <div className="index-detail-row">
                      <span className="index-detail-label">Used in</span>
                      <span className="index-detail-val">{rec.clause}</span>
                    </div>
                    <div className="index-reason">{rec.reason}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Columns analyzed */}
      <div className="index-analyzed-row">
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Analyzed {indexAnalysis.columns_analyzed} column reference(s) across WHERE, JOIN ON, ORDER BY, GROUP BY
        </span>
      </div>
    </div>
  )
}
