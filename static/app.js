let minersData = [];
let coldkeyIncentivesData = [];
let sortBy = 'stake_percentile';
let charts = {
    stake: null,
    rank: null,
    trust: null,
    incentive: null,
    coldkeyIncentive: null
};

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
            coldkeyIncentivesData = data.coldkey_incentives || [];
            renderMinersTable();
            updateCharts();
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
    document.getElementById('totalSubnets').textContent = data.total_subnets || 0;
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
        tbody.innerHTML = '<tr><td colspan="10" class="loading">No miners found</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredMiners.map(miner => `
        <tr>
            <td>${miner.netuid || 'N/A'}</td>
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

// Calculate distribution by percentile ranges
function calculateDistribution(data, field) {
    const ranges = {
        '0-25%': 0,
        '25-50%': 0,
        '50-75%': 0,
        '75-100%': 0
    };
    
    data.forEach(miner => {
        const percentile = miner[field];
        if (percentile >= 75) {
            ranges['75-100%']++;
        } else if (percentile >= 50) {
            ranges['50-75%']++;
        } else if (percentile >= 25) {
            ranges['25-50%']++;
        } else {
            ranges['0-25%']++;
        }
    });
    
    return ranges;
}

// Create or update pie chart
function createChart(canvasId, colors) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    const chartType = canvasId.replace('Chart', '');
    
    // Destroy existing chart if it exists
    if (charts[chartType]) {
        charts[chartType].destroy();
    }
    
    const ranges = calculateDistribution(minersData, `${chartType}_percentile`);
    
    charts[chartType] = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(ranges),
            datasets: [{
                data: Object.values(ranges),
                backgroundColor: colors,
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} miners (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Create coldkey incentive chart
function createColdkeyIncentiveChart() {
    const ctx = document.getElementById('coldkeyIncentiveChart');
    if (!ctx || coldkeyIncentivesData.length === 0) return;
    
    // Destroy existing chart if it exists
    if (charts.coldkeyIncentive) {
        charts.coldkeyIncentive.destroy();
    }
    
    // Group coldkeys by incentive percentile ranges
    const ranges = {
        '0-25%': 0,
        '25-50%': 0,
        '50-75%': 0,
        '75-100%': 0
    };
    
    coldkeyIncentivesData.forEach(coldkey => {
        const percentile = coldkey.avg_incentive_percentile;
        if (percentile >= 75) {
            ranges['75-100%']++;
        } else if (percentile >= 50) {
            ranges['50-75%']++;
        } else if (percentile >= 25) {
            ranges['25-50%']++;
        } else {
            ranges['0-25%']++;
        }
    });
    
    const colors = ['#28a745', '#ffc107', '#fd7e14', '#dc3545'];
    
    charts.coldkeyIncentive = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(ranges),
            datasets: [{
                data: Object.values(ranges),
                backgroundColor: colors,
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} coldkeys (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Update all charts
function updateCharts() {
    if (minersData.length === 0) return;
    
    const colors = {
        stake: ['#28a745', '#ffc107', '#fd7e14', '#dc3545'],
        rank: ['#17a2b8', '#6f42c1', '#e83e8c', '#20c997'],
        trust: ['#007bff', '#6610f2', '#6f42c1', '#e83e8c'],
        incentive: ['#20c997', '#17a2b8', '#ffc107', '#fd7e14']
    };
    
    createChart('stakeChart', colors.stake);
    createChart('rankChart', colors.rank);
    createChart('trustChart', colors.trust);
    createChart('incentiveChart', colors.incentive);
    createColdkeyIncentiveChart();
}

// Show error message
function showError(message) {
    const tbody = document.getElementById('minersTableBody');
    tbody.innerHTML = `<tr><td colspan="10" class="loading" style="color: #dc3545;">${message}</td></tr>`;
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

