export let chartInstance = null;
export let radarInstance = null;
let currentRange = '1m'; // '1m', '3m', 'all'

export function initTrendsChart() {
    const canvas = document.getElementById('trendsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Attach listeners to pill buttons
    document.querySelectorAll('.time-range-pills .pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.time-range-pills .pill-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentRange = e.target.getAttribute('data-range');
            
            // Re-render chart with cached sessions
            renderChart(window.lastSessionsForChart || []);
        });
    });

    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDarkMode ? '#e2e8f0' : '#1e293b';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Overall Rating',
                data: [],
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#22c55e',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#22c55e',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDarkMode ? '#1e293b' : '#fff',
                    titleColor: isDarkMode ? '#f8fafc' : '#0f172a',
                    bodyColor: isDarkMode ? '#cbd5e1' : '#475569',
                    borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return 'Rating: ' + context.parsed.y + '/10';
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 10,
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, maxRotation: 45, minRotation: 0 }
                }
            }
        }
    });
}

export function updateTrendsChart(sessions) {
    if (!sessions) return;
    
    window.lastSessionsForChart = sessions;
    renderChart(sessions);
}

function renderChart(sessions) {
    if (!chartInstance) return;

    // Filter to only sessions with a valid overallRating
    const validSessions = sessions.filter(s => s.status === 'ready' && s.analysis && s.analysis.overallRating);
    
    // Sort chronologically (oldest to newest)
    let sorted = validSessions.sort((a, b) => {
        const timeA = a.createdAt ? a.createdAt.seconds : 0;
        const timeB = b.createdAt ? b.createdAt.seconds : 0;
        return timeA - timeB;
    });

    // Apply time range filter
    const now = Math.floor(Date.now() / 1000);
    const ONE_MONTH = 30 * 24 * 60 * 60;
    const THREE_MONTHS = 90 * 24 * 60 * 60;

    if (currentRange === '1m') {
        sorted = sorted.filter(s => s.createdAt && (now - s.createdAt.seconds) <= ONE_MONTH);
    } else if (currentRange === '3m') {
        sorted = sorted.filter(s => s.createdAt && (now - s.createdAt.seconds) <= THREE_MONTHS);
    }

    const labels = sorted.map(s => {
        if (!s.createdAt) return 'Unknown';
        return new Date(s.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const dataPoints = sorted.map(s => Number(s.analysis.overallRating));

    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = dataPoints;
    chartInstance.update();
}

// ── Radar / Spider Chart ────────────────────────────────────

const RADAR_SKILL_ORDER = [
    'Distribution', 'Shot Stopping', 'Positioning', 'Cross Management', '1v1 Situations', 'Communication'
];

export function initRadarChart() {
    const canvas = document.getElementById('radarChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    radarInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: RADAR_SKILL_ORDER,
            datasets: [{
                label: 'Skills',
                data: [0, 0, 0, 0, 0, 0],
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderColor: '#10b981',
                borderWidth: 2,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#10b981',
                pointRadius: 4,
                pointHoverRadius: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900, easing: 'easeInOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f8fafc',
                    bodyColor: '#94a3b8',
                    borderColor: '#334155',
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => ` ${ctx.parsed.r}%`
                    }
                }
            },
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    beginAtZero: true,
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    angleLines: { color: 'rgba(255,255,255,0.08)' },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    ticks: {
                        stepSize: 25,
                        color: 'rgba(148,163,184,0.6)',
                        backdropColor: 'transparent',
                        font: { size: 10 },
                        callback: (v) => v === 0 ? '' : v
                    },
                    pointLabels: {
                        color: '#e2e8f0',
                        font: { size: 11, weight: '600' }
                    }
                }
            }
        }
    });
}

export function updateRadarChart(analysis) {
    if (!radarInstance) return;

    const skills = analysis?.skills || {};
    const data = RADAR_SKILL_ORDER.map(key => {
        // Try exact match then case-insensitive fuzzy match
        const val = skills[key]?.score ?? Object.entries(skills).find(
            ([k]) => k.toLowerCase().includes(key.split(' ')[0].toLowerCase())
        )?.[1]?.score;
        const n = Number(val);
        return (isNaN(n) || val === null || val === undefined || val === 'N/A') ? 0 : n;
    });

    radarInstance.data.datasets[0].data = data;
    radarInstance.update();

    // Show/hide the empty-state overlay
    const overlay = document.getElementById('radarEmptyState');
    const hasData = data.some(v => v > 0);
    if (overlay) overlay.style.display = hasData ? 'none' : 'flex';
}
