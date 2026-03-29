import { deleteDoc, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { clearSelectedFiles, cancelActiveUploads } from "./upload.js?v=3";

let pendingDeleteSessionId = null;
let pendingEditSessionId = null;
let currentAnalysisSessionId = null;

export function addModalListeners(currentUser, firebase) {
    // Upload modal
    document.getElementById('uploadVideoBtn').addEventListener('click', openUploadModal);
    document.getElementById('closeUploadModal').addEventListener('click', () => {
        cancelActiveUploads();
        closeUploadModal();
    });
    document.getElementById('cancelUploadBtn').addEventListener('click', () => {
        cancelActiveUploads();
        closeUploadModal();
    });
    document.getElementById('uploadModal').addEventListener('click', (e) => {
        // Block background-click dismissal while uploading
        const submitBtn = document.getElementById('submitUploadBtn');
        const isUploading = submitBtn && submitBtn.classList.contains('uploading-btn');
        if (!isUploading && e.target === document.getElementById('uploadModal')) closeUploadModal();
    });

    // Camera guide dismiss
    const dismissGuideBtn = document.getElementById('dismissGuideBtn');
    if (dismissGuideBtn) {
        dismissGuideBtn.addEventListener('click', () => {
            document.getElementById('uploadGuideBanner').style.display = 'none';
            localStorage.setItem('hasSeenCameraGuide', 'true');
        });
    }

    // Analysis modal
    document.getElementById('closeAnalysisModal').addEventListener('click', closeAnalysisModal);
    document.getElementById('analysisModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('analysisModal')) closeAnalysisModal();
    });
    
    // Share Report
    const shareBtn = document.getElementById('shareReportBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            if (!currentAnalysisSessionId) return;
            shareBtn.disabled = true;
            shareBtn.textContent = 'Creating link...';
            const statusTxt = document.getElementById('shareStatusText');
            statusTxt.style.display = 'none';
            statusTxt.textContent = '';
            
            try {
                const functions = getFunctions(firebase.app);
                const createShareLink = httpsCallable(functions, 'createShareLink');
                const res = await createShareLink({ sessionId: currentAnalysisSessionId });
                const shareUrl = window.location.origin + '/report.html?id=' + res.data.shareId;
                
                await navigator.clipboard.writeText(shareUrl);
                
                // Show toast
                const toast = document.getElementById('toastNotification');
                if (toast) {
                    toast.textContent = 'Shareable link copied to clipboard!';
                    toast.style.display = 'block';
                    setTimeout(() => { toast.style.display = 'none'; }, 3000);
                }
                
                statusTxt.textContent = 'Copied!';
                statusTxt.style.color = 'var(--accent-green)';
                statusTxt.style.display = 'inline';
            } catch (err) {
                console.error("Failed to create share link:", err);
                statusTxt.textContent = 'Failed to create link.';
                statusTxt.style.color = '#ef4444';
                statusTxt.style.display = 'inline';
            } finally {
                shareBtn.disabled = false;
                shareBtn.textContent = '🔗 Share';
            }
        });
    }

    // Delete modal
    document.getElementById('closeDeleteModal').addEventListener('click', closeDeleteModal);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('confirmDeleteBtn').addEventListener('click', () => confirmDelete(currentUser, firebase));
    document.getElementById('deleteModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('deleteModal')) closeDeleteModal();
    });

    // Edit modal
    document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
    document.getElementById('saveEditBtn').addEventListener('click', () => saveEdit(currentUser, firebase));
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('editModal')) closeEditModal();
    });

    // Settings modal
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => openSettingsModal(currentUser, firebase));
    }
    const closeSettings = document.getElementById('closeSettingsModal');
    if (closeSettings) closeSettings.addEventListener('click', closeSettingsModal);
    const cancelSettings = document.getElementById('cancelSettingsBtn');
    if (cancelSettings) cancelSettings.addEventListener('click', closeSettingsModal);
    const saveSettings = document.getElementById('saveSettingsBtn');
    if (saveSettings) saveSettings.addEventListener('click', () => saveSettingsForm(currentUser, firebase));
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) closeSettingsModal();
        });
    }
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

async function openSettingsModal(currentUser, firebase) {
    const { db } = firebase;
    const msg = document.getElementById('settingsStatusMsg');
    msg.textContent = 'Loading...';
    msg.style.color = 'var(--text-secondary)';
    document.getElementById('settingsModal').style.display = 'flex';
    
    try {
        const docSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('settingsAgeGroup').value = data.ageGroup || '';
        }
        msg.textContent = '';
    } catch (err) {
        console.error(err);
        msg.textContent = 'Failed to load settings.';
        msg.style.color = 'var(--danger,#e53e3e)';
    }
}

async function saveSettingsForm(currentUser, firebase) {
    const { db } = firebase;
    const ageGroup = document.getElementById('settingsAgeGroup').value;
    const msg = document.getElementById('settingsStatusMsg');
    const btn = document.getElementById('saveSettingsBtn');
    
    if (!ageGroup) {
        msg.textContent = 'Please select an age group.';
        msg.style.color = 'var(--warning,#fbbf24)';
        return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Saving...';
    msg.textContent = '';
    
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), { ageGroup });
        msg.textContent = 'Settings saved.';
        msg.style.color = 'var(--success,#10b981)';
        setTimeout(closeSettingsModal, 1000);
    } catch (err) {
        console.error(err);
        msg.textContent = 'Failed to save settings.';
        msg.style.color = 'var(--danger,#e53e3e)';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Settings';
    }
}


function openUploadModal() {
    clearSelectedFiles();
    document.getElementById('teamName').value = localStorage.getItem('kcLastTeam') || '';
    document.getElementById('opponentName').value = '';
    const today = new Date();
    document.getElementById('gameDate').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    document.getElementById('goalieNumber').value = localStorage.getItem('kcLastGoalieNumber') || '';
    const savedColor = localStorage.getItem('kcLastJerseyColor') || '';
    const colorSelect = document.getElementById('jerseyColor');
    colorSelect.value = savedColor;
    document.getElementById('fileList').style.display = 'none';
    document.getElementById('fileListItems').innerHTML = '';
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('uploadError').style.display = 'none';
    document.getElementById('submitUploadBtn').disabled = false;

    const guideBanner = document.getElementById('uploadGuideBanner');
    if (guideBanner) {
        if (localStorage.getItem('hasSeenCameraGuide') !== 'true') {
            guideBanner.style.display = 'block';
        } else {
            guideBanner.style.display = 'none';
        }
    }

    document.getElementById('uploadModal').style.display = 'flex';
}

function closeUploadModal() {
    document.getElementById('uploadModal').style.display = 'none';
    clearSelectedFiles();
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

export function openAnalysisModal(session) {
    currentAnalysisSessionId = session.id;
    const modal   = document.getElementById('analysisModal');
    const title   = document.getElementById('analysisTitle');
    const content = document.getElementById('analysisContent');
    const shareBtn = document.getElementById('shareReportBtn');
    const statusTxt = document.getElementById('shareStatusText');
    
    if (statusTxt) statusTxt.style.display = 'none';

    title.textContent = session.label || 'Full Analysis';

    if (!session.analysis) {
        if (shareBtn) shareBtn.style.display = 'none';
        const statusMsg = session.status === 'processing' || session.status === 'pending'
            ? `<div class="analyzing-state"><div class="analyzing-spinner"></div><p>Gemini is analyzing your footage…<br><span class="muted-text">This usually takes 1–3 minutes.</span></p></div>`
            : session.status === 'failed'
            ? `<div class="empty-state"><p>⚠ Analysis failed. Please re-upload the video.</p></div>`
            : `<div class="empty-state"><p>Analysis not ready yet. Check back soon!</p></div>`;
        content.innerHTML = statusMsg;
    } else {
        if (shareBtn) shareBtn.style.display = 'inline-block';
        const a = session.analysis;
        const date = session.createdAt
            ? new Date(session.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : '';

        const statsRow = a.stats ? `
        <div class="report-stats-row modal-stats">
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
            <div class="skill-item ${isNA ? 'skill-na' : ''}">
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

        const videoUrl = session.videos && session.videos.length > 0 ? session.videos[0].url : null;
        const videoContainer = document.getElementById('highlightVideoContainer');
        const videoPlayer = document.getElementById('highlightVideoPlayer');
        if (videoPlayer && videoContainer) {
            let existingTabs = document.getElementById('dashboardVideoTabs');
            if (existingTabs) existingTabs.remove();
            
            if (videoUrl && highlightsHtml) {
                videoPlayer.src = videoUrl;

                if (session.videos && session.videos.length > 1) {
                    let tabsHtml = `<div id="dashboardVideoTabs" style="display:flex; gap:8px; margin-bottom:12px;">`;
                    session.videos.forEach((v, idx) => {
                        const title = v.title || `Part ${idx + 1}`;
                        tabsHtml += `<button class="btn sm-btn ${idx === 0 ? 'primary-btn' : 'outline-btn'} dash-video-part-btn" data-url="${v.url}" style="flex:1;">${title}</button>`;
                    });
                    tabsHtml += `</div>`;
                    videoPlayer.insertAdjacentHTML('beforebegin', tabsHtml);
                    
                    document.querySelectorAll('.dash-video-part-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            document.querySelectorAll('.dash-video-part-btn').forEach(b => {
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
                
                videoContainer.style.display = 'none'; // Actually kept as none by default until highlight is clicked
            } else {
                videoPlayer.src = '';
                videoContainer.style.display = 'none';
            }
        }

        content.innerHTML = `
            <div class="analysis-header">
                <p class="muted-text">${date}</p>
                <div class="overall-badge">Overall: <strong>${a.overallRating ?? '—'}/10</strong></div>
            </div>
            ${a.summary ? `<p class="analysis-summary">${a.summary}</p>` : ''}
            ${statsRow}
            ${highlightsSection}
            <div class="skill-bars">${skillBars}</div>
            ${strengths ? `<div class="strengths-section"><h4>✦ Strengths</h4><ul>${strengths}</ul></div>` : ''}
            ${areas ? `<div class="areas-section"><h4>↑ Areas to Develop</h4><ul>${areas}</ul></div>` : ''}
            ${a.coachNote ? `<div class="coach-note"><h4>Coach's Note</h4><p>${a.coachNote}</p></div>` : ''}`;
            
        // Attach event listeners to playback buttons
        const jumpBtns = content.querySelectorAll('.play-highlight-btn');
        jumpBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                 const t = btn.getAttribute('data-time');
                 if (videoPlayer && videoPlayer.src) {
                     videoContainer.style.display = 'block';
                     videoPlayer.currentTime = parseFloat(t);
                     videoPlayer.play().catch(e => console.error("Playback failed", e));
                     // Smooth scroll to video player
                     videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                 }
            });
        });
    }

    modal.style.display = 'flex';
}

function closeAnalysisModal() {
    document.getElementById('analysisModal').style.display = 'none';
    const videoPlayer = document.getElementById('highlightVideoPlayer');
    if (videoPlayer) {
        videoPlayer.pause();
    }
    const videoContainer = document.getElementById('highlightVideoContainer');
    if (videoContainer) videoContainer.style.display = 'none';
}

export function openDeleteModal(session) {
    pendingDeleteSessionId = session.id;
    const labelEl = document.getElementById('deleteSessionLabel');
    labelEl.textContent = session.label || 'Match Session';
    document.getElementById('deleteModal').style.display = 'flex';
}

function closeDeleteModal() {
    pendingDeleteSessionId = null;
    document.getElementById('deleteModal').style.display = 'none';
    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = false;
    btn.textContent = 'Delete Everything';
}

async function confirmDelete(currentUser, firebase) {
    if (!pendingDeleteSessionId || !currentUser) return;

    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = true;
    btn.textContent = 'Deleting…';

    try {
        await deleteDoc(doc(firebase.db, 'users', currentUser.uid, 'sessions', pendingDeleteSessionId));
        closeDeleteModal();
    } catch (err) {
        console.error('Delete failed:', err);
        btn.disabled = false;
        btn.textContent = 'Delete Everything';
        alert('Failed to delete. Please try again.');
    }
}

export function openEditModal(session) {
    pendingEditSessionId = session.id;
    document.getElementById('editTeamName').value    = session.myTeam   || '';
    document.getElementById('editOpponentName').value = session.opponent || '';
    document.getElementById('editGameDate').value     = session.gameDate || '';
    document.getElementById('editError').style.display = 'none';
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    pendingEditSessionId = null;
    document.getElementById('editModal').style.display = 'none';
}

async function saveEdit(currentUser, firebase) {
    if (!pendingEditSessionId || !currentUser) return;

    const myTeam   = document.getElementById('editTeamName').value.trim();
    const opponent = document.getElementById('editOpponentName').value.trim();
    const gameDate = document.getElementById('editGameDate').value;
    const errEl    = document.getElementById('editError');

    if (!myTeam || !opponent || !gameDate) {
        errEl.textContent = 'Please fill in all three fields.';
        errEl.style.display = 'block';
        return;
    }

    const dateLabel = new Date(gameDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const label = `${dateLabel} · ${myTeam} vs. ${opponent}`;

    const btn = document.getElementById('saveEditBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
        await updateDoc(doc(firebase.db, 'users', currentUser.uid, 'sessions', pendingEditSessionId), {
            myTeam, opponent, gameDate, label,
        });
        closeEditModal();
    } catch (err) {
        console.error('Edit failed:', err);
        errEl.textContent = 'Failed to save. Please try again.';
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    }
}
