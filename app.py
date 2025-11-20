from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
import bittensor as bt
import numpy as np
import os
import csv
import threading
import time
from datetime import datetime

app = Flask(__name__, static_folder='static')
CORS(app)

# Initialize Subtensor
subtensor = bt.subtensor(network="finney")  # Use 'finney' for mainnet, 'test' for testnet

# Global TAO price cache
tao_price_cache = None
tao_price_cache_time = None

# CSV file path
CSV_DIR = 'data'
CSV_FILE = os.path.join(CSV_DIR, 'metagraph_data.csv')

# Ensure data directory exists
os.makedirs(CSV_DIR, exist_ok=True)

def calculate_percentile(data, value):
    """Calculate percentile rank of a value in a dataset"""
    if len(data) == 0:
        return 0
    return (np.sum(data <= value) / len(data)) * 100

def get_tao_price():
    """Get TAO price using subtensor.all_subnets()[120].price * 2980"""
    global tao_price_cache, tao_price_cache_time
    
    # Cache price for 5 minutes
    if tao_price_cache and tao_price_cache_time:
        if (time.time() - tao_price_cache_time) < 300:
            return tao_price_cache
    
    try:
        # Get price from subnet 120
        all_subnets_metagraph = subtensor.all_subnets()
        if len(all_subnets_metagraph) > 120:
            price = float(all_subnets_metagraph[120].price) * 2980
            tao_price_cache = price
            tao_price_cache_time = time.time()
            return price
        else:
            print(f"Warning: Subnet 120 not found, using fallback")
    except Exception as e:
        print(f"Error getting TAO price from subnet 120: {e}")
    
    # Fallback to CoinGecko
    try:
        import requests
        response = requests.get(
            'https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd',
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            price = data.get('bittensor', {}).get('usd', 0.0)
            tao_price_cache = float(price)
            tao_price_cache_time = time.time()
            return float(price)
    except:
        pass
    
    # Return cached price or default
    return tao_price_cache if tao_price_cache else 0.0

def get_metagraph_data(netuid=None):
    """Fetch and process metagraph data from all subnets or a specific subnet"""
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
                all_subnets = list(range(0, 129))
        
        # Filter to specific subnet if requested
        if netuid is not None:
            if netuid not in all_subnets:
                return {
                    'success': False,
                    'error': f'Subnet {netuid} not found',
                    'timestamp': datetime.now().isoformat()
                }
            all_subnets = [netuid]
        
        all_miners = []
        all_stakes = []
        total_stake_all = 0.0
        processed_subnets = 0
        
        # Process each subnet
        for subnet_id in all_subnets:
            try:
                # Sync metagraph for this subnet
                metagraph = subtensor.metagraph(netuid=subnet_id)
                metagraph.sync()
                
                # Get all metrics
                stakes = np.array([float(s) for s in metagraph.S])
                ranks = np.array([float(r) for r in metagraph.R])
                trusts = np.array([float(t) for t in metagraph.T])
                incentives = np.array([float(i) for i in metagraph.I])
                emissions  = np.array([float(i) for i in metagraph.E])
                
                # Get TAO price
                tao_price = get_tao_price()
                
                # Blocks per day (approximately 7200 blocks per day for Bittensor)
                epochs_per_day = 20
                
                # Get owner hotkeys for burn detection (hotkeys that own themselves)
                owner_hotkeys = set()
                for uid_check in range(len(metagraph.hotkeys)):
                    # Check if hotkey == coldkey (self-owned, considered burn if has incentive)
                    if str(metagraph.hotkeys[uid_check]) == str(metagraph.coldkeys[uid_check]):
                        owner_hotkeys.add(str(metagraph.hotkeys[uid_check]))
                
                # Calculate percentiles within this subnet
                for uid in range(len(metagraph.hotkeys)):
                    # Calculate incentive emission (emission per block in TAO)
                    incentive_emission = 0.0
                    if len(emissions) > uid:
                        # E array is typically in rao, convert to TAO (1 TAO = 1e9 rao)
                        incentive_emission = float(emissions[uid])
                    
                    # Calculate daily emission (emission per block * blocks per day)
                    daily_emission = incentive_emission * epochs_per_day if incentive_emission > 0 else 0.0
                    
                    hotkey = str(metagraph.hotkeys[uid])
                    coldkey = str(metagraph.coldkeys[uid])
                    stake = float(stakes[uid])
                    incentive = float(incentives[uid])
                    
                    # Check if miner is burned (has incentive and is owner hotkey)
                    is_burned = incentive > 0 and hotkey in owner_hotkeys
                    
                    # Calculate TAO amount (stake * price)
                    tao_amount = stake * tao_price if tao_price > 0 else 0.0
                    
                    miner_data = {
                        'uid': int(uid),
                        'netuid': int(subnet_id),
                        'hotkey': hotkey,
                        'coldkey': coldkey,
                        'stake': stake,
                        'incentive': incentive,
                        'emission': float(incentive_emission),
                        'daily_emission': float(daily_emission),
                        'tao_amount': float(tao_amount),
                        'is_burned': is_burned,
                        'axon': metagraph.axons[uid].ip_str()[6:]
                    }
                    all_miners.append(miner_data)
                    all_stakes.append(float(stakes[uid]))
                    total_stake_all += float(stakes[uid])
                processed_subnets += 1
            except Exception as subnet_error:
                # Continue with other subnets if one fails
                print(f"Error processing subnet {subnet_id}: {subnet_error}")
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
            coldkey_incentives[coldkey].append(miner['incentive'])
        
        # Calculate average incentive percentile per coldkey
        coldkey_data = []
        for coldkey, incentive_list in coldkey_incentives.items():
            avg_incentive = np.mean(incentive_list)
            coldkey_data.append({
                'coldkey': coldkey,
                'avg_incentive_percentile': float(avg_incentive),
                'miner_count': len(incentive_list)
            })
        
        # Calculate burn statistics per subnet
        burn_stats = {}
        for miner in all_miners:
            netuid = miner['netuid']
            if netuid not in burn_stats:
                burn_stats[netuid] = {
                    'total_miners': 0,
                    'burned_miners': 0,
                    'total_incentive': 0.0,
                    'burned_incentive': 0.0
                }
            burn_stats[netuid]['total_miners'] += 1
            burn_stats[netuid]['total_incentive'] += miner['incentive']
            if miner.get('is_burned', False):
                burn_stats[netuid]['burned_miners'] += 1
                burn_stats[netuid]['burned_incentive'] += miner['incentive']
        
        # Sort miners by stake percentile (descending)
        all_miners.sort(key=lambda x: x['stake'], reverse=True)
        
        # Get TAO price
        tao_price = get_tao_price()
        
        return {
            'success': True,
            'timestamp': datetime.now().isoformat(),
            'burn_percentile': float(burn_percentile),
            'total_miners': len(all_miners),
            'total_stake': float(total_stake_all),
            'total_subnets': processed_subnets,
            'selected_netuid': netuid,
            'miners': all_miners,
            'coldkey_incentives': coldkey_data,
            'burn_stats': burn_stats,
            'tao_price': float(tao_price)
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

def save_metagraph_to_csv():
    """Save metagraph data from all subnets to CSV file"""
    try:
        print(f"[{datetime.now()}] Starting CSV export...")
        data = get_metagraph_data(netuid=None)  # Get all subnets
        
        if not data['success']:
            print(f"[{datetime.now()}] Failed to fetch metagraph data: {data.get('error')}")
            return
        
        # Prepare CSV data
        csv_rows = []
        for miner in data['miners']:
            csv_rows.append({
                'netuid': miner['netuid'],
                'uid': miner['uid'],
                'hotkey': miner['hotkey'],
                'coldkey': miner['coldkey'],
                'stake': miner['stake'],
                'incentive': miner.get('incentive', 0),
                'emission': miner.get('emission', 0),
                'daily_emission': miner.get('daily_emission', 0),
                'axon': miner.get('axon', ''),
                'timestamp': data['timestamp']
            })
        
        # Write to CSV
        with open(CSV_FILE, 'w', newline='', encoding='utf-8') as csvfile:
            if csv_rows:
                fieldnames = csv_rows[0].keys()
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(csv_rows)
        
        print(f"[{datetime.now()}] CSV export completed: {len(csv_rows)} miners saved to {CSV_FILE}")
    except Exception as e:
        print(f"[{datetime.now()}] Error saving CSV: {str(e)}")

def load_metagraph_from_csv():
    """Load metagraph data from CSV file"""
    if not os.path.exists(CSV_FILE):
        return {
            'success': False,
            'error': 'CSV file not found',
            'timestamp': datetime.now().isoformat()
        }
    
    miners = []
    coldkey_incentives = {}
    total_stake = 0.0
    
    try:
        with open(CSV_FILE, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                miner = {
                    'netuid': int(row['netuid']),
                    'uid': int(row['uid']),
                    'hotkey': row['hotkey'],
                    'coldkey': row['coldkey'],
                    'stake': float(row['stake']),
                    'incentive': float(row.get('incentive', 0)),
                    'emission': float(row.get('emission', 0)),
                    'daily_emission': float(row.get('daily_emission', 0)),
                    'axon': row.get('axon', ''),
                    'active': True  # Assume active if in CSV
                }
                miners.append(miner)
                total_stake += miner['stake']
                
                # Aggregate coldkey incentives
                coldkey = miner['coldkey']
                if coldkey not in coldkey_incentives:
                    coldkey_incentives[coldkey] = []
                coldkey_incentives[coldkey].append(miner['incentive'])
        
        # Calculate coldkey data
        coldkey_data = []
        for coldkey, incentives in coldkey_incentives.items():
            avg_incentive = np.mean(incentives)
            coldkey_data.append({
                'coldkey': coldkey,
                'avg_incentive_percentile': float(avg_incentive),
                'miner_count': len(incentives)
            })
        
        # Get file timestamp
        file_time = os.path.getmtime(CSV_FILE)
        file_timestamp = datetime.fromtimestamp(file_time).isoformat()
        
        # Calculate burn percentile
        stakes = np.array([m['stake'] for m in miners])
        burn_percentile = calculate_percentile(stakes, np.median(stakes)) if len(stakes) > 0 else 0.0
        
        return {
            'success': True,
            'timestamp': file_timestamp,
            'burn_percentile': float(burn_percentile),
            'total_miners': len(miners),
            'total_stake': float(total_stake),
            'total_subnets': len(set(m['netuid'] for m in miners)),
            'selected_netuid': None,
            'miners': miners,
            'coldkey_incentives': coldkey_data,
            'source': 'csv'
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'Error reading CSV: {str(e)}',
            'timestamp': datetime.now().isoformat()
        }

def csv_export_scheduler():
    """Background thread to export CSV every 72 minutes"""
    while True:
        save_metagraph_to_csv()
        # Sleep for 72 minutes (4320 seconds)
        time.sleep(4320)

# Start CSV export scheduler in background thread
scheduler_thread = threading.Thread(target=csv_export_scheduler, daemon=True)
scheduler_thread.start()

# Initial CSV export on startup (with delay to let server start)
def delayed_initial_export():
    time.sleep(5)  # Wait 5 seconds for server to start
    save_metagraph_to_csv()

initial_export_thread = threading.Thread(target=delayed_initial_export, daemon=True)
initial_export_thread.start()

@app.route('/api/subnets', methods=['GET'])
def get_subnets():
    """API endpoint to get list of all available subnets"""
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
                all_subnets = list(range(0, 129))
        
        return jsonify({
            'success': True,
            'subnets': sorted([int(n) for n in all_subnets])
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'subnets': []
        })

@app.route('/api/metagraph', methods=['GET'])
def get_metagraph():
    """API endpoint to get metagraph data"""
    # Get optional netuid parameter (None means all subnets)
    netuid_param = request.args.get('netuid', 0)
    netuid = int(netuid_param) if netuid_param and netuid_param.lower() != 'all' else None
    
    # Check if CSV file exists and is recent (less than 72 minutes old)
    use_csv = False
    if netuid is None and os.path.exists(CSV_FILE):
        file_time = os.path.getmtime(CSV_FILE)
        age_minutes = (time.time() - file_time) / 60
        if age_minutes < 72:
            use_csv = True
    
    if use_csv:
        # Load from CSV
        try:
            csv_data = load_metagraph_from_csv()
            if csv_data['success']:
                return jsonify(csv_data)
            else:
                print(f"Error loading from CSV: {csv_data.get('error')}, falling back to API")
        except Exception as e:
            print(f"Exception loading from CSV: {e}, falling back to API")
    
    # Fallback to API
    data = get_metagraph_data(netuid=netuid)
    return jsonify(data)

@app.route('/api/alpha-price', methods=['GET'])
def get_alpha_price():
    """API endpoint to get TAO (alpha) price"""
    price = get_tao_price()
    return jsonify({
        'success': True,
        'price_usd': float(price),
        'symbol': 'TAO',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/')
def index():
    """Serve the main page"""
    return send_from_directory('static', 'index.html')

@app.route('/api/csv-status', methods=['GET'])
def csv_status():
    """Get CSV file status"""
    if os.path.exists(CSV_FILE):
        file_time = os.path.getmtime(CSV_FILE)
        age_minutes = (time.time() - file_time) / 60
        return jsonify({
            'exists': True,
            'age_minutes': round(age_minutes, 2),
            'last_updated': datetime.fromtimestamp(file_time).isoformat(),
            'file_path': CSV_FILE
        })
    else:
        return jsonify({
            'exists': False,
            'age_minutes': None,
            'last_updated': None,
            'file_path': CSV_FILE
        })

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory('static', path)

if __name__ == '__main__':
    print(f"[{datetime.now()}] Starting Flask server...")
    print(f"[{datetime.now()}] CSV export scheduled every 72 minutes")
    print(f"[{datetime.now()}] CSV file location: {CSV_FILE}")
    app.run(debug=True, host='0.0.0.0', port=5000)