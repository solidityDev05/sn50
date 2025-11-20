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
    """Fetch and process metagraph data from all subnets"""
    try:
        # Get all subnet IDs - try different API methods for compatibility
        try:
            all_subnets = subtensor.get_all_subnet_netuids()
        except AttributeError:
            # Fallback: try get_all_subnets() and extract netuids
            try:
                subnets_list = subtensor.get_all_subnets()
                all_subnets = [s['netuid'] if isinstance(s, dict) else s for s in subnets_list]
            except:
                # If both fail, try to get subnets manually (0-32 is typical range)
                all_subnets = list(range(0, 33))
        
        all_miners = []
        all_stakes = []
        total_stake_all = 0.0
        
        # Process each subnet
        for netuid in all_subnets:
            try:
                # Sync metagraph for this subnet
                metagraph = subtensor.metagraph(netuid=netuid)
                metagraph.sync()
                
                # Get all metrics
                stakes = np.array([float(s) for s in metagraph.S])
                ranks = np.array([float(r) for r in metagraph.R])
                trusts = np.array([float(t) for t in metagraph.T])
                incentives = np.array([float(i) for i in metagraph.I])
                
                # Calculate percentiles within this subnet
                for uid in range(len(metagraph.hotkeys)):
                    miner_data = {
                        'uid': int(uid),
                        'netuid': int(netuid),
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
                    all_miners.append(miner_data)
                    all_stakes.append(float(stakes[uid]))
                    total_stake_all += float(stakes[uid])
            except Exception as subnet_error:
                # Continue with other subnets if one fails
                print(f"Error processing subnet {netuid}: {subnet_error}")
                continue
        
        # Calculate global burn percentile across all subnets
        if len(all_stakes) > 0:
            all_stakes_array = np.array(all_stakes)
            burn_percentile = calculate_percentile(all_stakes_array, np.median(all_stakes_array))
        else:
            burn_percentile = 0.0
        
        # Calculate coldkey incentive percentiles (aggregate by coldkey)
        coldkey_incentives = {}
        for miner in all_miners:
            coldkey = miner['coldkey']
            if coldkey not in coldkey_incentives:
                coldkey_incentives[coldkey] = []
            coldkey_incentives[coldkey].append(miner['incentive_percentile'])
        
        # Calculate average incentive percentile per coldkey
        coldkey_data = []
        for coldkey, incentive_percentiles in coldkey_incentives.items():
            avg_incentive = np.mean(incentive_percentiles)
            coldkey_data.append({
                'coldkey': coldkey,
                'avg_incentive_percentile': float(avg_incentive),
                'miner_count': len(incentive_percentiles)
            })
        
        # Sort miners by stake percentile (descending)
        all_miners.sort(key=lambda x: x['stake_percentile'], reverse=True)
        
        return {
            'success': True,
            'timestamp': datetime.now().isoformat(),
            'burn_percentile': float(burn_percentile),
            'total_miners': len(all_miners),
            'total_stake': float(total_stake_all),
            'total_subnets': len(all_subnets),
            'miners': all_miners,
            'coldkey_incentives': coldkey_data
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