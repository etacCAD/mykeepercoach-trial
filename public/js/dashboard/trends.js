export let chartInstance = null;
export let radarInstance = null;
let currentRange = '1m'; // '1m', '3m', 'all'

const RADAR_SKILL_ORDER = [
    'Distribution', 'Shot Stopping', 'Positioning', 'Cross Management', '1v1 Situations', 'Communication'
];

const SKILL_COLORS = {
    'Distribution': '#3b82f6',     // Blue
    'Shot Stopping': '#ef4444',    // Red
    'Positioning': '#f59e0b',      // Amber
    'Cross Management': '#8b5cf6', // Purple
    '1v1 Situations': '#ec4899',   // Pink
    'Communication': '#14b8a6'     // Teal
};

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

    const textColor = 'rgba(255,255,255,0.85)';
    const gridColor = 'rgba(255,255,255,0.08)';

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: RADAR_SKILL_ORDER.map(skill => ({
                label: skill,
                data: [],
                borderColor: SKILL_COLORS[skill],
                backgroundColor: (context) => {
                    const chart = context.chart;
                    const { ctx: c, chartArea } = chart;
                    if (!chartArea) return 'transparent';
                    const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    const hex = SKILL_COLORS[skill];
                    gradient.addColorStop(0, hex + '28');
                    gradient.addColorStop(1, hex + '00');
                    return gradient;
                },
                borderWidth: 2.5,
                pointBackgroundColor: [],
                pointBorderColor: [],
                pointBorderWidth: 2,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: SKILL_COLORS[skill],
                pointRadius: 3,
                pointHoverRadius: 5,
                fill: true,
                tension: 0.4
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: false  // using custom HTML legend
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            if (context.parsed.y === 50 && context.dataset.pointBackgroundColor[context.dataIndex] === 'rgba(148, 163, 184, 0.3)') {
                                return context.dataset.label + ': Unrated (N/A)';
                            }
                            return context.dataset.label + ': ' + context.parsed.y + '/100';
                        }
                    }
                }
            },
            layout: {
                padding: { top: 4, bottom: 2 }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(255,255,255,0.06)', drawBorder: false },
                    border: { display: false },
                    ticks: { 
                        color: 'rgba(255,255,255,0.45)',
                        font: { size: 10, family: "'Inter', sans-serif" },
                        stepSize: 25,
                        callback: v => v === 0 ? '' : v
                    }
                },
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: { 
                        color: 'rgba(255,255,255,0.6)', 
                        font: { size: 11, family: "'Inter', sans-serif" },
                        maxRotation: 0, 
                        minRotation: 0 
                    }
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

    // Filter to only sessions that have skills analysis in ready status
    const validSessions = sessions.filter(s => s.status === 'ready' && s.analysis && s.analysis.skills);
    
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

    chartInstance.data.labels = labels;

    RADAR_SKILL_ORDER.forEach((skill, idx) => {
        const dataPoints = [];
        const pointBg = [];
        const pointBorder = [];

        sorted.forEach(s => {
            const skills = s.analysis.skills || {};
            const val = skills[skill]?.score ?? Object.entries(skills).find(
                ([k]) => k.toLowerCase().includes(skill.split(' ')[0].toLowerCase())
            )?.[1]?.score;
            
            const n = Number(val);
            if (isNaN(n) || val === null || val === undefined || val === 'N/A') {
                dataPoints.push(50);
                pointBg.push('rgba(148, 163, 184, 0.3)'); // faded slate
                pointBorder.push('rgba(148, 163, 184, 0.5)');
            } else {
                dataPoints.push(n);
                pointBg.push(SKILL_COLORS[skill]);
                pointBorder.push('#fff');
            }
        });

        chartInstance.data.datasets[idx].data = dataPoints;
        chartInstance.data.datasets[idx].pointBackgroundColor = pointBg;
        chartInstance.data.datasets[idx].pointBorderColor = pointBorder;
    });

    chartInstance.update();
}

// ── Radar / Spider Chart ────────────────────────────────────

export function initRadarChart() {
    const canvas = document.getElementById('radarChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    radarInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: RADAR_SKILL_ORDER,
            datasets: [
                {
                    label: 'Current Period',
                    data: [0, 0, 0, 0, 0, 0],
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderColor: '#10b981',
                    borderWidth: 2,
                    pointBackgroundColor: [],
                    pointBorderColor: [],
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#10b981',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                },
                {
                    label: 'Prior Period',
                    data: [0, 0, 0, 0, 0, 0],
                    backgroundColor: 'rgba(148, 163, 184, 0.1)',
                    borderColor: 'rgba(148, 163, 184, 0.6)',
                    borderWidth: 2,
                    borderDash: [4, 4],
                    pointBackgroundColor: [],
                    pointBorderColor: [],
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#94a3b8',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    hidden: true // Hidden by default if no comparison is available
                }
            ]
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
                        label: (ctx) => {
                            if (ctx.parsed.r === 50 && ctx.dataset.pointBackgroundColor[ctx.dataIndex] === 'rgba(148, 163, 184, 0.3)') {
                                return ` ${ctx.dataset.label}: Unrated (N/A)`;
                            }
                            return ` ${ctx.dataset.label}: ${ctx.parsed.r}%`;
                        }
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
                        color: 'rgba(255,255,255,0.9)',
                        font: { size: 13, weight: '600', family: "'Inter', sans-serif" }
                    }
                }
            }
        }
    });
}

export function updateRadarChart(primarySkills, priorSkills = null) {
    if (!radarInstance) return;

    let hasData = false;

    // Helper to generate chart data for a given skills object
    const buildDataset = (skills, datasetIndex, activeColor) => {
        const data = [];
        const pointBg = [];
        const pointBorder = [];

        RADAR_SKILL_ORDER.forEach(key => {
            const val = skills?.[key]?.score ?? Object.entries(skills || {}).find(
                ([k]) => k.toLowerCase().includes(key.split(' ')[0].toLowerCase())
            )?.[1]?.score;
            
            const n = Number(val);
            if (isNaN(n) || val === null || val === undefined || val === 'N/A') {
                data.push(50);
                pointBg.push('rgba(148, 163, 184, 0.3)');
                pointBorder.push('rgba(148, 163, 184, 0.5)');
            } else {
                data.push(n);
                pointBg.push(activeColor);
                pointBorder.push('#fff');
                if (datasetIndex === 0) hasData = true; // Only care about primary data for empty state
            }
        });

        radarInstance.data.datasets[datasetIndex].data = data;
        radarInstance.data.datasets[datasetIndex].pointBackgroundColor = pointBg;
        radarInstance.data.datasets[datasetIndex].pointBorderColor = pointBorder;
    };

    // Primary dataset (Green)
    buildDataset(primarySkills || {}, 0, '#10b981');

    // Prior dataset (Slate)
    if (priorSkills && Object.keys(priorSkills).length > 0) {
        buildDataset(priorSkills, 1, '#94a3b8');
        radarInstance.data.datasets[1].hidden = false;
    } else {
        radarInstance.data.datasets[1].hidden = true;
    }

    radarInstance.update();

    // Show/hide the empty-state overlay based on primary data
    const overlay = document.getElementById('radarEmptyState');
    if (overlay) overlay.style.display = hasData ? 'none' : 'flex';
}
