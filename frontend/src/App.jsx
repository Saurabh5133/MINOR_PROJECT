import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import './App.css'
import QueryInput from './components/QueryInput'
import SchemaInput from './components/SchemaInput'
import ResultPanel from './components/ResultPanel'
import CloudCostPanel from './components/CloudCostPanel'
import Header from './components/Header'
import IndexAdvisorPanel from './components/IndexAdvisorPanel'

const API = axios.create({ baseURL: '/api' })

const EXAMPLE_QUERIES = [
  {
    label: 'JOIN + Filter',
    query: `SELECT *\nFROM orders o\nJOIN customers c ON o.customer_id = c.id\nWHERE o.amount > 500\nORDER BY o.created_at`,
    schema: {
      orders: { columns: ['id','customer_id','amount','status','created_at','updated_at','notes'], row_count: 50000 },
      customers: { columns: ['id','name','email','city','country','created_at'], row_count: 10000 }
    }
  },
  {
    label: 'Aggregate Query',
    query: `SELECT c.country, COUNT(o.id) as order_count, SUM(o.amount) as total_revenue\nFROM orders o\nJOIN customers c ON o.customer_id = c.id\nWHERE o.status = 'completed'\nGROUP BY c.country\nORDER BY total_revenue DESC`,
    schema: {
      orders: { columns: ['id','customer_id','amount','status','created_at'], row_count: 100000 },
      customers: { columns: ['id','name','email','city','country'], row_count: 20000 }
    }
  },
  {
    label: 'Subquery (IN)',
    query: `SELECT *\nFROM products\nWHERE category_id IN (\n  SELECT id FROM categories WHERE status = 'active'\n)\nORDER BY price DESC`,
    schema: {
      products: { columns: ['id','name','price','category_id','stock','created_at'], row_count: 25000 },
      categories: { columns: ['id','name','status','description'], row_count: 500 }
    }
  },
  {
    label: 'Simple Filter',
    query: `SELECT * FROM employees\nWHERE salary > 75000 AND department = 'Engineering'\nORDER BY name`,
    schema: {
      employees: { columns: ['id','name','email','salary','department','hire_date','manager_id'], row_count: 5000 }
    }
  }
]

export default function App() {
  const [query, setQuery] = useState(EXAMPLE_QUERIES[0].query)
  const [schema, setSchema] = useState(JSON.stringify(EXAMPLE_QUERIES[0].schema, null, 2))
  const [useLLM, setUseLLM] = useState(true)
  const [calcCloud, setCalcCloud] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('query')
  const [indexData, setIndexData] = useState(null)
  const [llmStatus, setLlmStatus] = useState(null)
  const [serviceStatus, setServiceStatus] = useState('checking')

  useEffect(() => { checkHealth() }, [])

  const checkHealth = async () => {
    try {
      const res = await API.get('/health')
      setServiceStatus(res.data.status === 'ok' ? 'online' : 'degraded')
      setLlmStatus(res.data.ml_service?.llm)
    } catch {
      setServiceStatus('offline')
    }
  }

  const loadExample = (ex) => {
    setQuery(ex.query)
    setSchema(JSON.stringify(ex.schema, null, 2))
    setResult(null)
    setError(null)
    setActiveTab('query')
  }

  const handleOptimize = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    let parsedSchema = {}
    try {
      parsedSchema = JSON.parse(schema || '{}')
    } catch {
      setError('Invalid JSON in schema field. Please check the format.')
      setLoading(false)
      return
    }

    try {
      const res = await API.post('/optimize', {
        query,
        schema: parsedSchema,
        use_llm: useLLM,
        calculate_cloud_cost: calcCloud,
      })
      setResult(res.data)
      setActiveTab('results')
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }, [query, schema, useLLM, calcCloud])

  return (
    <div className="app">
      <Header serviceStatus={serviceStatus} llmStatus={llmStatus} />

      <div className="app-body">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">Examples</div>
            {EXAMPLE_QUERIES.map((ex, i) => (
              <button key={i} className="example-btn" onClick={() => loadExample(ex)}>
                <span className="example-icon">▸</span>{ex.label}
              </button>
            ))}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-label">Options</div>
            <label className="toggle-row">
              <span>LLM Rewrite</span>
              <div
                className={`toggle ${useLLM ? 'on' : ''} ${!llmStatus?.enabled ? 'disabled' : ''}`}
                onClick={() => llmStatus?.enabled && setUseLLM(v => !v)}
                title={!llmStatus?.enabled ? 'Add OPENAI_API_KEY to ml-model/.env' : `Using ${llmStatus?.provider} (${llmStatus?.model})`}
              >
                <div className="toggle-thumb" />
              </div>
            </label>
            {!llmStatus?.enabled && (
              <div className="llm-hint">
                Groq API configured. Toggle to enable/disable LLM rewriting.<br/>
                Free: <a href="https://console.groq.com" target="_blank" rel="noreferrer">Groq</a> · <a href="https://mistral.ai" target="_blank" rel="noreferrer">Mistral</a>
              </div>
            )}
            <label className="toggle-row">
              <span>Cloud Costs</span>
              <div className={`toggle ${calcCloud ? 'on' : ''}`} onClick={() => setCalcCloud(v => !v)}>
                <div className="toggle-thumb" />
              </div>
            </label>
          </div>

          {result && (
            <div className="sidebar-section">
              <div className="sidebar-label">Quick Stats</div>
              <div className="stat-card">
                <div className="stat-label">Cost Before</div>
                <div className="stat-value red">{result.cost_before}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Cost After</div>
                <div className="stat-value green">{result.cost_after}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Improvement</div>
                <div className="stat-value accent">{result.improvement_percent}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Rule Applied</div>
                <div className="stat-value small">{result.optimization_rule?.replace(/_/g, ' ')}</div>
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="main-content">
          <div className="tabs">
            {['query','results','cloud','indexes','trace'].map(tab => (
              <button
                key={tab}
                className={`tab ${activeTab === tab ? 'active' : ''} ${tab !== 'query' && !result ? 'disabled' : ''}`}
                onClick={() => (tab === 'query' || result) && setActiveTab(tab)}
              >
                {tab === 'query' && '⬡ Query Editor'}
                {tab === 'results' && '⬡ Results'}
                {tab === 'cloud' && '⬡ Cloud Costs'}
                {tab === 'trace'   && '⬡ Trace'}
                {tab === 'indexes' && '⬡ Index Advisor'}
                {tab === 'results' && result?.improved && (
                  <span className="tab-badge green">↓{result.improvement_percent}%</span>
                )}
                {tab === 'indexes' && result?.index_analysis?.total_count > 0 && (
                  <span className="tab-badge" style={{background:'rgba(255,160,64,0.15)',color:'var(--orange)'}}>
                    {result.index_analysis.total_count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {activeTab === 'query' && (
              <div className="animate-fade">
                <div className="editor-grid">
                  <QueryInput value={query} onChange={setQuery} />
                  <SchemaInput value={schema} onChange={setSchema} />
                </div>
                {error && (
                  <div className="error-box animate-fade">
                    <span>⚠</span><span>{error}</span>
                  </div>
                )}
                <div className="action-row">
                  <button
                    className={`btn-optimize ${loading ? 'loading' : ''}`}
                    onClick={handleOptimize}
                    disabled={loading || !query.trim()}
                  >
                    {loading ? <><span className="spinner" />Analyzing...</> : <><span>⚡</span>Optimize Query</>}
                  </button>
                  <span className="action-hint">
                    Applies ML strategy · Rule-based transforms · Real SQLite plans · Cloud cost estimates
                  </span>
                </div>
              </div>
            )}

            {activeTab === 'results' && result && <ResultPanel result={result} />}

            {activeTab === 'cloud' && result?.cloud_costs && (
              <CloudCostPanel cloudCosts={result.cloud_costs} />
            )}

            {activeTab === 'indexes' && result && (
              <IndexAdvisorPanel indexAnalysis={result.index_analysis} />
            )}

            {activeTab === 'trace' && result && (
              <div className="trace-panel animate-fade">
                <div className="section-title">Pipeline Execution Trace</div>
                {result.trace?.map((step, i) => (
                  <div key={i} className="trace-step animate-slide" style={{ animationDelay: `${i * 0.04}s` }}>
                    <div className="trace-idx">{String(i+1).padStart(2,'0')}</div>
                    <div className="trace-body">
                      <div className="trace-name">{step.step}</div>
                      {step.data && <pre className="trace-data">{JSON.stringify(step.data, null, 2)}</pre>}
                    </div>
                  </div>
                ))}
                <div className="trace-elapsed">Total: <strong>{result.elapsed_seconds}s</strong></div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
