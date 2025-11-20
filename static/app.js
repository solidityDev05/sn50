let minersData = [];
let coldkeyIncentivesData = [];
let sortBy = 'stake';
let sortDirection = 'desc'; // 'asc' or 'desc'
let charts = {
    stake: null,
    rank: null,
    trust: null,
    incentive: null,
    coldkeyIncentive: null
};

// Metagraph view data
let metagraphMinersData = [];
let metagraphColdkeyIncentivesData = [];
let metagraphSortBy = 'stake';
let metagraphSortDirection = 'desc';
let metagraphCharts = {
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

// Copy to clipboard function
function copyToClipboard(text, button) {
    // Decode HTML entities
    const decodedText = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(decodedText).then(() => {
            // Visual feedback
            const originalText = button.innerHTML;
            button.innerHTML = '✓';
            button.classList.add('copied');
            
            // Reset after 2 seconds
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            fallbackCopy(decodedText, button);
        });
    } else {
        fallbackCopy(decodedText, button);
    }
}

// Fallback copy function for older browsers
function fallbackCopy(text, button) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        const originalText = button.innerHTML;
        button.innerHTML = '✓';
        button.classList.add('copied');
        setTimeout(() => {
            button.innerHTML = originalText;
            button.classList.remove('copied');
        }, 2000);
    } catch (e) {
        console.error('Failed to copy:', e);
    }
    
    document.body.removeChild(textArea);
}

// Fetch available subnets
async function fetchSubnets() {
    try {
        const response = await fetch('/api/subnets');
        const data = await response.json();
        
        if (data.success && data.subnets) {
            const subnetSelect = document.getElementById('subnetSelect');
            // Clear existing options except "All Subnets"
            subnetSelect.innerHTML = '<option value="all">All Subnets</option>';
            
            // Add each subnet as an option
            data.subnets.forEach(netuid => {
                const option = document.createElement('option');
                option.value = netuid;
                option.textContent = `Subnet ${netuid}`;
                subnetSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error fetching subnets:', error);
    }
}

// Fetch metagraph data
async function fetchMetagraphData(netuid = null) {
    try {
        let url = '/api/metagraph';
        if (netuid !== null && netuid !== 'all') {
            url += `?netuid=${netuid}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            updateStats(data);
            minersData = data.miners || [];
            coldkeyIncentivesData = data.coldkey_incentives || [];
            renderMinersTable();
            updateCharts();
            setupTableHeaderSorting();
            updateSortIndicators();
            const sourceText = data.source === 'csv' ? ' (from CSV)' : '';
            document.getElementById('lastUpdated').textContent = 
                `Last updated: ${new Date(data.timestamp).toLocaleString()}${sourceText}`;
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
        
        let priceText = '--';
        if (data.success && data.price_usd > 0) {
            priceText = '$' + formatNumber(data.price_usd);
        } else {
            // Try to fetch from CoinGecko API as fallback
            try {
                const cgResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd');
                const cgData = await cgResponse.json();
                if (cgData.bittensor && cgData.bittensor.usd) {
                    priceText = '$' + formatNumber(cgData.bittensor.usd);
                } else {
                    priceText = 'N/A';
                }
            } catch (e) {
                priceText = 'N/A';
            }
        }
        
        // Update both price displays
        const alphaPriceEl = document.getElementById('alphaPrice');
        const metagraphAlphaPriceEl = document.getElementById('metagraphAlphaPrice');
        if (alphaPriceEl) alphaPriceEl.textContent = priceText;
        if (metagraphAlphaPriceEl) metagraphAlphaPriceEl.textContent = priceText;
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
        let aVal, bVal;
        
        // Handle different field types
        if (sortBy === 'uid' || sortBy === 'netuid') {
            aVal = a[sortBy];
            bVal = b[sortBy];
        } else if (sortBy === 'hotkey' || sortBy === 'coldkey') {
            aVal = (a[sortBy] || '').toLowerCase();
            bVal = (b[sortBy] || '').toLowerCase();
        } else if (sortBy === 'active') {
            aVal = a[sortBy] ? 1 : 0;
            bVal = b[sortBy] ? 1 : 0;
        } else {
            // Numeric fields (percentiles, stake)
            aVal = parseFloat(a[sortBy]) || 0;
            bVal = parseFloat(b[sortBy]) || 0;
        }
        
        // Compare values
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    if (filteredMiners.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading">No miners found</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredMiners.map((miner, index) => {
        // Escape HTML entities for data attributes
        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };
        
        const hotkey = miner.hotkey || '';
        const coldkey = miner.coldkey || '';
        
        const isValidator = parseFloat(miner.stake) > 10000;
        return `
        <tr class="${isValidator ? 'validator-row' : ''}">
            <td>${miner.netuid || 'N/A'}</td>
            <td>${miner.uid}</td>
            <td>${formatNumber(miner.stake)}</td>
            <td class="hotkey-cell" title="${hotkey}">
                <span class="address-text">${truncateAddress(hotkey)}</span>
                <button class="copy-btn" data-copy-text="${escapeHtml(hotkey)}" title="Copy hotkey">
                    📋
                </button>
            </td>
            <td class="coldkey-cell" title="${coldkey}">
                <span class="address-text">${truncateAddress(coldkey)}</span>
                <button class="copy-btn" data-copy-text="${escapeHtml(coldkey)}" title="Copy coldkey">
                    📋
                </button>
            </td>

            <td class="percentile-cell ${getPercentileClass(miner.incentive)}">
                ${formatNumber(miner.incentive)}
            </td>

            <td>${formatNumber(miner.emission || 0)}</td>
            <td>${formatNumber(miner.daily_emission || 0)}</td>
            <td>
                <span class="status-badge">
                    ${miner.axon}
                </span>
            </td>
        </tr>
    `;
    }).join('');
    
    // Attach event listeners to copy buttons after rendering
    document.querySelectorAll('.copy-btn').forEach(button => {
        button.addEventListener('click', function() {
            const textToCopy = this.getAttribute('data-copy-text');
            if (textToCopy) {
                copyToClipboard(textToCopy, this);
            }
        });
    });
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
    tbody.innerHTML = `<tr><td colspan="12" class="loading" style="color: #dc3545;">${message}</td></tr>`;
}

// Function to handle column header clicks for sorting
function setupTableHeaderSorting() {
    const headers = document.querySelectorAll('#minersTable thead th');
    headers.forEach((header, index) => {
        // Map column index to field name
        const columnMap = {
            0: 'netuid',
            1: 'stake',
            2: 'uid',
            3: 'hotkey',
            4: 'coldkey',
            5: 'incentive'  ,
            6: 'emission',
            7: 'daily_emission',
            8: 'axon',
        };
        const fieldName = columnMap[index];
        if (fieldName) {
            header.style.cursor = 'pointer';
            header.classList.add('sortable');
            
            header.addEventListener('click', () => {
                // Toggle sort direction if clicking the same column
                if (sortBy === fieldName) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortBy = fieldName;
                    sortDirection = 'desc'; // Default to descending for new column
                }
                
                updateSortIndicators();
                renderMinersTable();
            });
        }
    });
}

// Update sort indicators in table headers
function updateSortIndicators() {
    const headers = document.querySelectorAll('#minersTable thead th');
    const columnMap = {
        0: 'netuid',
        1: 'stake',
        2: 'uid',
        3: 'hotkey',
        4: 'coldkey',
        5: 'incentive'  ,
        6: 'emission',
        7: 'daily_emission',
        8: 'axon',
    };
    
    headers.forEach((header, index) => {
        const fieldName = columnMap[index];
        // Remove all sort indicators
        header.classList.remove('sort-asc', 'sort-desc');
        
        // Add indicator for current sort column
        if (fieldName === sortBy) {
            header.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// Page navigation
function switchPage(page) {
    // Hide all pages
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Show selected page
    if (page === 'subnet') {
        document.getElementById('subnetPage').classList.add('active');
        document.querySelector('.nav-btn[data-page="subnet"]').classList.add('active');
    } else if (page === 'metagraph') {
        document.getElementById('metagraphPage').classList.add('active');
        document.querySelector('.nav-btn[data-page="metagraph"]').classList.add('active');
        // Load metagraph data if not loaded
        if (metagraphMinersData.length === 0) {
            fetchMetagraphViewData();
        }
    }
}

// Navigation event listeners
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const page = e.target.getAttribute('data-page');
        switchPage(page);
    });
});

// Subnet view event listeners
document.getElementById('refreshBtn').addEventListener('click', () => {
    const selectedNetuid = document.getElementById('subnetSelect').value;
    fetchMetagraphData(selectedNetuid);
    fetchAlphaPrice();
});

document.getElementById('subnetSelect').addEventListener('change', (e) => {
    const selectedNetuid = e.target.value;
    fetchMetagraphData(selectedNetuid);
});

document.getElementById('searchInput').addEventListener('input', () => {
    renderMinersTable();
});

document.getElementById('sortSelect').addEventListener('change', (e) => {
    sortBy = e.target.value;
    sortDirection = 'desc'; // Default to descending for dropdown
    updateSortIndicators();
    renderMinersTable();
});

// Metagraph view event listeners
document.getElementById('metagraphRefreshBtn').addEventListener('click', () => {
    fetchMetagraphViewData();
    fetchAlphaPrice();
});

document.getElementById('metagraphSearchInput').addEventListener('input', () => {
    renderMetagraphTable();
});

document.getElementById('metagraphSortSelect').addEventListener('change', (e) => {
    metagraphSortBy = e.target.value;
    metagraphSortDirection = 'desc';
    updateMetagraphSortIndicators();
    renderMetagraphTable();
});

// Fetch metagraph view data (all subnets)
async function fetchMetagraphViewData() {
    try {
        const response = await fetch('/api/metagraph?netuid=all');
        const data = await response.json();
        
        if (data.success) {
            updateMetagraphStats(data);
            metagraphMinersData = data.miners || [];
            metagraphColdkeyIncentivesData = data.coldkey_incentives || [];
            renderMetagraphTable();
            updateMetagraphCharts();
            setupMetagraphTableHeaderSorting();
            updateMetagraphSortIndicators();
            
            const sourceText = data.source === 'csv' ? ' (from CSV)' : '';
            const lastUpdatedEl = document.getElementById('lastUpdated');
            if (lastUpdatedEl) {
                lastUpdatedEl.textContent = 
                    `Last updated: ${new Date(data.timestamp).toLocaleString()}${sourceText}`;
            }
        } else {
            console.error('Error fetching metagraph view:', data.error);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Update metagraph stats
function updateMetagraphStats(data) {
    document.getElementById('metagraphBurnPercentile').textContent = formatPercent(data.burn_percentile);
    document.getElementById('metagraphTotalMiners').textContent = data.total_miners || 0;
    document.getElementById('metagraphTotalStake').textContent = formatNumber(data.total_stake);
    document.getElementById('metagraphTotalSubnets').textContent = data.total_subnets || 0;
    const priceEl = document.getElementById('metagraphAlphaPrice');
    if (priceEl) {
        const alphaPriceEl = document.getElementById('alphaPrice');
        if (alphaPriceEl && alphaPriceEl.textContent !== '--') {
            priceEl.textContent = alphaPriceEl.textContent;
        }
    }
}

// Render metagraph table
function renderMetagraphTable() {
    const tbody = document.getElementById('metagraphTableBody');
    const searchTerm = document.getElementById('metagraphSearchInput').value.toLowerCase();
    
    // Filter miners
    let filteredMiners = metagraphMinersData.filter(miner => {
        if (!searchTerm) return true;
        return (
            miner.uid.toString().includes(searchTerm) ||
            (miner.netuid && miner.netuid.toString().includes(searchTerm)) ||
            miner.hotkey.toLowerCase().includes(searchTerm) ||
            miner.coldkey.toLowerCase().includes(searchTerm)
        );
    });
    
    // Sort miners
    filteredMiners.sort((a, b) => {
        let aVal, bVal;
        
        if (metagraphSortBy === 'uid' || metagraphSortBy === 'netuid') {
            aVal = a[metagraphSortBy];
            bVal = b[metagraphSortBy];
        } else if (metagraphSortBy === 'hotkey' || metagraphSortBy === 'coldkey') {
            aVal = (a[metagraphSortBy] || '').toLowerCase();
            bVal = (b[metagraphSortBy] || '').toLowerCase();
        } else if (metagraphSortBy === 'active') {
            aVal = a[metagraphSortBy] ? 1 : 0;
            bVal = b[metagraphSortBy] ? 1 : 0;
        } else {
            aVal = parseFloat(a[metagraphSortBy]) || 0;
            bVal = parseFloat(b[metagraphSortBy]) || 0;
        }
        
        if (aVal < bVal) return metagraphSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return metagraphSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    if (filteredMiners.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="loading">No miners found</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredMiners.map(miner => {
        const isValidator = parseFloat(miner.stake) > 10000;
        return `
        <tr class="${isValidator ? 'validator-row' : ''}">
            <td>${miner.netuid || 'N/A'}</td>
            <td>${miner.uid}</td>
            <td>${formatNumber(miner.stake)}</td>
            <td class="hotkey-cell" title="${miner.hotkey}">${truncateAddress(miner.hotkey)}</td>
            <td class="coldkey-cell" title="${miner.coldkey}">${truncateAddress(miner.coldkey)}</td>

            <td class="percentile-cell ${getPercentileClass(miner.incentive)}">
                ${formatNumber(miner.incentive)}
            </td>

            <td>${formatNumber(miner.emission || 0)}</td>
            <td>${formatNumber(miner.daily_emission || 0)}</td>
            <td>
                <span class="status-badge">
                    ${miner.axon}
                </span>
            </td>
        </tr>
    `;
    }).join('');
}

// Update metagraph charts
function updateMetagraphCharts() {
    if (metagraphMinersData.length === 0) return;
    
    const colors = {
        stake: ['#28a745', '#ffc107', '#fd7e14', '#dc3545'],
        rank: ['#17a2b8', '#6f42c1', '#e83e8c', '#20c997'],
        trust: ['#007bff', '#6610f2', '#6f42c1', '#e83e8c'],
        incentive: ['#20c997', '#17a2b8', '#ffc107', '#fd7e14']
    };
    
    createMetagraphChart('metagraphStakeChart', 'stake', colors.stake);
    createMetagraphColdkeyIncentiveChart();
}

// Create metagraph chart
function createMetagraphChart(canvasId, field, colors) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    const chartType = canvasId.replace('metagraph', '').replace('Chart', '');
    
    if (metagraphCharts[chartType]) {
        metagraphCharts[chartType].destroy();
    }
    
    const ranges = calculateDistribution(metagraphMinersData, field);
    
    metagraphCharts[chartType] = new Chart(ctx, {
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
                        font: { size: 12 }
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

// Create metagraph coldkey incentive chart
function createMetagraphColdkeyIncentiveChart() {
    const ctx = document.getElementById('metagraphColdkeyIncentiveChart');
    if (!ctx || metagraphColdkeyIncentivesData.length === 0) return;
    
    if (metagraphCharts.coldkeyIncentive) {
        metagraphCharts.coldkeyIncentive.destroy();
    }
    
    const ranges = {
        '0-25%': 0,
        '25-50%': 0,
        '50-75%': 0,
        '75-100%': 0
    };
    
    metagraphColdkeyIncentivesData.forEach(coldkey => {
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
    
    metagraphCharts.coldkeyIncentive = new Chart(ctx, {
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
                        font: { size: 12 }
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

// Setup metagraph table header sorting
function setupMetagraphTableHeaderSorting() {
    const headers = document.querySelectorAll('#metagraphTable thead th');
    headers.forEach((header, index) => {
        const columnMap = {
            0: 'netuid',
            1: 'stake',
            2: 'uid',
            3: 'hotkey',
            4: 'coldkey',
            5: 'incentive'  ,
            6: 'emission',
            7: 'daily_emission',
            8: 'axon',
        };
        
        const fieldName = columnMap[index];
        if (fieldName) {
            header.style.cursor = 'pointer';
            header.classList.add('sortable');
            
            header.addEventListener('click', () => {
                if (metagraphSortBy === fieldName) {
                    metagraphSortDirection = metagraphSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    metagraphSortBy = fieldName;
                    metagraphSortDirection = 'desc';
                }
                
                updateMetagraphSortIndicators();
                renderMetagraphTable();
            });
        }
    });
}

// Update metagraph sort indicators
function updateMetagraphSortIndicators() {
    const headers = document.querySelectorAll('#metagraphTable thead th');
    const columnMap = {
        0: 'netuid',
        1: 'stake',
        2: 'uid',
        3: 'hotkey',
        4: 'coldkey',
        5: 'incentive'  ,
        6: 'emission',
        7: 'daily_emission',
        8: 'axon',
    };
    
    headers.forEach((header, index) => {
        const fieldName = columnMap[index];
        header.classList.remove('sort-asc', 'sort-desc');
        
        if (fieldName === metagraphSortBy) {
            header.classList.add(metagraphSortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// Initial load
fetchSubnets().then(() => {
    // Set default to subnet 0 if it exists, otherwise "all"
    const subnetSelect = document.getElementById('subnetSelect');
    const subnet0Option = subnetSelect.querySelector('option[value="0"]');
    if (subnet0Option) {
        subnetSelect.value = '0';
        fetchMetagraphData('0');
    } else {
        subnetSelect.value = 'all';
        fetchMetagraphData('all');
    }
});
fetchAlphaPrice();

// Auto-refresh every 60 seconds
setInterval(() => {
    const selectedNetuid = document.getElementById('subnetSelect').value;
    fetchMetagraphData(selectedNetuid);
    fetchAlphaPrice();
    
    // Refresh metagraph view if it's active
    if (document.getElementById('metagraphPage').classList.contains('active')) {
        fetchMetagraphViewData();
    }
}, 60000);

