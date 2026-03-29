import { initFirebase } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

let firebase = null;

document.addEventListener('DOMContentLoaded', async () => {
    firebase = await initFirebase();

    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('id');

    if (!reportId) {
        showError("Invalid Link", "No report ID provided in the URL.");
        return;
    }

    try {
        const docRef = doc(firebase.db, "sharedReports", reportId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            showError("Link Expired or Invalid", "This shared report might have expired after 48 hours, or the link is incorrect.");
            return;
        }

        const data = docSnap.data();
        
        // Log the view seamlessly
        try {
            const functions = getFunctions(firebase.app);
            const logView = httpsCallable(functions, 'logSharedReportView');
            logView({ shareId: reportId }).catch(console.error); // don't block render
        } catch (e) {
            console.error("View log failed", e);
        }

        renderReport(data);

    } catch (error) {
        console.error("Error fetching report:", error);
        showError("Access Denied", "This report is either expired or you don't have permission to view it.");
    }
});

function showError(title, desc) {
    document.getElementById('loadingState').style.display = 'none';
    const errUI = document.getElementById('errorState');
    document.getElementById('errorTitle').textContent = title;
    document.getElementById('errorDesc').textContent = desc;
    errUI.style.display = 'block';
}

function parseTimestamp(ts) {
    if (!ts) return 0;
    const parts = ts.split(':').map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
}

function renderReport(report) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('reportContent').style.display = 'block';

    const titleEl = document.getElementById('reportTitle');
    const metaEl = document.getElementById('reportMeta');
    const content = document.getElementById('analysisContent');

    titleEl.textContent = report.label || 'Full Analysis';
    metaEl.innerHTML = `<strong>${report.ownerName || 'Goalkeeper'}</strong>${report.gameDate ? ` &bull; ${report.gameDate}` : ''}`;
    
    if (report.myTeam && report.opponent) {
        metaEl.innerHTML += `<br><span style="color:#aaa; font-size:12px;">${report.myTeam} vs ${report.opponent}</span>`;
    }

    const a = report.analysis;
    if (!a) {
        content.innerHTML = `<p class="muted-text">Analysis data is incomplete.</p>`;
        return;
    }

    const statsRow = a.stats ? `
    <div class="report-stats-row modal-stats" style="margin-bottom: 24px;">
        ${a.stats.saves !== undefined ? `<div class="stat-pill"><span class="stat-pill-val">${a.stats.saves}</span><span class="stat-pill-lbl">Saves</span></div>` : ''}
        ${a.stats.goalsConceded !== undefined ? `<div class="stat-pill"><span class="stat-pill-val">${a.stats.goalsConceded}</span><span class="stat-pill-lbl">Goals Conceded</span></div>` : ''}
        ${a.stats.shotsOnTarget !== undefined ? `<div class="stat-pill"><span class="stat-pill-val">${a.stats.shotsOnTarget}</span><span class="stat-pill-lbl">Shots on Target</span></div>` : ''}
        ${a.stats.crossesClaimed !== undefined ? `<div class="stat-pill"><span class="stat-pill-val">${a.stats.crossesClaimed}</span><span class="stat-pill-lbl">Crosses Claimed</span></div>` : ''}
        ${a.stats.cleanSheet !== undefined ? `<div class="stat-pill ${a.stats.cleanSheet ? 'stat-pill--green' : ''}"><span class="stat-pill-val">${a.stats.cleanSheet ? '✓' : '✗'}</span><span class="stat-pill-lbl">Clean Sheet</span></div>` : ''}
    </div>` : '';

    const skills = a.skills || {};
    const skillBars = Object.entries(skills).map(([key, s]) => {
        const isNA = s.score === null || s.score === undefined || s.score === 'N/A';
        const pct = isNA ? 0 : s.score;
        const isLow = !isNA && pct < 60;
        return `
        <div class="skill-item ${isNA ? 'skill-na' : ''}" style="margin-bottom: 16px;">
            <div class="skill-header"><span>${key}</span><span>${isNA ? 'N/A' : pct + '%'}</span></div>
            ${isNA
                ? '<div class="progress-bar-bg"><div class="progress-bar-fill na-fill" style="width:100%"></div></div>'
                : `<div class="progress-bar-bg"><div class="progress-bar-fill ${isLow ? 'highlight-fill' : ''}" style="width:${pct}%"></div></div>`
            }
            ${s.feedback ? `<p class="feedback-snippet">${s.feedback}</p>` : ''}
        </div>`;
    }).join('');

    const strengths = (a.strengths || []).map(s => `<li>✓ ${s}</li>`).join('');
    const areas     = (a.areasToImprove || []).map(s => `<li>↑ ${s}</li>`).join('');

    const highlightsHtml = (a.highlights || []).map((h) => {
        if (!h.timestamp) return '';
        const seconds = parseTimestamp(h.timestamp);
        return `
        <div class="highlight-item" style="display:flex; gap:12px; margin-bottom:12px; align-items:flex-start; background:rgba(255,255,255,0.05); padding:12px; border-radius:8px;">
            <button class="btn sm-btn outline-btn play-highlight-btn" data-time="${seconds}" style="padding: 4px 8px; font-size: 12px; white-space:nowrap;">▶ ${h.timestamp}</button>
            <div class="highlight-details" style="flex:1;">
                <strong style="display:block; font-size:14px; color:var(--text-primary); margin-bottom:4px;">${h.type || 'Review'}</strong>
                <p class="muted-text" style="font-size:13px; margin:0; line-height:1.4;">${h.description}</p>
            </div>
        </div>`;
    }).join('');
    
    const highlightsSection = highlightsHtml ? `<div class="highlights-section" style="margin-top:24px;"><h4 style="display:flex; align-items:center; gap:8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg> Coachable Moments</h4><div class="highlights-list">${highlightsHtml}</div></div>` : '';

    const videoUrl = report.videos && report.videos.length > 0 ? report.videos[0].url : null;
    const videoContainer = document.getElementById('highlightVideoContainer');
    const videoPlayer = document.getElementById('highlightVideoPlayer');
    
    if (videoUrl && highlightsHtml) {
        videoPlayer.src = videoUrl;
        
        let existingTabs = document.getElementById('reportVideoTabs');
        if (existingTabs) existingTabs.remove();
        
        if (report.videos && report.videos.length > 1) {
            let tabsHtml = `<div id="reportVideoTabs" style="display:flex; gap:8px; margin-bottom:12px;">`;
            report.videos.forEach((v, idx) => {
                const title = v.title || `Part ${idx + 1}`;
                tabsHtml += `<button class="btn sm-btn ${idx === 0 ? 'primary-btn' : 'outline-btn'} video-part-btn" data-url="${v.url}" style="flex:1;">${title}</button>`;
            });
            tabsHtml += `</div>`;
            videoPlayer.insertAdjacentHTML('beforebegin', tabsHtml);
            
            document.querySelectorAll('.video-part-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.video-part-btn').forEach(b => {
                        b.classList.remove('primary-btn');
                        b.classList.add('outline-btn');
                    });
                    const targetBtn = e.target;
                    targetBtn.classList.remove('outline-btn');
                    targetBtn.classList.add('primary-btn');
                    const wasPlaying = !videoPlayer.paused;
                    videoPlayer.src = targetBtn.getAttribute('data-url');
                    if (wasPlaying) videoPlayer.play().catch(err => console.error("Playback failed", err));
                });
            });
        }
        
        videoContainer.style.display = 'block';
    } else {
        videoPlayer.src = '';
        videoContainer.style.display = 'none';
    }

    content.innerHTML = `
        ${statsRow}
        ${a.score !== undefined ? `<div class="overall-rating"><h3>${a.score.overall}/100</h3><p class="muted-text">Overall AI Rating</p></div>` : ''}
        ${a.summary ? `<p class="analysis-summary" style="margin: 20px 0; font-size: 15px; line-height:1.6;">${a.summary}</p>` : ''}
        
        <div class="analysis-columns" style="display: flex; gap: 24px; margin-top: 24px;">
            <div style="flex:1;">
                <h4 style="margin-bottom:12px;">Top Strengths</h4>
                <ul class="clean-list">${strengths}</ul>
            </div>
            <div style="flex:1;">
                <h4 style="margin-bottom:12px;">Areas to Improve</h4>
                <ul class="clean-list">${areas}</ul>
            </div>
        </div>
        
        ${highlightsSection}
        
        <div class="skills-breakdown" style="margin-top:24px;">
            <h4 style="margin-bottom:16px;">Detailed Skills Breakdown</h4>
            ${skillBars}
        </div>
    `;

    // Attach click listeners for highlight timestamps
    document.querySelectorAll('.play-highlight-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const time = parseFloat(e.target.dataset.time);
            if (!isNaN(time) && videoPlayer) {
                videoPlayer.currentTime = time;
                videoPlayer.play().catch(err => console.error("Playback failed:", err));
                videoPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    });
}
