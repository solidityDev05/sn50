let minersData = [];
let sortBy = 'stake_percentile';

// Format number with commas
function formatNumber(num) {
    if (num === null || num === undefined) return '--';
    return parseFloat(num).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Format percentage
function formatPercent(num) {
    if (num === null || num === undefined) return '--';
    return parseFloat(num).toFixed(2) + '%';
}

// Get percentile color class
function getPercentileClass(percentile) {
    if (percentile >= 75) return 'percentile-high';
    if (percentile >= 50) return 'percentile-medium';
    return 'percentile-low';
}

// Truncate address
function truncateAddress(address, start = 6, end = 4) {
    if (!address) return '--';
    if (address.length <= start + end) return address;
    return address.substring(0, start) + '...' + address.substring(address.length - end);
}

// Fetch metagraph data
async function fetchMetagraphData() {
    try {
        const response = await fetch('/api/metagraph');
        const data = await response.json();
        
        if (data.success) {
            updateStats(data);
            minersData = data.miners || [];
            renderMinersTable();
            document.getElementById('lastUpdated').textContent = 
                `Last updated: ${new Date(data.timestamp).toLocaleString()}`;
        } else {
            console.error('Error fetching metagraph:', data.error);
            showError('Failed to fetch metagraph data: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Failed to connect to server');
    }
}

// Fetch alpha price
async function fetchAlphaPrice() {
    try {
        const response = await fetch('/api/alpha-price');
        const data = await response.json();
        
        if (data.success && data.price_usd > 0) {
            document.getElementById('alphaPrice').textContent = '$' + formatNumber(data.price_usd);
        } else {
            // Try to fetch from CoinGecko API as fallback
            try {
                const cgResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd');
                const cgData = await cgResponse.json();
                if (cgData.bittensor && cgData.bittensor.usd) {
                    document.getElementById('alphaPrice').textContent = '$' + formatNumber(cgData.bittensor.usd);
                }
            } catch (e) {
                document.getElementById('alphaPrice').textContent = 'N/A';
            }
        }
    } catch (error) {
        console.error('Error fetching price:', error);
    }
}

// Update stats cards
function updateStats(data) {
    document.getElementById('burnPercentile').textContent = formatPercent(data.burn_percentile);
    document.getElementById('totalMiners').textContent = data.total_miners || 0;
    document.getElementById('totalStake').textContent = formatNumber(data.total_stake);
}

// Render miners table
function renderMinersTable() {
    const tbody = document.getElementById('minersTableBody');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    // Filter miners
    let filteredMiners = minersData.filter(miner => {
        if (!searchTerm) return true;
        return (
            miner.uid.toString().includes(searchTerm) ||
            miner.hotkey.toLowerCase().includes(searchTerm) ||
            miner.coldkey.toLowerCase().includes(searchTerm)
        );
    });
    
    // Sort miners
    filteredMiners.sort((a, b) => {
        if (sortBy === 'uid') {
            return a.uid - b.uid;
        }
        return b[sortBy] - a[sortBy];
    });
    
    if (filteredMiners.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">No miners found</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredMiners.map(miner => `
        <tr>
            <td>${miner.uid}</td>
            <td class="hotkey-cell" title="${miner.hotkey}">${truncateAddress(miner.hotkey)}</td>
            <td class="coldkey-cell" title="${miner.coldkey}">${truncateAddress(miner.coldkey)}</td>
            <td class="percentile-cell ${getPercentileClass(miner.stake_percentile)}">
                ${formatPercent(miner.stake_percentile)}
            </td>
            <td class="percentile-cell ${getPercentileClass(miner.rank_percentile)}">
                ${formatPercent(miner.rank_percentile)}
            </td>
            <td class="percentile-cell ${getPercentileClass(miner.trust_percentile)}">
                ${formatPercent(miner.trust_percentile)}
            </td>
            <td class="percentile-cell ${getPercentileClass(miner.incentive_percentile)}">
                ${formatPercent(miner.incentive_percentile)}
            </td>
            <td>${formatNumber(miner.stake)}</td>
            <td>
                <span class="status-badge ${miner.active ? 'status-active' : 'status-inactive'}">
                    ${miner.active ? 'Active' : 'Inactive'}
                </span>
            </td>
        </tr>
    `).join('');
}

// Show error message
function showError(message) {
    const tbody = document.getElementById('minersTableBody');
    tbody.innerHTML = `<tr><td colspan="9" class="loading" style="color: #dc3545;">${message}</td></tr>`;
}

// Event listeners
document.getElementById('refreshBtn').addEventListener('click', () => {
    fetchMetagraphData();
    fetchAlphaPrice();
});

document.getElementById('searchInput').addEventListener('input', () => {
    renderMinersTable();
});

document.getElementById('sortSelect').addEventListener('change', (e) => {
    sortBy = e.target.value;
    renderMinersTable();
});

// Initial load
fetchMetagraphData();
fetchAlphaPrice();

// Auto-refresh every 60 seconds
setInterval(() => {
    fetchMetagraphData();
    fetchAlphaPrice();
}, 60000);

