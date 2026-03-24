import { initFirebase } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

import { addUploadListeners } from "./upload.js?v=3";
import { startSessionListener, toggleSelectMode, selectAll, confirmBulkDelete } from "./sessions.js?v=3";
import { addModalListeners } from "./modals.js";
import { initTrendsChart, initRadarChart } from "./trends.js";

let currentUser = null;
let firebase = {};
let functions = null;
let trialState = { isActive: false, daysRemaining: 0, expiryDate: null, trialUsed: false };

document.addEventListener('DOMContentLoaded', async () => {
    initTrendsChart();
    initRadarChart();
    firebase = await initFirebase();
    const { auth } = firebase;

    functions = getFunctions(firebase.app);

    onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = '/'; return; }
        currentUser = user;

        // Check if admin is impersonating a player via ?uid= query param
        const urlParams = new URLSearchParams(window.location.search);
        const viewAsUid = urlParams.get('uid');
        const isImpersonating = viewAsUid && viewAsUid !== user.uid;
        const targetUid = isImpersonating ? viewAsUid : user.uid;

        // Single profile fetch (was duplicated before)
        let userProfile = null;
        let firstName = isImpersonating ? targetUid : user.email.split('@')[0];
        let fullName = firstName;

        try {
            const docSnap = await getDoc(doc(firebase.db, 'users', targetUid));
            if (docSnap.exists()) {
                userProfile = docSnap.data();
                if (userProfile.firstName && userProfile.lastName) {
                    firstName = userProfile.firstName;
                    fullName = `${userProfile.firstName} ${userProfile.lastName}`;
                } else if (userProfile.displayName) {
                    firstName = userProfile.displayName.split(' ')[0] || userProfile.displayName;
                    fullName = userProfile.displayName;
                }
            }
        } catch {
            // Profile fetch failed — use defaults
        }

        // Set display name
        if (isImpersonating) {
            const nameEl = document.getElementById('playerName');
            nameEl.innerHTML = `<a href="/admin" title="Back to Admin Portal" style="color:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:6px;cursor:pointer;">${fullName}<span style="font-size:0.7rem;background:rgba(var(--accent-rgb,99,102,241),0.25);color:var(--accent,#6366f1);border-radius:6px;padding:2px 7px;font-weight:700;letter-spacing:0.05em;">← Admin</span></a>`;
        } else {
            document.getElementById('playerName').textContent = fullName;
        }
        document.getElementById('welcomeMsg').textContent = `Welcome back, ${firstName}!`;

        // Set context for Ted Chatbot
        if (window.setTedContext) {
            try {
                const idToken = await user.getIdToken();
                window.setTedContext(idToken, { name: fullName, uid: targetUid });
            } catch (err) {
                console.error("Failed to init Ted context:", err);
            }
        }

        // Build a synthetic user-like object for the target player when impersonating
        const targetUser = isImpersonating
            ? { uid: targetUid, email: userProfile?.email || targetUid, getIdToken: () => user.getIdToken() }
            : user;

        // Check trial status (always for the actual auth user)
        await checkTrialStatus();

        // Pass dependencies straight to modules
        addUploadListeners(targetUser, firebase);
        addModalListeners(targetUser, firebase, userProfile);

        // Start real-time session listener
        startSessionListener(targetUser, firebase, userProfile);
    });

    // Sub-menus
    document.getElementById('logoutBtn')?.addEventListener('click', () =>
        signOut(firebase.auth).then(() => window.location.href = '/')
    );

    // Select mode controls
    document.getElementById('toggleSelectBtn').addEventListener('click', toggleSelectMode);
    document.getElementById('selectAllBtn').addEventListener('click', selectAll);
    document.getElementById('bulkDeleteBtn').addEventListener('click', () => confirmBulkDelete(currentUser, firebase));

    // Trial buttons
    document.getElementById('activateTrialBtn')?.addEventListener('click', activateTrial);
    document.getElementById('skipTrialBtn')?.addEventListener('click', skipTrial);
    document.getElementById('trialStartLink')?.addEventListener('click', (e) => { e.preventDefault(); activateTrial(); });
    document.getElementById('trialDismissBtn')?.addEventListener('click', dismissTrialBanner);
    document.getElementById('continueFreeTierBtn')?.addEventListener('click', () => {
        document.getElementById('trialExpiredOverlay').style.display = 'none';
    });
});

async function checkTrialStatus() {
    try {
        const checkTrial = httpsCallable(functions, 'checkTrialStatus');
        const res = await checkTrial();
        trialState = res.data;

        const trialBanner = document.getElementById('trialBanner');
        const trialBannerText = document.getElementById('trialBannerText');
        const trialStartLink = document.getElementById('trialStartLink');

        if (!trialState.trialUsed) {
            if (!sessionStorage.getItem('trialModalSeen')) {
                setTimeout(() => {
                    document.getElementById('trialModal').style.display = 'flex';
                }, 1000);
            }
            trialBanner.style.display = 'flex';
            trialBanner.classList.remove('trial-expiring', 'trial-expired');
            trialBannerText.textContent = 'Start your free trial for full access until June 30.';
            trialStartLink.style.display = 'inline-block';
            return;
        }

        if (trialState.isTrialActive) {
            trialBanner.style.display = 'flex';
            trialStartLink.style.display = 'none';
            trialBannerText.textContent = `Full access — ${trialState.daysRemaining} days remaining`;

            if (trialState.daysRemaining <= 14) {
                trialBanner.classList.add('trial-expiring');
            } else {
                trialBanner.classList.remove('trial-expiring', 'trial-expired');
            }
            return;
        }

        if (trialState.trialUsed && !trialState.isTrialActive) {
            trialBanner.style.display = 'flex';
            trialStartLink.style.display = 'none';
            trialBanner.classList.add('trial-expired');
            trialBannerText.textContent = 'Free Trial Expired';
            
            if (!sessionStorage.getItem('trialExpiredSeen')) {
                document.getElementById('trialExpiredOverlay').style.display = 'flex';
                sessionStorage.setItem('trialExpiredSeen', 'true');
            }

            document.getElementById('uploadVideoBtn').disabled = true;
            document.getElementById('uploadVideoBtn').title = 'Requires subscription';
        }
    } catch (err) {
        console.error("Error checking trial status:", err);
    }
}

async function activateTrial() {
    const btn = document.getElementById('activateTrialBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Activating...';
    }

    try {
        const activate = httpsCallable(functions, 'activateTrial');
        await activate();
        sessionStorage.setItem('trialModalSeen', 'true');
        document.getElementById('trialModal').style.display = 'none';
        
        await checkTrialStatus();
        
        if (currentUser) {
            await currentUser.getIdToken(true);
        }
    } catch (err) {
        console.error("Trial activation failed", err);
        alert(err.message || 'Failed to activate trial. Please try again.');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Start Free Trial';
        }
    }
}

function skipTrial() {
    sessionStorage.setItem('trialModalSeen', 'true');
    document.getElementById('trialModal').style.display = 'none';
}

function dismissTrialBanner() {
    document.getElementById('trialBanner').style.display = 'none';
}
