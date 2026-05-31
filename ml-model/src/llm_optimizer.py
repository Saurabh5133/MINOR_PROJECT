"""
LLM Query Optimizer
Uses Groq (free) or any OpenAI-compatible API to rewrite SQL queries.
Configured via ml-model/.env file.
"""
import os
import re
import json
import urllib.request
import urllib.error
from pathlib import Path


def _load_env():
    """Load .env file from ml-model directory."""
    env_path = Path(__file__).parent.parent / '.env'
    if not env_path.exists():
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and val and key not in os.environ:
                os.environ[key] = val

_load_env()


class LLMOptimizer:
    def __init__(self):
        self.api_key  = os.getenv('OPENAI_API_KEY', '').strip()
        self.model    = os.getenv('LLM_MODEL', 'llama3-8b-8192').strip()
        self.base_url = os.getenv('LLM_BASE_URL', 'https://api.groq.com/openai/v1').strip()
        self.enabled  = bool(
            self.api_key and
            self.api_key not in ('', 'your-api-key-here', 'sk-...') and
            len(self.api_key) > 10
        )

    def get_status(self) -> dict:
        provider = self._detect_provider()
        return {
            'enabled':  self.enabled,
            'model':    self.model    if self.enabled else None,
            'provider': provider      if self.enabled else None,
            'message':  (f'LLM active — {provider} ({self.model})'
                         if self.enabled else
                         'LLM disabled — add OPENAI_API_KEY to ml-model/.env'),
        }

    def _detect_provider(self) -> str:
        url = self.base_url.lower()
        if 'groq'     in url: return 'Groq'
        if 'together' in url: return 'Together AI'
        if 'mistral'  in url: return 'Mistral AI'
        if 'openai'   in url: return 'OpenAI'
        return 'Custom'

    def optimize(self, query: str, schema: dict,
                 strategy: str = None, context: dict = None) -> dict:
        if not self.enabled:
            return {
                'success':       False,
                'error':         'LLM not configured. Add OPENAI_API_KEY to ml-model/.env',
                'query':         query,
                'explanation':   '',
                'llm_available': False,
            }

        prompt = self._build_prompt(query, schema, strategy)

        try:
            payload = json.dumps({
                'model':    self.model,
                'messages': [
                    {
                        'role':    'system',
                        'content': (
                            'You are an expert SQL query optimizer. '
                            'Rewrite SQL queries to be more efficient while preserving '
                            'exact semantics and returning identical results. '
                            'Respond ONLY with valid JSON — no markdown, no explanation outside JSON.'
                        ),
                    },
                    {'role': 'user', 'content': prompt},
                ],
                'temperature': 0.1,
                'max_tokens':  1024,
            }).encode('utf-8')

            req = urllib.request.Request(
                f'{self.base_url}/chat/completions',
                data=payload,
                headers={
                    'Content-Type':  'application/json',
                    'Authorization': f'Bearer {self.api_key}',
                },
            )

            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode('utf-8'))

            raw = data['choices'][0]['message']['content']
            return self._parse_response(raw, query)

        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='ignore')
            return {
                'success':       False,
                'error':         f'API error {e.code}: {body[:300]}',
                'query':         query,
                'explanation':   '',
                'llm_available': True,
            }
        except Exception as e:
            return {
                'success':       False,
                'error':         f'LLM call failed: {str(e)}',
                'query':         query,
                'explanation':   '',
                'llm_available': True,
            }

    def _build_prompt(self, query: str, schema: dict, strategy: str) -> str:
        schema_lines = []
        for tbl, info in (schema or {}).items():
            cols = info.get('columns', [])
            col_names = [c if isinstance(c, str) else c.get('name', c) for c in cols]
            rows = info.get('row_count', 'unknown')
            schema_lines.append(f'  {tbl} ({rows:,} rows): {", ".join(col_names)}')
        schema_desc = '\n'.join(schema_lines) or '  (no schema provided)'

        strategy_hint = f'\nOptimization focus: {strategy.replace("_", " ")}' if strategy else ''

        return f"""Optimize this SQL query for performance. The result must be identical to the original.

ORIGINAL QUERY:
{query}

SCHEMA:
{schema_desc}
{strategy_hint}

RULES:
1. Never change what rows are returned
2. Replace SELECT * with specific columns when beneficial
3. Use EXISTS instead of IN for subqueries when beneficial
4. Move WHERE filters as early as possible
5. Remove redundant ORDER BY inside subqueries without LIMIT
6. Do not add LIMIT unless the original has it

Respond with ONLY this JSON (no markdown fences, no extra text):
{{
  "optimized_query": "<the rewritten SQL>",
  "changes": ["change 1", "change 2"],
  "explanation": "brief explanation of what was changed and why",
  "confidence": 0.0
}}"""

    def _parse_response(self, content: str, original_query: str) -> dict:
        # Strip markdown fences if present
        content = re.sub(r'```(?:json)?', '', content).strip().strip('`').strip()

        parsed = None
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            m = re.search(r'\{.*\}', content, re.DOTALL)
            if m:
                try:
                    parsed = json.loads(m.group(0))
                except Exception:
                    pass

        if not parsed:
            return {
                'success':       False,
                'error':         'Could not parse LLM response as JSON',
                'query':         original_query,
                'explanation':   content[:500],
                'llm_available': True,
            }

        optimized = parsed.get('optimized_query', '').strip()

        if not optimized or not self._valid_sql(optimized):
            return {
                'success':       False,
                'error':         'LLM returned invalid or empty SQL',
                'query':         original_query,
                'explanation':   parsed.get('explanation', ''),
                'llm_available': True,
            }

        # Reject if LLM just returned the same query
        if self._normalize(optimized) == self._normalize(original_query):
            return {
                'success':       False,
                'error':         'LLM did not find any improvement',
                'query':         original_query,
                'explanation':   parsed.get('explanation', 'No changes needed'),
                'llm_available': True,
            }

        return {
            'success':       True,
            'query':         optimized,
            'changes':       parsed.get('changes', []),
            'explanation':   parsed.get('explanation', ''),
            'confidence':    float(parsed.get('confidence', 0.8)),
            'llm_available': True,
            'provider':      self._detect_provider(),
            'model':         self.model,
        }

    def _valid_sql(self, query: str) -> bool:
        q = query.upper().strip()
        return any(q.startswith(kw) for kw in ('SELECT', 'WITH', 'INSERT', 'UPDATE', 'DELETE'))

    def _normalize(self, query: str) -> str:
        return re.sub(r'\s+', ' ', query.strip().lower())
