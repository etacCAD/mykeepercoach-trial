import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { openAnalysisModal, openEditModal, openDeleteModal } from "./modals.js";
import { reAnalyze } from "./analysis.js?v=5";
import { updateTrendsChart, updateRadarChart } from "./trends.js";

let sessionsUnsubscribe = null;
export let selectMode = false;
export let selectedSessions = new Set();

// In-memory session cache for incremental updates
let cachedSessions = [];
let cachedCurrentUser = null;
let cachedFirebase = null;
let cachedUserProfile = null;
let isFirstSnapshot = true;

let currentRadarContext = '4w';

document.getElementById('radarContextSelect')?.addEventListener('change', (e) => {
    currentRadarContext = e.target.value;
    
    // Cleanup temporary specific-match options if they are no longer selected
    Array.from(e.target.options).forEach(opt => {
        if (opt.className === 'temp-match-opt' && !opt.selected) {
            opt.remove();
        }
    });

    updateSummaryWidgets(cachedSessions, cachedUserProfile);
});

function getPeriodsForContext(allSessions, contextStr) {
    const readySessions = allSessions.filter(s => s.status === 'ready' && s.analysis && s.analysis.skills);
    const sorted = [...readySessions].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    let primary = [], prior = [], subtitle = "Average vs Prior Period";
    const nowSecs = Math.floor(Date.now() / 1000);
    const DAY = 24 * 60 * 60;

    if (contextStr === 'latest') {
        primary = sorted.slice(0, 1);
        subtitle = "Latest Match Only";
    } else if (contextStr === 'all') {
        primary = sorted;
        subtitle = "Average All Time";
    } else if (contextStr === 'm3') {
        primary = sorted.slice(0, 3);
        prior = sorted.slice(3, 6);
        subtitle = "Past 3 Matches vs Prior 3";
    } else if (contextStr === 'm5') {
        primary = sorted.slice(0, 5);
        prior = sorted.slice(5, 10);
        subtitle = "Past 5 Matches vs Prior 5";
    } else if (contextStr === 'm10') {
        primary = sorted.slice(0, 10);
        prior = sorted.slice(10, 20);
        subtitle = "Past 10 Matches vs Prior 10";
    } else if (contextStr === 'm20') {
        primary = sorted.slice(0, 20);
        prior = sorted.slice(20, 40);
        subtitle = "Past 20 Matches vs Prior 20";
    } else if (contextStr === 'm50') {
        primary = sorted.slice(0, 50);
        prior = sorted.slice(50, 100);
        subtitle = "Past 50 Matches vs Prior 50";
    } else if (contextStr.endsWith('m')) { // 3m, 6m
        const months = parseInt(contextStr);
        const threshold = nowSecs - (months * 30 * DAY);
        const priorThreshold = threshold - (months * 30 * DAY);
        primary = sorted.filter(s => s.createdAt?.seconds >= threshold);
        prior = sorted.filter(s => s.createdAt?.seconds >= priorThreshold && s.createdAt?.seconds < threshold);
        subtitle = `Average vs Prior ${months} Months`;
    } else if (contextStr === '4w') {
        const threshold = nowSecs - (28 * DAY);
        const priorThreshold = threshold - (28 * DAY);
        primary = sorted.filter(s => s.createdAt?.seconds >= threshold);
        prior = sorted.filter(s => s.createdAt?.seconds >= priorThreshold && s.createdAt?.seconds < threshold);
        subtitle = "Average vs Prior 4 Weeks";
    } else {
        primary = sorted.filter(s => s.id === contextStr);
        subtitle = "Specific Match View";
    }
    return { primary, prior, subtitle };
}

function computeAverageStats(sessionsList) {
    if (!sessionsList || sessionsList.length === 0) return null;
    if (sessionsList.length === 1) return sessionsList[0].analysis;
    
    let sumRating = 0, countRating = 0;
    const skillSums = {}, skillCounts = {};
    
    sessionsList.forEach(s => {
        const an = s.analysis;
        if (an.overallRating) {
            const r = Number(an.overallRating);
            if (!isNaN(r)) { sumRating += r; countRating++; }
        }
        if (an.skills) {
            Object.entries(an.skills).forEach(([k, obj]) => {
                const sc = Number(obj?.score);
                if (!isNaN(sc)) {
                    skillSums[k] = (skillSums[k] || 0) + sc;
                    skillCounts[k] = (skillCounts[k] || 0) + 1;
                }
            });
        }
    });

    const avgAnalysis = {
        overallRating: countRating > 0 ? (sumRating / countRating).toFixed(1) : null,
        skills: {}
    };

    Object.keys(skillSums).forEach(k => {
        avgAnalysis.skills[k] = { score: Math.round(skillSums[k] / skillCounts[k]) };
    });
    return avgAnalysis;
}

export function startSessionListener(currentUser, firebase, userProfile) {
    if (sessionsUnsubscribe) sessionsUnsubscribe();
    
    cachedCurrentUser = currentUser;
    cachedFirebase = firebase;
    cachedUserProfile = userProfile;
    isFirstSnapshot = true;
    cachedSessions = [];

    const sessionsRef = collection(firebase.db, 'users', currentUser.uid, 'sessions');
    const q = query(sessionsRef, orderBy('createdAt', 'desc'));

    sessionsUnsubscribe = onSnapshot(q, (snapshot) => {
        if (isFirstSnapshot) {
            // First load: build full session list and render everything
            cachedSessions = [];
            snapshot.forEach(d => cachedSessions.push({ id: d.id, ...d.data() }));
            renderDashboard(cachedSessions, currentUser, firebase, userProfile);
            isFirstSnapshot = false;
        } else {
            // Incremental update: only process changes
            const changes = snapshot.docChanges();
            if (changes.length === 0) return;

            let needsFullRebuild = false;

            for (const change of changes) {
                const sessionData = { id: change.doc.id, ...change.doc.data() };

                if (change.type === 'added') {
                    // New session — insert at correct position (desc order by createdAt)
                    cachedSessions.unshift(sessionData);
                    needsFullRebuild = true; // Simplest for additions
                } else if (change.type === 'modified') {
                    // Update in-memory cache
                    const idx = cachedSessions.findIndex(s => s.id === sessionData.id);
                    if (idx >= 0) {
                        cachedSessions[idx] = sessionData;
                        // Incremental card update (no full rebuild)
                        updateSingleCard(sessionData, currentUser, firebase);
                    } else {
                        needsFullRebuild = true;
                    }
                } else if (change.type === 'removed') {
                    cachedSessions = cachedSessions.filter(s => s.id !== sessionData.id);
                    // Remove card from DOM
                    const card = document.querySelector(`.video-card[data-session-id="${sessionData.id}"]`);
                    if (card) card.remove();
                }
            }

            if (needsFullRebuild) {
                renderDashboard(cachedSessions, currentUser, firebase, userProfile);
            } else {
                // Still update the report card and counts with latest data
                updateSummaryWidgets(cachedSessions, userProfile);
            }
        }
        updateTrendsChart(cachedSessions);
    });
}

/**
 * Update a single session card in-place without rebuilding the whole list.
 * This eliminates flicker when a session status changes (pending → processing → ready).
 */
function updateSingleCard(session, currentUser, firebase) {
    const existingCard = document.querySelector(`.video-card[data-session-id="${session.id}"]`);
    if (!existingCard) return;

    // Create a temp container to get the new card HTML
    const temp = document.createElement('div');
    temp.innerHTML = renderSessionCard(session);
    const newCard = temp.firstElementChild;

    // Replace the old card with the new one
    existingCard.replaceWith(newCard);

    // Re-attach listeners for just this card
    attachCardListeners(newCard, session, currentUser, firebase);
}

/**
 * Attach event listeners to a single card element.
 */
function attachCardListeners(card, session, currentUser, firebase) {
    const sessions = cachedSessions; // for lookup

    card.querySelectorAll('.view-analysis-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openAnalysisModal(session);
        });
    });

    card.querySelectorAll('.edit-session-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal(session);
        });
    });

    card.querySelectorAll('.delete-session-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteModal(session);
        });
    });

    card.querySelectorAll('.reanalyze-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await reAnalyze(currentUser, firebase, session.id, btn);
        });
    });

    card.querySelectorAll('.session-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) { selectedSessions.add(session.id); }
            else { selectedSessions.delete(session.id); }
            updateBulkBar();
        });
    });

    card.querySelectorAll('.view-radar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentRadarContext = session.id;
            
            const select = document.getElementById('radarContextSelect');
            if (select) {
                let existingOpt = select.querySelector(`option[value="${session.id}"]`);
                if (!existingOpt) {
                    existingOpt = document.createElement('option');
                    existingOpt.value = session.id;
                    existingOpt.textContent = `Specific Match: ${session.label || 'Selected'}`;
                    existingOpt.className = 'temp-match-opt';
                    select.appendChild(existingOpt);
                }
                select.value = session.id;
            }

            updateSummaryWidgets(cachedSessions, cachedUserProfile);

            // Switch to Overview tab
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            const overviewBtn = document.querySelector('.tab-btn[data-tab="overview"]');
            const overviewPane = document.getElementById('overview');
            if (overviewBtn) overviewBtn.classList.add('active');
            if (overviewPane) overviewPane.classList.add('active');
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

function updateSummaryWidgets(sessions, userProfile) {
    const sessionCountEl = document.getElementById('sessionCount');
    const overallRatingEl = document.getElementById('overallRating');
    const reportCardContent = document.getElementById('reportCardContent');
    const radarSubtitle = document.getElementById('radarSubtitle');

    sessionCountEl.textContent = sessions.length;

    const { primary, prior, subtitle } = getPeriodsForContext(sessions, currentRadarContext);
    
    if (radarSubtitle) radarSubtitle.textContent = subtitle;

    const primaryAvg = computeAverageStats(primary);
    const priorAvg = computeAverageStats(prior);

    if (primaryAvg) {
        const isYoungest = userProfile?.ageGroup === 'U8-U10';
        renderReportCard(primaryAvg, priorAvg, reportCardContent, isYoungest);
        updateRadarChart(primaryAvg.skills, priorAvg?.skills);
        
        if (primaryAvg.overallRating) {
            const val = Number(primaryAvg.overallRating);
            if (isYoungest && !isNaN(val)) {
                let stars = '★☆☆';
                if (val >= 8.5) stars = '★★★';
                else if (val >= 6.0) stars = '★★☆';
                overallRatingEl.innerHTML = `<span style="color: var(--accent-yellow, #fbbf24); font-size: 1.2em;">${stars}</span>`;
            } else {
                overallRatingEl.textContent = `${primaryAvg.overallRating}/10`;
            }
        } else {
            overallRatingEl.textContent = '—';
        }
    } else {
        reportCardContent.innerHTML = `<div class="empty-state"><p>No analysis data in this time period.</p></div>`;
        updateRadarChart(null, null);
        overallRatingEl.textContent = '—';
    }
}

function renderDashboard(sessions, currentUser, firebase, userProfile) {
    const videoList = document.getElementById('videoList');
    const reportCardContent = document.getElementById('reportCardContent');
    const sessionCountEl = document.getElementById('sessionCount');
    const overallRatingEl = document.getElementById('overallRating');

    sessionCountEl.textContent = sessions.length;

    if (sessions.length === 0) {
        videoList.innerHTML = `<div class="empty-state"><p>No videos uploaded yet. Upload a match video to get your first AI report!</p></div>`;
        reportCardContent.innerHTML = `<div class="empty-state"><p>No analysis yet. Upload a match video to get started!</p></div>`;
        overallRatingEl.textContent = '—';
        return;
    }

    // Video history list
    videoList.innerHTML = sessions.map(s => renderSessionCard(s)).join('');

    // Attach card button listeners
    sessions.forEach(session => {
        const card = videoList.querySelector(`.video-card[data-session-id="${session.id}"]`);
        if (card) attachCardListeners(card, session, currentUser, firebase);
    });

    // Update card visual state if already selected
    document.querySelectorAll('.video-card').forEach(card => {
        const sId = card.getAttribute('data-session-id');
        if (selectMode && selectedSessions.has(sId)) card.classList.add('card-selected');
    });

    const { primary, prior, subtitle } = getPeriodsForContext(sessions, currentRadarContext);
    
    const radarSubtitle = document.getElementById('radarSubtitle');
    if (radarSubtitle) radarSubtitle.textContent = subtitle;

    const primaryAvg = computeAverageStats(primary);
    const priorAvg = computeAverageStats(prior);

    if (primaryAvg) {
        const isYoungest = userProfile?.ageGroup === 'U8-U10';
        renderReportCard(primaryAvg, priorAvg, reportCardContent, isYoungest);
        updateRadarChart(primaryAvg.skills, priorAvg?.skills);
        
        if (primaryAvg.overallRating) {
            const val = Number(primaryAvg.overallRating);
            if (isYoungest && !isNaN(val)) {
                let stars = '★☆☆';
                if (val >= 8.5) stars = '★★★';
                else if (val >= 6.0) stars = '★★☆';
                overallRatingEl.innerHTML = `<span style="color: var(--accent-yellow, #fbbf24); font-size: 1.2em;">${stars}</span>`;
            } else {
                overallRatingEl.textContent = `${primaryAvg.overallRating}/10`;
            }
        } else {
            overallRatingEl.textContent = '—';
        }
    } else {
        reportCardContent.innerHTML = `<div class="empty-state"><p>No complete analysis yet. Check back after Gemini finishes processing your video!</p></div>`;
        updateRadarChart(null, null);
        overallRatingEl.textContent = '—';
    }
}

function renderSessionCard(s) {
    const date = s.createdAt
        ? new Date(s.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Just uploaded…';

    const rating = s.analysis?.overallRating
        ? `<span class="session-rating">${s.analysis.overallRating}/10</span>`
        : '';

    let statusBlock;
    if (s.status === 'ready') {
        statusBlock = `<button class="status-badge ready view-analysis-btn" data-session-id="${s.id}">✦ Analysis Ready</button>`;
    } else if (s.status === 'failed') {
        const errorMsg = s.errorMessage ? s.errorMessage.substring(0, 80) : 'Analysis failed';
        statusBlock = `
            <span class="status-badge failed">⚠ Analysis Failed</span>
            <button class="reanalyze-btn retry-btn" data-session-id="${s.id}" title="${errorMsg}">↻ Retry Analysis</button>
        `;
    } else {
        // Determine current step using errorMessage from the analysis pipeline (real-time)
        const uploadedAt = s.createdAt ? s.createdAt.seconds * 1000 : Date.now();
        const elapsedMin = Math.floor((Date.now() - uploadedAt) / 60000);
        const statusMsg = (s.errorMessage || '').toLowerCase();
        const videoCount = s.videos?.length || 1;

        // Scale ETA by video count: ~2 min base + 1 min per video
        const TOTAL_EST_MINS = 2 + videoCount;
        const remainingMin = Math.max(1, TOTAL_EST_MINS - elapsedMin);
        const dynamicEta = remainingMin <= 1 ? '< 1 min' : `~${remainingMin} min`;

        // Derive pipeline step from the real errorMessage written by analysis.js
        const isProcessing = s.status === 'processing';
        const isVerifying = statusMsg.includes('verifying');
        const isUploading = statusMsg.includes('uploading') || statusMsg.includes('downloading');
        const isAnalyzing = statusMsg.includes('analyzing') || statusMsg.includes('ai');
        const isOnServer = statusMsg.includes('processing video on ai');
        const isGenerating = isProcessing && elapsedMin >= TOTAL_EST_MINS - 1;

        const uploadedTime = s.createdAt
            ? new Date(s.createdAt.seconds * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : '';

        const steps = [
            { label: `Videos Uploaded${uploadedTime ? ' · ' + uploadedTime : ''}`, done: true, active: false, eta: null },
            { label: 'Queued for Analysis',     done: isProcessing,                                 active: s.status === 'pending', eta: dynamicEta },
            { label: 'Processing Video',        done: isProcessing && (isAnalyzing || isGenerating), active: isProcessing && (isVerifying || isUploading || isOnServer), eta: dynamicEta },
            { label: 'AI Analyzing Footage',    done: isGenerating,                                  active: isProcessing && isAnalyzing && !isGenerating, eta: dynamicEta },
            { label: 'Generating Your Report',  done: false,                                         active: isGenerating, eta: dynamicEta },
        ];

        // Find active step for the ETA label
        const activeStep = steps.find(st => st.active);
        const etaLabel = activeStep?.eta ? `<span class="step-eta">${activeStep.eta} remaining</span>` : '';

        const stepDots = steps.map((st, i) => {
            const cls = st.done ? 'step-dot step-done' : st.active ? 'step-dot step-active' : 'step-dot step-waiting';
            return `<div class="step-row">
                <div class="${cls}">${st.done ? '✓' : st.active ? '<span class="analyzing-dot"></span>' : ''}</div>
                <span class="step-label ${st.active ? 'step-label--active' : st.done ? 'step-label--done' : ''}">${st.label}</span>
            </div>`;
        }).join('');

        statusBlock = `<div class="pipeline-steps">${stepDots}${etaLabel ? `<div class="step-eta-row">${etaLabel}</div>` : ''}
            <button class="reanalyze-btn" data-session-id="${s.id}">↻ Re-analyze</button>
        </div>`;
    }

    return `
    <div class="video-card ${s.status === 'ready' ? 'video-card--ready' : ''} ${selectMode && selectedSessions.has(s.id) ? 'card-selected' : ''}" data-session-id="${s.id}">
        ${selectMode ? `<label class="card-checkbox-wrap">
            <input type="checkbox" class="session-checkbox" data-session-id="${s.id}" ${selectedSessions.has(s.id) ? 'checked' : ''}>
        </label>` : ''}
        <div class="video-thumbnail placeholder-thumb">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            ${rating}
        </div>
        <div class="video-info">
            <h4>${s.label || 'Match Session'}</h4>
            <p class="date">${date}</p>
            ${statusBlock}
        </div>
        ${!selectMode ? `<div class="video-card-actions">
            <button class="card-action-btn view-radar-btn" data-session-id="${s.id}" title="View on Radar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="12"/><line x1="22" y1="8.5" x2="12" y2="12"/><line x1="2" y1="8.5" x2="12" y2="12"/></svg>
            </button>
            <button class="card-action-btn edit-session-btn" data-session-id="${s.id}" title="Edit details">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="card-action-btn delete-session-btn" data-session-id="${s.id}" title="Delete analysis">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 0 0 1 1 1v2"/></svg>
            </button>
        </div>` : ''}
    </div>`;
}

function renderReportCard(primaryAnalysis, priorAnalysis, container, isYoungest) {
    const skills = primaryAnalysis.skills || {};
    const stats = primaryAnalysis.stats || {};
    const priorSkills = priorAnalysis?.skills || {};

    const skillBars = Object.entries(skills).map(([key, s]) => {
        const isNA = s.score === null || s.score === undefined || s.score === 'N/A';
        const pct = isNA ? 0 : Number(s.score);
        const isLow = !isNA && pct < 60;
        
        // Compute delta
        let deltaHtml = '';
        if (!isNA && priorSkills[key] && priorSkills[key].score) {
            const priorScore = Number(priorSkills[key].score);
            if (!isNaN(priorScore)) {
                const diff = pct - priorScore;
                if (diff > 0) {
                    deltaHtml = `<span style="color: #10b981; font-size: 0.8em; margin-left: 6px;">↑ +${diff}</span>`;
                } else if (diff < 0) {
                    deltaHtml = `<span style="color: #ef4444; font-size: 0.8em; margin-left: 6px;">↓ ${diff}</span>`;
                }
            }
        }
        
        let visualHtml = '';
        if (isNA) {
            visualHtml = '<div class="progress-bar-bg"><div class="progress-bar-fill na-fill" style="width:100%"></div></div>';
        } else if (isYoungest) {
            let stars = '★☆☆';
            if (pct >= 85) stars = '★★★';
            else if (pct >= 60) stars = '★★☆';
            visualHtml = `<div style="color: var(--accent-yellow, #fbbf24); font-size: 1.25rem; line-height: 1;">${stars}</div>`;
        } else {
            visualHtml = `<div class="progress-bar-bg"><div class="progress-bar-fill ${isLow ? 'highlight-fill' : ''}" style="width:${pct}%"></div></div>`;
        }
        
        return `
        <div class="skill-item ${isNA ? 'skill-na' : ''}">
            <div class="skill-header"><span>${key}</span><span>${isNA ? 'N/A' : (isYoungest ? '' : pct + '%')}${deltaHtml}</span></div>
            ${visualHtml}
            ${s.feedback ? `<p class="feedback-snippet">${s.feedback}</p>` : ''}
        </div>`;
    }).join('');

    const statsRow = Object.keys(stats).length > 0 ? `
    <div class="report-stats-row">
        ${stats.shotsOnTarget !== undefined ? `<div class="stat-pill"><span class="stat-pill-val">${stats.shotsOnTarget}</span><span class="stat-pill-lbl">Shots on Target</span></div>` : ''}
        ${stats.crossesClaimed !== undefined ? `<div class="stat-pill"><span class="stat-pill-val">${stats.crossesClaimed}</span><span class="stat-pill-lbl">Crosses Claimed</span></div>` : ''}
        ${stats.cleanSheet !== undefined ? `<div class="stat-pill ${stats.cleanSheet ? 'stat-pill--green' : ''}"><span class="stat-pill-val">${stats.cleanSheet ? '✓' : '✗'}</span><span class="stat-pill-lbl">Clean Sheet</span></div>` : ''}
    </div>` : '';

    container.innerHTML = `${statsRow}<div class="skill-bars">${skillBars}</div>`;
}

export function toggleSelectMode() {
    selectMode = !selectMode;
    if (!selectMode) {
        selectedSessions.clear();
        document.getElementById('bulkDeleteBar').style.display = 'none';
    }
    const btn = document.getElementById('toggleSelectBtn');
    btn.textContent = selectMode ? 'Done' : 'Select';
    btn.classList.toggle('select-mode-active', selectMode);

    document.querySelectorAll('.video-card').forEach(card => {
        card.classList.toggle('select-mode-card', selectMode);
        const actionsEl = card.querySelector('.video-card-actions');
        if (actionsEl) actionsEl.style.display = selectMode ? 'none' : '';

        const existingCb = card.querySelector('.card-checkbox-wrap');
        if (selectMode && !existingCb) {
            const sId = card.getAttribute('data-session-id');
            const wrap = document.createElement('label');
            wrap.className = 'card-checkbox-wrap';
            wrap.innerHTML = `<input type="checkbox" class="session-checkbox" data-session-id="${sId}" ${selectedSessions.has(sId) ? 'checked' : ''}>`;
            wrap.querySelector('input').addEventListener('change', (e) => {
                if (e.target.checked) { selectedSessions.add(sId); card.classList.add('card-selected'); }
                else { selectedSessions.delete(sId); card.classList.remove('card-selected'); }
                updateBulkBar();
            });
            card.insertBefore(wrap, card.firstChild);
        } else if (!selectMode && existingCb) {
            existingCb.remove();
            card.classList.remove('card-selected');
        }
    });
}

function updateBulkBar() {
    const bar = document.getElementById('bulkDeleteBar');
    const count = selectedSessions.size;
    bar.style.display = (selectMode && count > 0) ? 'flex' : 'none';
    document.getElementById('bulkCountLabel').textContent =
        `${count} session${count !== 1 ? 's' : ''} selected`;
}

export function selectAll() {
    document.querySelectorAll('.session-checkbox').forEach(cb => {
        cb.checked = true;
        selectedSessions.add(cb.getAttribute('data-session-id'));
        cb.closest('.video-card')?.classList.add('card-selected');
    });
    updateBulkBar();
}

export async function confirmBulkDelete(currentUser, firebase) {
    if (selectedSessions.size === 0 || !currentUser) return;
    const count = selectedSessions.size;
    const ok = confirm(`Delete ${count} session${count !== 1 ? 's' : ''}? This cannot be undone.`);
    if (!ok) return;

    const btn = document.getElementById('bulkDeleteBtn');
    btn.disabled = true;
    btn.textContent = `Deleting ${count}…`;

    try {
        await Promise.all(
            [...selectedSessions].map(sId =>
                deleteDoc(doc(firebase.db, 'users', currentUser.uid, 'sessions', sId))
            )
        );
        selectedSessions.clear();
        selectMode = false;
        document.getElementById('toggleSelectBtn').textContent = 'Select';
        document.getElementById('toggleSelectBtn').classList.remove('select-mode-active');
        document.getElementById('bulkDeleteBar').style.display = 'none';
    } catch (err) {
        console.error('Bulk delete failed:', err);
        alert('Some deletions failed. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Delete Selected';
    }
}
