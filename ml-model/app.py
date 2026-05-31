"""
Flask ML Service - Main API Entry Point
Serves the SQL Query Optimization engine via REST API.
"""
from flask import Flask, request, jsonify
import traceback
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from src.optimizer_pipeline import OptimizerPipeline
from src.llm_optimizer import LLMOptimizer
from src.cloud_cost import CloudCostCalculator

app = Flask(__name__)

# Manual CORS (works without flask-cors package)
@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return response

@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        from flask import Response
        r = Response()
        r.headers['Access-Control-Allow-Origin'] = '*'
        r.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        r.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
        return r, 204

# Initialize pipeline (loads ML models on startup)
print("[Startup] Initializing optimizer pipeline...")
pipeline = OptimizerPipeline()
print("[Startup] Pipeline ready.")


@app.route('/health', methods=['GET'])
def health():
    llm_status = LLMOptimizer().get_status()
    return jsonify({
        'status': 'ok',
        'service': 'SQL Query Optimizer ML Service',
        'version': '2.0.0',
        'llm': llm_status,
    })


@app.route('/optimize', methods=['POST'])
def optimize():
    """
    Main optimization endpoint.
    
    Body:
    {
        "query": "SELECT ...",
        "schema": { "table": { "columns": [...], "row_count": N } },
        "use_llm": false,
        "calculate_cloud_cost": true
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body must be JSON'}), 400

        query = data.get('query', '').strip()
        schema = data.get('schema', {})
        use_llm = data.get('use_llm', False)
        calculate_cloud_cost = data.get('calculate_cloud_cost', True)

        if not query:
            return jsonify({'error': 'Query is required'}), 400

        # Validate query starts with SELECT (read-only)
        if not query.upper().lstrip().startswith(('SELECT', 'WITH')):
            return jsonify({'error': 'Only SELECT queries are supported for optimization'}), 400

        result = pipeline.run(
            query=query,
            schema=schema,
            use_llm=use_llm,
            calculate_cloud_cost=calculate_cloud_cost,
        )

        return jsonify(result)

    except Exception as e:
        traceback.print_exc()
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@app.route('/cloud-cost', methods=['POST'])
def cloud_cost_only():
    """Calculate cloud costs for a query without full optimization."""
    try:
        data = request.get_json()
        query = data.get('query', '')
        schema = data.get('schema', {})
        execution_cost = data.get('execution_cost', 100)

        calculator = CloudCostCalculator()
        costs = calculator.calculate_all(query, schema, execution_cost)
        return jsonify(costs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/llm-status', methods=['GET'])
def llm_status():
    """Check LLM configuration status."""
    return jsonify(LLMOptimizer().get_status())


@app.route('/features', methods=['POST'])
def extract_features():
    """Extract query features only (for debugging/inspection)."""
    try:
        data = request.get_json()
        from src.feature_extractor import FeatureExtractor
        extractor = FeatureExtractor()
        features = extractor.extract(data.get('query', ''), data.get('schema'))
        return jsonify({'features': features})
    except Exception as e:
        return jsonify({'error': str(e)}), 500



@app.route('/index-advice', methods=['POST'])
def index_advice():
    """
    Standalone index recommendation endpoint.
    Body: { "query": "...", "schema": {...} }
    """
    try:
        data   = request.get_json()
        query  = data.get('query', '').strip()
        schema = data.get('schema', {})
        if not query:
            return jsonify({'error': 'Query is required'}), 400
        from src.index_advisor import IndexAdvisor
        advisor = IndexAdvisor()
        result  = advisor.analyze(query, schema)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)
