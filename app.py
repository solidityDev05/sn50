from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import bittensor as bt
import numpy as np
import os
from datetime import datetime

app = Flask(__name__, static_folder='static')
CORS(app)

# Initialize Subtensor
subtensor = bt.subtensor(network="finney")  # Use 'finney' for mainnet, 'test' for testnet

def calculate_percentile(data, value):
    """Calculate percentile rank of a value in a dataset"""
    if len(data) == 0:
        return 0
    return (np.sum(data <= value) / len(data)) * 100

def get_metagraph_data():
    """Fetch and process metagraph data"""
    try:
        # Sync metagraph
        metagraph = subtensor.metagraph(netuid=1)  # Default subnet, adjust if needed
        metagraph.sync()
        
        # Get all metrics
        stakes = np.array([float(s) for s in metagraph.S])
        ranks = np.array([float(r) for r in metagraph.R])
        trusts = np.array([float(t) for t in metagraph.T])
        incentives = np.array([float(i) for i in metagraph.I])
        
        # Calculate burn percentile (using stake as proxy, adjust based on actual burn metric)
        # Note: You may need to adjust this based on actual burn data availability
        total_stake = np.sum(stakes)
        burn_percentile = calculate_percentile(stakes, np.median(stakes))
        
        # Get miners data with percentiles
        miners = []
        for uid in range(len(metagraph.hotkeys)):
            if metagraph.axons[uid].ip != '0.0.0.0':  # Only active miners
                miner_data = {
                    'uid': int(uid),
                    'hotkey': str(metagraph.hotkeys[uid]),
                    'coldkey': str(metagraph.coldkeys[uid]),
                    'stake': float(stakes[uid]),
                    'rank': float(ranks[uid]),
                    'trust': float(trusts[uid]),
                    'incentive': float(incentives[uid]),
                    'stake_percentile': calculate_percentile(stakes, stakes[uid]),
                    'rank_percentile': calculate_percentile(ranks, ranks[uid]),
                    'trust_percentile': calculate_percentile(trusts, trusts[uid]),
                    'incentive_percentile': calculate_percentile(incentives, incentives[uid]),
                    'active': bool(metagraph.axons[uid].ip != '0.0.0.0')
                }
                miners.append(miner_data)
        
        # Sort miners by stake percentile (descending)
        miners.sort(key=lambda x: x['stake_percentile'], reverse=True)
        
        return {
            'success': True,
            'timestamp': datetime.now().isoformat(),
            'burn_percentile': float(burn_percentile),
            'total_miners': len(miners),
            'total_stake': float(total_stake),
            'miners': miners
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

@app.route('/api/metagraph', methods=['GET'])
def get_metagraph():
    """API endpoint to get metagraph data"""
    data = get_metagraph_data()
    return jsonify(data)

@app.route('/api/alpha-price', methods=['GET'])
def get_alpha_price():
    """API endpoint to get TAO (alpha) price"""
    try:
        import requests
        # Fetch price from CoinGecko API
        response = requests.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd',
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            price = data.get('bittensor', {}).get('usd', 0.0)
            return jsonify({
                'success': True,
                'price_usd': float(price),
                'symbol': 'TAO',
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch price from CoinGecko'
            })
    except ImportError:
        # Fallback if requests is not available
        return jsonify({
            'success': False,
            'error': 'requests library not available'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/')
def index():
    """Serve the main page"""
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory('static', path)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

