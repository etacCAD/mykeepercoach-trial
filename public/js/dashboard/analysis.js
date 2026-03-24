import { updateDoc, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

/**
 * analysis.js
 *
 * Triggers and manages AI analysis for a session.
 * All Gemini API calls are handled server-side — no API key in this file.
 *
 * Two code paths:
 *   1. callAnalyzeApi()  — used after initial upload; fires POST to /analyze (analyzeV2)
 *   2. reAnalyze()       — used by the "re-analyze" button; calls reAnalyzeSession callable
 *
 * Both ultimately run analyzeWebSession() in geminiAnalysis.ts on the backend,
 * which reads the video from Firebase Storage, calls Gemini, and writes results to Firestore.
 * The client just watches Firestore via onSnapshot for status updates.
 */

/**
 * Trigger initial analysis for a session via the /analyze HTTP endpoint (analyzeV2).
 * The backend fires-and-forgets — we just wait for Firestore to update via onSnapshot.
 */
export async function callAnalyzeApi(currentUser, firebase, sessionId) {
    if (!currentUser) throw new Error('Not authenticated');

    const sessionRef = doc(firebase.db, 'users', currentUser.uid, 'sessions', sessionId);

    // Verify session exists before calling backend
    const snap = await getDoc(sessionRef);
    if (!snap.exists()) throw new Error('Session not found');

    const sessionData = snap.data();
    if (sessionData.status === 'ready' && sessionData.analysis) {
        console.log(`[analyze] Session ${sessionId} already has results — skipping.`);
        return { success: true, cached: true };
    }

    // Get fresh ID token for the backend
    const idToken = await currentUser.getIdToken();

    // Mark as processing so the UI reacts immediately
    await updateDoc(sessionRef, { status: 'processing', errorMessage: '' });

    console.log(`[analyze] Triggering backend analysis for session ${sessionId}`);

    // Fire-and-forget POST to /analyze (analyzeV2 onRequest function)
    // The backend updates Firestore async; we watch via onSnapshot elsewhere.
    fetch('/analyze', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ sessionId }),
    }).then(async (resp) => {
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            const msg = err?.error || `HTTP ${resp.status}`;
            console.error(`[analyze] Backend returned error: ${msg}`);
            await updateDoc(sessionRef, { status: 'failed', errorMessage: msg }).catch(() => {});
        } else {
            console.log(`[analyze] Backend accepted session ${sessionId}`);
        }
    }).catch(async (err) => {
        console.error('[analyze] Failed to reach backend:', err);
        await updateDoc(sessionRef, { status: 'failed', errorMessage: err.message }).catch(() => {});
    });

    return { success: true };
}

const activeAnalyses = new Set();

/**
 * Re-analyze an existing session using the reAnalyzeSession Firebase Callable.
 * Used by the "Re-analyze" and "Retry Analysis" buttons in the session card.
 */
export async function reAnalyze(currentUser, firebase, sessionId, btn) {
    if (!sessionId || !currentUser) return;

    if (activeAnalyses.has(sessionId)) {
        alert('Analysis is already running for this session. Please wait for it to finish.');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Starting…';
    }

    activeAnalyses.add(sessionId);

    try {
        const functions = getFunctions(firebase.app);
        const reAnalyzeSession = httpsCallable(functions, 'reAnalyzeSession');

        console.log(`[reAnalyze] Calling reAnalyzeSession for ${sessionId}`);
        await reAnalyzeSession({ sessionId });
        console.log(`[reAnalyze] Session ${sessionId} re-analysis complete`);
    } catch (err) {
        console.error('[reAnalyze] Failed:', err);
        // Try to mark as failed in Firestore so the user can retry
        try {
            const sessionRef = doc(firebase.db, 'users', currentUser.uid, 'sessions', sessionId);
            await updateDoc(sessionRef, { status: 'failed', errorMessage: err.message || String(err) });
        } catch (_) {}
    } finally {
        activeAnalyses.delete(sessionId);
    }
}
