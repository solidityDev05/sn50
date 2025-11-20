# Bittensor Metagraph Status Website

A modern web application that displays the current status of the Bittensor metagraph, including burn percentile, alpha price (TAO), and individual miner percentiles.

## Features

- 🔥 **Burn Percentile**: Real-time burn percentile calculation
- 💰 **Alpha Price**: Current TAO price in USD
- 📊 **Miner Percentiles**: Detailed percentile rankings for each miner including:
  - Stake Percentile
  - Rank Percentile
  - Trust Percentile
  - Incentive Percentile
- 🔍 **Search & Filter**: Search miners by UID, Hotkey, or Coldkey
- 📈 **Sorting**: Sort miners by different percentile metrics
- 🔄 **Auto-refresh**: Automatically updates every 60 seconds

## Requirements

- **Python 3.10 or higher** (required for Bittensor SDK compatibility)

Check your Python version:
```bash
python --version
# or
python3 --version
```

## Installation

1. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

2. **Install Bittensor:**
```bash
pip install bittensor
```

## Configuration

The application uses the Bittensor Finney network (mainnet) by default. To change the network, edit `app.py`:

```python
subtensor = bt.subtensor(network="finney")  # Change to "test" for testnet
```

You can also specify a different subnet by changing the `netuid` parameter:

```python
metagraph = subtensor.metagraph(netuid=1)  # Change subnet ID as needed
```

## Running the Application

1. **Start the Flask server:**
```bash
python app.py
```

2. **Open your browser:**
Navigate to `http://localhost:5000`

## API Endpoints

- `GET /api/metagraph` - Returns metagraph data including burn percentile and miner information
- `GET /api/alpha-price` - Returns current TAO price (with CoinGecko fallback)

## Project Structure

```
website/
├── app.py              # Flask backend server
├── requirements.txt    # Python dependencies
├── README.md          # This file
└── static/
    ├── index.html     # Main HTML page
    ├── styles.css     # Styling
    └── app.js         # Frontend JavaScript
```

## Notes

- The burn percentile calculation uses stake distribution as a proxy. You may need to adjust this based on actual burn metric availability in the metagraph.
- Alpha price fetching includes a fallback to CoinGecko API if the primary endpoint doesn't return a price.
- The application filters out inactive miners (those with IP 0.0.0.0) by default.

## Troubleshooting

If you encounter issues:

1. **Connection errors**: Ensure you have internet connectivity and can access the Bittensor network
2. **Import errors**: Make sure all dependencies are installed: `pip install -r requirements.txt`
3. **Port conflicts**: Change the port in `app.py` if port 5000 is already in use

## License

MIT License

