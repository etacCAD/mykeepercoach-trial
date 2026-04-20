import { initFirebase } from "./firebase-config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, query, orderBy, doc, setDoc, serverTimestamp, getDoc, addDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const PROTECTED_EMAIL = 'evan@tacanni.com';

let functions;
let allLogEntries = [];   // flat list of { player, session } for the logs tab
let allReports = [];      // flat list of ready sessions with analysis
let allPromoCodes = [];   // flat list of promo codes
let allTedConversations = []; // flat list of chatbot interactions

// ── Tab System ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const { auth, db, storage } = await initFirebase();
    functions = getFunctions();

    // Auth Guard
    onAuthStateChanged(auth, user => {
        if (!user) window.location.href = '/';
    });

    // Tab switching
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });

    // Log filter buttons
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderLogFeed(document.getElementById('logSearch').value.trim());
        });
    });

    // Log search
    document.getElementById('logSearch').addEventListener('input', (e) => {
        renderLogFeed(e.target.value.trim());
    });

    const createUserForm = document.getElementById('createUserForm');
    const firstNameInput = document.getElementById('newPlayerFirstName');
    const lastNameInput = document.getElementById('newPlayerLastName');
    const emailInput = document.getElementById('newPlayerEmail');
    const ageGroupInput = document.getElementById('newPlayerAgeGroup');
    const passwordInput = document.getElementById('newPlayerAuth');
    const statusMsg = document.getElementById('adminStatusMsg');

    if (createUserForm) {
        createUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('createUserBtn');
            btn.disabled = true;
            statusMsg.style.display = 'block';
            statusMsg.textContent = "Creating player...";
            statusMsg.style.color = "var(--text-muted)";

            try {
                const adminCreateUser = httpsCallable(functions, 'adminCreateUser');
                const result = await adminCreateUser({
                    email: emailInput.value.trim(),
                    password: passwordInput.value,
                    displayName: `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`.trim(),
                    firstName: firstNameInput.value.trim(),
                    lastName: lastNameInput.value.trim(),
                    ageGroup: ageGroupInput.value || null
                });

                if (result.data.success) {
                    statusMsg.textContent = "✓ Player created successfully!";
                    statusMsg.style.color = "var(--accent)";
                    createUserForm.reset();
                    passwordInput.value = 'keeper2026';
                    await loadAll(db);
                }
            } catch (err) {
                statusMsg.textContent = "Error: " + (err.message || err);
                statusMsg.style.color = "var(--danger)";
            } finally {
                btn.disabled = false;
            }
        });
    }

    // ── Create Promo Code ──────────────────────────────────
    const createPromoForm = document.getElementById('createPromoForm');
    if (createPromoForm) {
        createPromoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('createPromoBtn');
            const codeInput = document.getElementById('newPromoCode');
            const limitInput = document.getElementById('newPromoLimit');
            const pStatusMsg = document.getElementById('promoStatusMsg');
            
            pStatusMsg.style.display = 'block';
            pStatusMsg.textContent = "Creating...";
            pStatusMsg.style.color = "var(--text-muted)";
            btn.disabled = true;

            try {
                const code = codeInput.value.trim().toUpperCase();
                const maxUses = parseInt(limitInput.value, 10);
                
                if (!code || maxUses < 1) throw new Error("Invalid input");

                // Check if code exists
                const codeRef = doc(db, 'promoCodes', code);
                const codeSnap = await getDoc(codeRef);
                if (codeSnap.exists()) {
                    throw new Error("Promo code already exists");
                }

                await setDoc(codeRef, {
                    code: code,
                    type: "profile_access",
                    maxUses: maxUses,
                    currentUses: 0,
                    expiresAt: null,
                    createdBy: auth.currentUser?.email || "admin",
                    isActive: true,
                    createdAt: serverTimestamp()
                });

                pStatusMsg.textContent = "✓ Promo code created!";
                pStatusMsg.style.color = "var(--accent)";
                createPromoForm.reset();
                limitInput.value = "10";
                await loadPromoCodes(db);
            } catch (err) {
                pStatusMsg.textContent = "Error: " + (err.message || err);
                pStatusMsg.style.color = "var(--danger)";
            } finally {
                btn.disabled = false;
            }
        });
    }

    // ── Load: Roster + Logs + Reports (all at once) ─────────
    async function loadAll(db) {
        allLogEntries = [];
        allReports = [];

        const rosterList = document.getElementById('rosterList');
        rosterList.innerHTML = '<div class="roster-item empty-state">Loading roster...</div>';

        try {
            const usersSnap = await getDocs(collection(db, 'users'));

            if (usersSnap.empty) {
                rosterList.innerHTML = '<div class="roster-item empty-state">No players found. Create one above!</div>';
                renderLogFeed('');
                renderReportList();
                return;
            }

            rosterList.innerHTML = '';
            const playerMap = {}; // uid → name/email

            // First pass: build roster UI and player map
            usersSnap.forEach(docSnap => {
                const player = { uid: docSnap.id, ...docSnap.data() };
                const name = player.displayName || player.email?.split('@')[0] || 'Unnamed';
                const isProtected = (player.email || '').toLowerCase() === PROTECTED_EMAIL.toLowerCase();
                playerMap[player.uid] = { name, email: player.email || '' };

                let trialBadge = '';
                if (player.trialExpiryDate) {
                    const expiry = new Date(player.trialExpiryDate.seconds * 1000);
                    const isExpired = new Date() > expiry;
                    const bClass = isExpired ? 'badge-failed' : 'badge-ready';
                    const bText = isExpired ? 'Trial Expired' : `Trial Active (${Math.ceil((expiry - new Date()) / (1000*60*60*24))}d)`;
                    trialBadge = `<span class="log-status-badge ${bClass}" style="margin-top: 4px; display:inline-block;">${bText}</span>`;
                }

                const item = document.createElement('div');
                item.className = 'roster-item';
                item.innerHTML = `
                    <div class="roster-player-info">
                        <span class="player-name">${name}</span>
                        <span class="player-email">${player.email || ''}</span>
                        ${trialBadge}
                    </div>
                    <div class="roster-actions">
                        <button class="btn sm-btn outline-btn edit-player-btn"
                            data-uid="${player.uid}"
                            data-name="${name}"
                            data-email="${player.email || ''}"
                            data-agegroup="${player.ageGroup || ''}">
                            ✎ Edit
                        </button>
                        <button class="btn sm-btn outline-btn btn-batch-load"
                            data-uid="${player.uid}"
                            data-name="${name}">
                            ⇪ Batch Load
                        </button>
                        ${isProtected ? '' : `<button class="btn sm-btn" style="background:var(--danger,#e53e3e);color:#fff;"
                            onclick="this.dispatchEvent(new CustomEvent('open-delete', {bubbles:true, detail:{uid:'${player.uid}', label:'${name} (${player.email || ''})'}}))" >
                            🗑 Delete
                        </button>`}
                        <a href="/dashboard?uid=${player.uid}" class="btn sm-btn primary-btn view-dash-btn" target="_blank">View →</a>
                    </div>
                `;
                rosterList.appendChild(item);
            });

            // Wire edit buttons
            document.querySelectorAll('.edit-player-btn').forEach(btn => {
                btn.addEventListener('click', () => openEditModal(btn.dataset));
            });
            document.querySelectorAll('.btn-batch-load').forEach(btn => {
                btn.addEventListener('click', () => openBatchModal(btn.dataset.uid, btn.dataset.name));
            });

            // Wire delete via custom event
            rosterList.addEventListener('open-delete', (e) => {
                openDeleteModal(e.detail.uid, e.detail.label);
            }, { once: false });

            // Second pass: load sessions for each user
            const sessionPromises = usersSnap.docs.map(async (docSnap) => {
                const uid = docSnap.id;
                const p = playerMap[uid];
                try {
                    const sessRef = collection(db, 'users', uid, 'sessions');
                    const sessQ = query(sessRef, orderBy('createdAt', 'desc'));
                    const sessSnap = await getDocs(sessQ);
                    sessSnap.forEach(sd => {
                        const session = { id: sd.id, ...sd.data() };
                        allLogEntries.push({ player: p, uid, session });
                        if (session.status === 'ready' && session.analysis) {
                            allReports.push({ player: p, uid, session });
                        }
                    });
                } catch (_) {
                    // skip if sub-collection read fails
                }
            });

            await Promise.all(sessionPromises);

            // Sort logs newest first
            allLogEntries.sort((a, b) => {
                const aTs = a.session.createdAt?.seconds ?? 0;
                const bTs = b.session.createdAt?.seconds ?? 0;
                return bTs - aTs;
            });
            allReports.sort((a, b) => {
                const aTs = a.session.createdAt?.seconds ?? 0;
                const bTs = b.session.createdAt?.seconds ?? 0;
                return bTs - aTs;
            });

            renderLogFeed('');
            renderReportList();

            // ── Load Ted Conversations
            try {
                allTedConversations = [];
                const tedRef = collection(db, 'tedConversations');
                const tedQ = query(tedRef, orderBy('timestamp', 'desc'));
                const tedSnap = await getDocs(tedQ);
                tedSnap.forEach(docSnap => {
                    allTedConversations.push({ id: docSnap.id, ...docSnap.data() });
                });
            } catch(e) { console.error("Ted load error:", e); }

            renderTedList();
            await loadPromoCodes(db);

        } catch (err) {
            console.error(err);
            rosterList.innerHTML = `<div class="roster-item empty-state" style="color:var(--danger)">Failed to load roster: ${err.message}</div>`;
        }
    }

    // ── Load: Promo Codes ──────────────────────────────────
    async function loadPromoCodes(db) {
        const promoList = document.getElementById('promoList');
        promoList.innerHTML = '<div class="roster-item empty-state">Loading promo codes...</div>';
        
        try {
            const promoQ = query(collection(db, 'promoCodes'), orderBy('createdAt', 'desc'));
            const promoSnap = await getDocs(promoQ);
            
            allPromoCodes = [];
            promoSnap.forEach(docSnap => {
                allPromoCodes.push({ id: docSnap.id, ...docSnap.data() });
            });
            
            renderPromoList();
        } catch (err) {
            console.error(err);
            promoList.innerHTML = `<div class="roster-item empty-state" style="color:var(--danger)">Failed to load promo codes: ${err.message}</div>`;
        }
    }

    function renderPromoList() {
        const list = document.getElementById('promoList');
        if (allPromoCodes.length === 0) {
            list.innerHTML = `<div class="roster-item empty-state">No promo codes active.</div>`;
            return;
        }

        list.innerHTML = allPromoCodes.map(promo => {
            const limitTxt = promo.maxUses ? `${promo.currentUses || 0} / ${promo.maxUses}` : (promo.currentUses || 0);
            const isExhausted = promo.maxUses && promo.currentUses >= promo.maxUses;
            let statusBadge = '';
            
            if (!promo.isActive) {
                statusBadge = `<span class="log-status-badge badge-failed" style="margin-left:auto;">Inactive</span>`;
            } else if (isExhausted) {
                statusBadge = `<span class="log-status-badge badge-failed" style="margin-left:auto;">Exhausted</span>`;
            } else {
                statusBadge = `<span class="log-status-badge badge-ready" style="margin-left:auto;">Active</span>`;
            }

            return `
            <div class="roster-item" style="display:flex; align-items:center; gap:1rem;">
                <div class="roster-player-info">
                    <span class="player-name">${promo.code}</span>
                    <span class="player-email">Uses: ${limitTxt}</span>
                </div>
                ${statusBadge}
            </div>`;
        }).join('');
    }

    // ── Render: Activity Logs ──────────────────────────────
    function renderLogFeed(searchTerm) {
        const feed = document.getElementById('logFeed');
        const activeFilter = document.querySelector('.log-filter-btn.active')?.dataset.filter || 'all';
        const term = searchTerm.toLowerCase();

        let entries = allLogEntries;

        // Status filter
        if (activeFilter !== 'all') {
            entries = entries.filter(e => e.session.status === activeFilter);
        }

        // Search filter
        if (term) {
            entries = entries.filter(e =>
                e.player.name.toLowerCase().includes(term) ||
                e.player.email.toLowerCase().includes(term) ||
                (e.session.label || '').toLowerCase().includes(term)
            );
        }

        if (entries.length === 0) {
            feed.innerHTML = `<div class="log-entry" style="color:var(--text-muted);font-size:0.85rem;grid-template-columns:1fr;">No matching log entries.</div>`;
            return;
        }

        feed.innerHTML = entries.map(e => {
            const { player, session } = e;
            const status = session.status || 'pending';
            const ts = session.createdAt
                ? new Date(session.createdAt.seconds * 1000).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                  })
                : 'Unknown time';

            const statusLabels = {
                ready: '✦ Analysis Ready',
                processing: '⟳ Processing',
                pending: '⏳ Queued',
                failed: '⚠ Failed',
            };

            return `
            <div class="log-entry">
                <div class="log-dot ${status}"></div>
                <div class="log-main">
                    <span class="log-label">${player.name} · ${session.label || 'Match Session'}</span>
                    <span class="log-meta">${player.email} · ${ts}</span>
                </div>
                <span class="log-status-badge badge-${status}">${statusLabels[status] || status}</span>
            </div>`;
        }).join('');
    }

    // ── Render: Report List ────────────────────────────────
    function renderReportList() {
        const list = document.getElementById('reportList');
        const detail = document.getElementById('reportDetail');

        if (allReports.length === 0) {
            list.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;">No completed reports yet.</div>`;
            detail.innerHTML = `<div class="empty-state" style="min-height:300px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:0.5rem;color:var(--text-muted);font-size:0.9rem;"><span style="font-size:2rem;">📊</span><p>No reports available yet.</p></div>`;
            return;
        }

        list.innerHTML = allReports.map((r, i) => {
            const { player, session } = r;
            const rating = session.analysis?.overallRating;
            const ts = session.createdAt
                ? new Date(session.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '';
            return `
            <div class="report-list-item" data-report-index="${i}">
                <div class="report-list-player">${player.name}</div>
                <div class="report-list-label">${session.label || 'Match Session'} · ${ts}</div>
                ${rating != null ? `<span class="report-list-rating">${rating}/10</span>` : ''}
            </div>`;
        }).join('');

        document.querySelectorAll('.report-list-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.report-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                renderReportDetail(allReports[parseInt(item.dataset.reportIndex)]);
                
                if (window.innerWidth <= 768) {
                    const detailEl = document.getElementById('reportDetail');
                    if(detailEl) {
                        detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            });
        });

        // Auto-select first
        document.querySelector('.report-list-item')?.click();
    }

    // ── Render: Report Detail ──────────────────────────────
    function renderReportDetail({ player, session }) {
        const detail = document.getElementById('reportDetail');
        const a = session.analysis || {};
        const date = session.createdAt
            ? new Date(session.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : '';

        const skills = a.skills || {};
        const skillBars = Object.entries(skills).map(([key, s]) => {
            const pct = s.score ?? 0;
            return `
            <div class="skill-item">
                <div class="skill-header"><span>${key}</span><span>${pct}%</span></div>
                <div class="progress-bar-bg"><div class="progress-bar-fill ${pct < 60 ? 'highlight-fill' : ''}" style="width:${pct}%"></div></div>
                ${s.feedback ? `<p class="feedback-snippet">${s.feedback}</p>` : ''}
            </div>`;
        }).join('');

        const stats = a.stats || {};
        const statsRow = Object.keys(stats).length > 0 ? `
        <div class="report-stats-row" style="margin-bottom:1rem;">
            ${stats.saves !== undefined ? `<div class="stat-pill"><span class="stat-pill-val">${stats.saves}</span><span class="stat-pill-lbl">Saves</span></div>` : ''}
            ${stats.goalsConceded !== undefined ? `<div class="stat-pill"><span class="stat-pill-val">${stats.goalsConceded}</span><span class="stat-pill-lbl">Goals Conceded</span></div>` : ''}
            ${stats.shotsOnTarget !== undefined ? `<div class="stat-pill"><span class="stat-pill-val">${stats.shotsOnTarget}</span><span class="stat-pill-lbl">Shots on Target</span></div>` : ''}
            ${stats.crossesClaimed !== undefined ? `<div class="stat-pill"><span class="stat-pill-val">${stats.crossesClaimed}</span><span class="stat-pill-lbl">Crosses Claimed</span></div>` : ''}
            ${stats.cleanSheet !== undefined ? `<div class="stat-pill ${stats.cleanSheet ? 'stat-pill--green' : ''}"><span class="stat-pill-val">${stats.cleanSheet ? '✓' : '✗'}</span><span class="stat-pill-lbl">Clean Sheet</span></div>` : ''}
        </div>` : '';

        const strengths = (a.strengths || []).map(s => `<li>✓ ${s}</li>`).join('');
        const areas = (a.areasToImprove || []).map(s => `<li>↑ ${s}</li>`).join('');

        detail.innerHTML = `
            <div class="report-detail-header">
                <div>
                    <div class="report-player-tag">Player: <span>${player.name}</span></div>
                    <div class="report-detail-title">${session.label || 'Match Session'}</div>
                    <div class="report-detail-sub">${date} · ${player.email}</div>
                </div>
                ${a.overallRating != null ? `<div class="report-overall-badge">${a.overallRating}/10</div>` : ''}
            </div>
            ${a.summary ? `<div class="report-summary">${a.summary}</div>` : ''}
            ${statsRow}
            ${skillBars ? `<div class="report-section-title">Skills Breakdown</div><div class="skill-bars">${skillBars}</div>` : ''}
            ${strengths ? `<div class="report-section-title">Strengths</div><ul class="report-strengths-list">${strengths}</ul>` : ''}
            ${areas ? `<div class="report-section-title">Areas to Develop</div><ul class="report-areas-list">${areas}</ul>` : ''}
            ${a.coachNote ? `<div class="report-section-title">Coach's Note</div><div class="report-coach-note">${a.coachNote}</div>` : ''}
        `;
    }

    // ── Render: Ted Chats List ─────────────────────────────
    function renderTedList() {
        const list = document.getElementById('tedList');
        const detail = document.getElementById('tedDetail');

        if (!list || !detail) return;

        if (allTedConversations.length === 0) {
            list.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;">No conversations found.</div>`;
            detail.innerHTML = `<div class="empty-state" style="min-height:300px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:0.5rem;color:var(--text-muted);font-size:0.9rem;"><span style="font-size:2rem;">💬</span><p>No conversations available.</p></div>`;
            return;
        }

        list.innerHTML = allTedConversations.map((c, i) => {
            const contextName = c.context?.name || c.context?.email || (c.context?.isAnonymous ? 'Anonymous Visitor' : 'Unknown User');
            const ts = c.timestamp
                ? new Date(c.timestamp.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                : 'Unknown Time';
            
            // Short preview
            const preview = c.userMessage ? (c.userMessage.length > 30 ? c.userMessage.substring(0, 30) + '...' : c.userMessage) : 'No msg';

            return `
            <div class="report-list-item" data-ted-index="${i}">
                <div class="report-list-player">${contextName}</div>
                <div class="report-list-label" style="margin-bottom:0.25rem;">${ts}</div>
                <div class="report-list-label" style="font-style:italic;">"${preview}"</div>
            </div>`;
        }).join('');

        document.querySelectorAll('.report-list-item[data-ted-index]').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.report-list-item[data-ted-index]').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                renderTedDetail(allTedConversations[parseInt(item.dataset.tedIndex)]);

                if (window.innerWidth <= 768) {
                    const detailEl = document.getElementById('tedDetail');
                    if(detailEl) {
                        detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            });
        });

        // Auto-select first
        document.querySelector('.report-list-item[data-ted-index]')?.click();
    }

    // ── Render: Ted Chat Detail ────────────────────────────
    function renderTedDetail(c) {
        const detail = document.getElementById('tedDetail');
        if (!detail) return;

        const contextName = c.context?.name || c.context?.email || (c.context?.isAnonymous ? 'Anonymous Visitor' : 'Unknown User');
        const ts = c.timestamp
            ? new Date(c.timestamp.seconds * 1000).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
            : 'Unknown time';

        detail.innerHTML = `
            <div class="report-detail-header">
                <div>
                    <div class="report-player-tag">User: <span>${contextName}</span></div>
                    <div class="report-detail-title">Chat Interaction</div>
                    <div class="report-detail-sub">${ts}</div>
                </div>
            </div>
            
            <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
                <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; border-left: 3px solid #63b3ed;">
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; font-weight: 700; text-transform: uppercase;">User Message</div>
                    <div style="font-size: 0.95rem; color: var(--text-primary); line-height: 1.5;">${c.userMessage || ''}</div>
                </div>

                <div style="background: rgba(var(--accent-rgb, 99,102,241), 0.1); padding: 1rem; border-radius: 12px; border-left: 3px solid var(--accent);">
                    <div style="font-size: 0.75rem; color: var(--accent); margin-bottom: 0.25rem; font-weight: 700; text-transform: uppercase;">Ted (AI) Response</div>
                    <div style="font-size: 0.95rem; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap;">${c.botResponse || ''}</div>
                </div>
                
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; font-weight: 700; text-transform: uppercase;">Context Details</div>
                    <pre style="font-size: 0.8rem; color: var(--text-muted); background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 8px; overflow-x: auto; font-family: monospace;">${JSON.stringify(c.context || {}, null, 2)}</pre>
                </div>
            </div>
        `;
    }

    // ── Edit Modal ─────────────────────────────────────────
    function openEditModal({ uid, name, email, agegroup }) {
        document.getElementById('editUid').value = uid;
        const nameParts = (name || '').split(' ');
        document.getElementById('editFirstName').value = nameParts[0] || '';
        document.getElementById('editLastName').value = nameParts.slice(1).join(' ') || '';
        document.getElementById('editEmail').value = email || '';
        if (document.getElementById('editAgeGroup')) {
            document.getElementById('editAgeGroup').value = agegroup || '';
        }
        document.getElementById('editPassword').value = '';
        document.getElementById('editStatusMsg').style.display = 'none';
        document.getElementById('editErrorMsg').style.display = 'none';
        document.getElementById('editModal').style.display = 'flex';
    }

    function closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
    }

    document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('editModal')) closeEditModal();
    });

    document.getElementById('saveEditBtn').addEventListener('click', async () => {
        const saveBtn = document.getElementById('saveEditBtn');
        const statusEl = document.getElementById('editStatusMsg');
        const errorEl = document.getElementById('editErrorMsg');
        statusEl.style.display = 'none';
        errorEl.style.display = 'none';
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        const uid = document.getElementById('editUid').value;
        const firstName = document.getElementById('editFirstName').value.trim();
        const lastName = document.getElementById('editLastName').value.trim();
        const displayName = `${firstName} ${lastName}`.trim();
        const email = document.getElementById('editEmail').value.trim();
        const ageGroup = document.getElementById('editAgeGroup') ? document.getElementById('editAgeGroup').value : null;
        const password = document.getElementById('editPassword').value;

        try {
            const adminUpdateUser = httpsCallable(functions, 'adminUpdateUser');
            const payload = { uid };
            if (displayName) payload.displayName = displayName;
            if (firstName) payload.firstName = firstName;
            if (lastName) payload.lastName = lastName;
            if (email) payload.email = email;
            if (ageGroup) payload.ageGroup = ageGroup;
            if (password && password.length >= 6) payload.password = password;
            else if (password && password.length > 0) {
                errorEl.textContent = 'Password must be at least 6 characters.';
                errorEl.style.display = 'block';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
                return;
            }

            const result = await adminUpdateUser(payload);
            if (result.data.success) {
                statusEl.textContent = '✓ Player updated!';
                statusEl.style.color = 'var(--accent)';
                statusEl.style.display = 'block';
                await loadAll(db);
                setTimeout(closeEditModal, 900);
            }
        } catch (err) {
            errorEl.textContent = 'Error: ' + (err.message || err);
            errorEl.style.display = 'block';
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    });

    // ── Delete Modal ────────────────────────────────────────
    function openDeleteModal(uid, label) {
        document.getElementById('deleteUid').value = uid;
        document.getElementById('deletePlayerLabel').textContent = label;
        document.getElementById('deleteStatusMsg').textContent = '';
        document.getElementById('deleteStatusMsg').style.display = 'none';
        document.getElementById('confirmDeleteBtn').disabled = false;
        document.getElementById('confirmDeleteBtn').textContent = 'Delete Player';
        document.getElementById('deleteModal').style.display = 'flex';
    }

    function closeDeleteModal() {
        document.getElementById('deleteModal').style.display = 'none';
    }

    document.getElementById('closeDeleteModal').addEventListener('click', closeDeleteModal);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('deleteModal')) closeDeleteModal();
    });

    document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
        const deleteBtn = document.getElementById('confirmDeleteBtn');
        const statusEl = document.getElementById('deleteStatusMsg');
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
        statusEl.style.display = 'none';

        const uid = document.getElementById('deleteUid').value;
        try {
            const adminDeleteUser = httpsCallable(functions, 'adminDeleteUser');
            const result = await adminDeleteUser({ uid });
            if (result.data.success) {
                statusEl.textContent = '✓ Player deleted.';
                statusEl.style.color = 'var(--accent)';
                statusEl.style.display = 'block';
                await loadAll(db);
                setTimeout(closeDeleteModal, 900);
            }
        } catch (err) {
            statusEl.textContent = 'Error: ' + (err.message || err);
            statusEl.style.color = 'var(--danger, #e53e3e)';
            statusEl.style.display = 'block';
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete Player';
        }
    });

    // ── Batch Load Modal + Resilience ───────────────────────
    let batchFilesGrouped = {};
    let batchTotalFiles = 0;
    let batchUploadTasks = [];
    let batchUploadInProgress = false;
    let batchWakeLock = null;

    async function requestBatchWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                batchWakeLock = await navigator.wakeLock.request('screen');
                console.log('Screen Wake Lock acquired to prevent sleep during batch upload');
            }
        } catch (err) {
            console.warn(`Wake Lock error: ${err.message}`);
        }
    }

    function releaseBatchWakeLock() {
        if (batchWakeLock !== null) {
            batchWakeLock.release().then(() => { batchWakeLock = null; });
        }
    }

    function handleBatchVisibilityChange() {
        if (!batchUploadInProgress) return;
        if (document.hidden) {
            console.log("Tab backgrounded. Pausing batch uploads...");
            batchUploadTasks.forEach(task => { try { task.pause(); } catch(e){} });
        } else {
            console.log("Tab visible. Resuming batch uploads...");
            if (batchWakeLock === null) requestBatchWakeLock();
            batchUploadTasks.forEach(task => { try { task.resume(); } catch(e){} });
        }
    }

    function batchBeforeUnloadHandler(e) {
        e.preventDefault();
        e.returnValue = 'Batch upload is still in progress. If you leave, it will be cancelled.';
        return e.returnValue;
    }

    function cancelBatchUpload() {
        batchUploadTasks.forEach(task => { try { task.cancel(); } catch (_) {} });
        batchUploadTasks = [];
        batchUploadInProgress = false;
        window.removeEventListener('beforeunload', batchBeforeUnloadHandler);
        document.removeEventListener('visibilitychange', handleBatchVisibilityChange);
        releaseBatchWakeLock();
    }

    function openBatchModal(uid, name) {
        document.getElementById('batchUid').value = uid;
        document.getElementById('batchPlayerName').textContent = name;
        document.getElementById('batchFileInput').value = '';
        document.getElementById('batchSummaryContainer').style.display = 'none';
        document.getElementById('batchProgressContainer').style.display = 'none';
        document.getElementById('batchStatusMsg').style.display = 'none';
        document.getElementById('batchErrorMsg').style.display = 'none';
        document.getElementById('confirmBatchBtn').disabled = true;
        document.getElementById('confirmBatchBtn').textContent = 'Upload & Create Matches';
        document.getElementById('cancelBatchBtn').disabled = false;
        document.getElementById('cancelBatchBtn').textContent = 'Cancel';
        document.getElementById('batchModal').style.display = 'flex';
        batchFilesGrouped = {};
        batchTotalFiles = 0;
        batchUploadTasks = [];
        batchUploadInProgress = false;
    }

    function closeBatchModal() {
        if (batchUploadInProgress) {
            if (!confirm('Batch upload is in progress. Are you sure you want to cancel?')) {
                return;
            }
            cancelBatchUpload();
            if (document.getElementById('batchStatusMsg').textContent !== "✓ Batch upload complete!") {
                document.getElementById('batchErrorMsg').style.display = 'block';
                document.getElementById('batchErrorMsg').textContent = 'Upload cancelled by user.';
            }
        }
        document.getElementById('batchModal').style.display = 'none';
        document.getElementById('confirmBatchBtn').disabled = false;
        document.getElementById('confirmBatchBtn').textContent = 'Upload & Create Matches';
    }

    document.getElementById('closeBatchModal').addEventListener('click', closeBatchModal);
    document.getElementById('cancelBatchBtn').addEventListener('click', closeBatchModal);
    
    document.getElementById('batchFileInput').addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) {
            document.getElementById('batchSummaryContainer').style.display = 'none';
            document.getElementById('confirmBatchBtn').disabled = true;
            return;
        }

        // Group files by Time Window (3 hours max) AND Unique Session UUIDs
        batchFilesGrouped = {};
        batchTotalFiles = files.length;
        
        // Sort files chronologically, then alphabetically if times are identical
        files.sort((a, b) => {
            if (a.lastModified === b.lastModified) {
                return a.name.localeCompare(b.name);
            }
            return a.lastModified - b.lastModified;
        });

        let currentGroupKey = null;
        let currentGroupStartTime = null;
        let currentGroupUUID = null;

        files.forEach(f => {
            // Check if filename contains a standard UUID (like from Veo, Trace, or iOS exports)
            const match = f.name.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
            const fileUUID = match ? match[0] : null;

            let forceNewGroup = false;

            if (!currentGroupStartTime) {
                forceNewGroup = true;
            } else {
                // Rule 1: Time difference strictly > 3 hours
                if ((f.lastModified - currentGroupStartTime) > 3 * 60 * 60 * 1000) {
                    forceNewGroup = true;
                }
                // Rule 2: Both files have a UUID, but they represent entirely different sessions!
                else if (fileUUID && currentGroupUUID && fileUUID !== currentGroupUUID) {
                    forceNewGroup = true;
                }
            }

            if (forceNewGroup) {
                currentGroupStartTime = f.lastModified;
                currentGroupUUID = fileUUID;

                const startDate = new Date(currentGroupStartTime);
                const datePart = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const timePart = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                
                let key = `${datePart} (${timePart})`;
                
                // If games share the exact same minute because of export, deduplicate the label
                let dedupeCounter = 1;
                while (batchFilesGrouped[key]) {
                    dedupeCounter++;
                    key = `${datePart} (${timePart}) - Game ${dedupeCounter}`;
                }
                
                currentGroupKey = key;
                batchFilesGrouped[currentGroupKey] = [];
            }
            
            batchFilesGrouped[currentGroupKey].push(f);
        });

        // Render summary
        const summaryHtml = Object.keys(batchFilesGrouped).map(dateStr => {
            const groupFiles = batchFilesGrouped[dateStr];
            return `
            <div class="batch-group">
                <div class="batch-group-title">Match Date: ${dateStr} (${groupFiles.length} video${groupFiles.length > 1 ? 's' : ''})</div>
                ${groupFiles.map(f => {
                    const safeId = f.name.replace(/[^a-zA-Z0-9]/g, '_');
                    return `
                    <div class="batch-file-item" style="flex-direction: column; align-items: stretch; margin-bottom: 0.5rem; gap: 0.3rem;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>${f.name}</span>
                            <span>${(f.size / (1024*1024)).toFixed(1)} MB</span>
                        </div>
                        <div class="progress-bar-bg" style="height: 4px; border-radius: 2px;">
                            <div class="progress-bar-fill" id="file-prog-${safeId}" style="width: 0%; height: 100%; background: var(--accent); transition: width 0.3s; box-shadow: 0 0 6px var(--accent-rgb, transparent);"></div>
                        </div>
                    </div>
                `}).join('')}
            </div>`;
        }).join('');

        document.getElementById('batchSummaryList').innerHTML = summaryHtml;
        document.getElementById('batchSummaryContainer').style.display = 'block';
        document.getElementById('confirmBatchBtn').disabled = false;
    });

    document.getElementById('confirmBatchBtn').addEventListener('click', async () => {
        const uid = document.getElementById('batchUid').value;
        const btn = document.getElementById('confirmBatchBtn');
        const cancelBtn = document.getElementById('cancelBatchBtn');
        const progressContainer = document.getElementById('batchProgressContainer');
        const progressFill = document.getElementById('batchProgressFill');
        const progressText = document.getElementById('batchProgressText');
        const errorMsg = document.getElementById('batchErrorMsg');
        const statusMsg = document.getElementById('batchStatusMsg');

        btn.disabled = true;
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Cancel Upload';
        btn.textContent = 'Uploading...';
        progressContainer.style.display = 'block';
        
        batchUploadInProgress = true;
        batchUploadTasks = [];
        window.addEventListener('beforeunload', batchBeforeUnloadHandler);
        document.addEventListener('visibilitychange', handleBatchVisibilityChange);
        requestBatchWakeLock();
        errorMsg.style.display = 'none';
        statusMsg.style.display = 'none';

        let filesUploaded = 0;
        
        try {
            const groups = Object.keys(batchFilesGrouped);
            
            for (const dateStr of groups) {
                const files = batchFilesGrouped[dateStr];
                
                // Earliest file timestamp in the group for 'createdAt'
                const earliestMs = Math.min(...files.map(f => f.lastModified));
                const earliestDate = new Date(earliestMs);
                
                // Formatted YYYY-MM-DD for gameDate
                const yyyy = earliestDate.getFullYear();
                const mm = String(earliestDate.getMonth() + 1).padStart(2, '0');
                const dd = String(earliestDate.getDate()).padStart(2, '0');
                const gameDate = `${yyyy}-${mm}-${dd}`;
                
                progressText.textContent = `Creating session for ${dateStr}...`;
                
                // Create pending session
                const sessionRef = await addDoc(collection(db, 'users', uid, 'sessions'), {
                    label: `${dateStr} · Historical Game vs. ${dateStr}`,
                    myTeam: `Historical Game`,
                    opponent: dateStr,
                    gameDate: gameDate,
                    goalieNumber: null,
                    jerseyColor: null,
                    videos: files.map((f, i) => ({ 
                        storagePath: `videos/${uid}/${earliestMs}_${i}_${f.name}`, 
                        name: f.name 
                    })),
                    status: 'pending',
                    createdAt: Timestamp.fromDate(earliestDate),
                    uploadedAt: null,
                });

                // Upload files concurrently for THIS session
                const uploadedVideos = [];
                const uploadPromises = files.map(async (file, i) => {
                    const ext = file.name.split('.').pop()?.toLowerCase();
                    const mimeType = ext === 'mov' ? 'video/quicktime' : ext === 'avi' ? 'video/x-msvideo' : ext === 'webm' ? 'video/webm' : 'video/mp4';
                    const storagePath = `videos/${uid}/${earliestMs}_${i}_${file.name}`;
                    
                    const storageRefObj = ref(storage, storagePath);
                    const task = uploadBytesResumable(storageRefObj, file, { contentType: mimeType });
                    batchUploadTasks.push(task);
                    
                    const safeId = file.name.replace(/[^a-zA-Z0-9]/g, '_');
                    const fileProgressFill = document.getElementById(`file-prog-${safeId}`);
                    
                    return new Promise((resolve, reject) => {
                        task.on('state_changed', 
                            (snapshot) => {
                                if (fileProgressFill) {
                                    const filePct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                    fileProgressFill.style.width = `${filePct}%`;
                                }
                            }, 
                            (err) => err.code === 'storage/canceled' ? resolve(null) : reject(err), 
                            async () => {
                                if (fileProgressFill) {
                                    fileProgressFill.style.width = '100%';
                                    fileProgressFill.style.background = '#48bb78';
                                    fileProgressFill.style.boxShadow = '0 0 6px rgba(72,187,120,0.6)';
                                }
                                const url = await getDownloadURL(task.snapshot.ref);
                                filesUploaded++;
                                const totalPct = Math.round((filesUploaded / batchTotalFiles) * 100);
                                progressFill.style.width = `${totalPct}%`;
                                progressText.textContent = `Uploaded ${filesUploaded} of ${batchTotalFiles} files...`;
                                resolve({ url, storagePath, name: file.name, mimeType, actionSegments: null });
                            }
                        );
                    });
                });

                const settledResults = await Promise.allSettled(uploadPromises);
                
                const failures = settledResults.filter(r => r.status === 'rejected');
                if (failures.length > 0) {
                    const exactError = failures[0].reason?.message || 'Unknown network error';
                    throw new Error(`Failed to upload videos for ${dateStr}. Reason: ${exactError}`);
                }

                const results = settledResults
                    .filter(r => r.status === 'fulfilled' && r.value !== null)
                    .map(r => r.value);
                
                if (results.length === 0) {
                    throw new Error(`No videos were successfully uploaded for ${dateStr}.`);
                }
                
                // Update session
                await updateDoc(sessionRef, {
                    videos: results,
                    videoURL: results[0].url,
                    uploadedAt: serverTimestamp() // The actual upload time
                });
            }

            statusMsg.textContent = "✓ Batch upload complete!";
            statusMsg.style.color = "var(--accent)";
            statusMsg.style.display = "block";
            btn.textContent = "Finished";
            cancelBtn.textContent = "Return";
            cancelBtn.disabled = false;
            
            batchUploadInProgress = false;
            batchUploadTasks = [];
            window.removeEventListener('beforeunload', batchBeforeUnloadHandler);
            document.removeEventListener('visibilitychange', handleBatchVisibilityChange);
            releaseBatchWakeLock();

            // Reload logs/UI
            await loadAll(db);
            
        } catch (err) {
            console.error("Batch upload failed:", err);
            errorMsg.textContent = "Error: " + (err.message || err);
            errorMsg.style.display = "block";
            btn.disabled = false;
            cancelBtn.disabled = false;
            cancelBtn.textContent = "Cancel";
            btn.textContent = "Retry Failed";
            
            batchUploadInProgress = false;
            batchUploadTasks = [];
            window.removeEventListener('beforeunload', batchBeforeUnloadHandler);
            document.removeEventListener('visibilitychange', handleBatchVisibilityChange);
            releaseBatchWakeLock();
        }
    });

    // Logout
    document.getElementById('adminLogoutBtn')?.addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = '/');
    });

    // Initial load (roster + sessions for logs + reports)
    await loadAll(db);
});
