import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Analysis is triggered server-side by the onWebSessionUploaded Storage trigger.
// No Gemini API key in this file.

let selectedFiles = [];
let activeUploadTasks = [];
let uploadInProgress = false;

// --- Upload Resilience Features ---
let wakeLock = null;

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock acquired to prevent sleep during upload');
        }
    } catch (err) {
        console.warn(`Wake Lock error: ${err.message}`);
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
    }
}

function handleVisibilityChange() {
    if (!uploadInProgress) return;
    const progressText = document.getElementById('progressText');
    if (document.hidden) {
        console.log("Tab backgrounded. Pausing uploads to prevent forced OS termination...");
        if (progressText) progressText.textContent = 'Upload auto-paused while backgrounded. Waiting to resume...';
        activeUploadTasks.forEach(task => { try { task.pause(); } catch(e){} });
    } else {
        console.log("Tab visible. Resuming uploads...");
        if (progressText) progressText.textContent = `Scanning and uploading ${selectedFiles.length} video(s)...`;
        if (wakeLock === null) requestWakeLock(); // Re-acquire if OS dropped it
        activeUploadTasks.forEach(task => { try { task.resume(); } catch(e){} });
    }
}
// ----------------------------------

function beforeUnloadHandler(e) {
    e.preventDefault();
    e.returnValue = 'Your upload is still in progress. If you leave, the upload will be cancelled.';
    return e.returnValue;
}

export function cancelActiveUploads() {
    activeUploadTasks.forEach(task => { try { task.cancel(); } catch (_) {} });
    activeUploadTasks = [];
    uploadInProgress = false;
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    releaseWakeLock();

    const submitBtn = document.getElementById('submitUploadBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Videos';
        submitBtn.classList.remove('uploading-btn');
    }
    const cancelBtn = document.getElementById('cancelUploadBtn');
    if (cancelBtn) cancelBtn.textContent = 'Cancel';
}

export function addUploadListeners(currentUser, firebase) {
    document.getElementById('fileInput').addEventListener('change', (e) => addFiles(e.target.files));

    const dropZone = document.getElementById('dropZone');
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        addFiles(e.dataTransfer.files);
    });

    document.getElementById('submitUploadBtn').addEventListener('click', () => handleUpload(currentUser, firebase));
}

function addFiles(fileList) {
    const errorEl = document.getElementById('uploadError');
    errorEl.style.display = 'none';

    for (const file of fileList) {
        if (selectedFiles.length >= 10) {
            errorEl.textContent = 'Maximum 10 videos per session.';
            errorEl.style.display = 'block';
            break;
        }
        if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
            selectedFiles.push(file);
        }
    }
    renderFileList();
}

function renderFileList() {
    const fileListEl = document.getElementById('fileList');
    const fileListItems = document.getElementById('fileListItems');

    if (selectedFiles.length === 0) { fileListEl.style.display = 'none'; return; }

    fileListEl.style.display = 'block';
    fileListItems.innerHTML = selectedFiles.map((f, i) => `
        <div class="file-item" id="file-item-${i}">
            <div class="file-item-info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span class="file-item-name">${f.name}</span>
                <span class="file-item-size">${(f.size / (1024*1024)).toFixed(1)} MB</span>
            </div>
            <div class="file-item-progress" id="file-progress-${i}" style="display:none;">
                <div class="progress-bar-bg" style="height:4px;"><div class="progress-bar-fill" id="file-fill-${i}" style="width:0%;transition:width 0.3s;height:4px;"></div></div>
            </div>
            <button class="file-remove-btn" data-index="${i}">✕</button>
        </div>`
    ).join('');

    document.querySelectorAll('.file-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedFiles.splice(parseInt(btn.dataset.index), 1);
            renderFileList();
        });
    });
}

export function clearSelectedFiles() {
    selectedFiles = [];
}

async function handleUpload(currentUser, firebase) {
    const { db, storage } = firebase;

    const myTeam      = (document.getElementById('teamName').value || '').trim();
    const opponent    = (document.getElementById('opponentName').value || '').trim();
    const rawDate     = document.getElementById('gameDate').value;
    const goalieNumber = (document.getElementById('goalieNumber').value || '').trim();
    const jerseyColor  = (document.getElementById('jerseyColor').value || '').trim();

    const errorEl = document.getElementById('uploadError');
    errorEl.style.display = 'none';

    if (!myTeam || !opponent || !rawDate) {
        errorEl.textContent = 'Please fill in Your Team, Opponent, and Game Date.';
        errorEl.style.display = 'block';
        return;
    }
    if (selectedFiles.length === 0) {
        errorEl.textContent = 'Please select at least one video file.';
        errorEl.style.display = 'block';
        return;
    }

    const dateLabel = new Date(rawDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const label = `${dateLabel} · ${myTeam} vs. ${opponent}`;

    const submitBtn  = document.getElementById('submitUploadBtn');
    const cancelBtn  = document.getElementById('cancelUploadBtn');
    const progressBar  = document.getElementById('uploadProgress');
    const progressText = document.getElementById('progressText');
    const progressFill = document.getElementById('progressFill');

    uploadInProgress = true;
    activeUploadTasks = [];
    submitBtn.disabled = true;
    submitBtn.textContent = '⏫ Uploading…';
    submitBtn.classList.add('uploading-btn');
    if (cancelBtn) cancelBtn.textContent = 'Cancel Upload';
    document.querySelectorAll('.file-remove-btn').forEach(b => b.disabled = true);
    progressBar.style.display = 'block';
    window.addEventListener('beforeunload', beforeUnloadHandler);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    requestWakeLock();

    const now = Date.now();
    const storagePaths = selectedFiles.map((file, i) =>
        `videos/${currentUser.uid}/${now}_${i}_${file.name}`
    );

    let sessionRef = null;
    try {
        // ── Create session doc ──────────────────────────────────────────────
        progressText.textContent = 'Creating session…';
        sessionRef = await addDoc(collection(db, 'users', currentUser.uid, 'sessions'), {
            label,
            myTeam,
            opponent,
            gameDate: rawDate,
            goalieNumber: goalieNumber || null,
            jerseyColor: jerseyColor || null,
            videos: storagePaths.map((p, i) => ({ 
                storagePath: p, 
                name: selectedFiles[i].name,
                size: selectedFiles[i].size
            })),
            status: 'pending',
            createdAt: serverTimestamp(),
            uploadedAt: null,
        });

        // ── Per-file: motion detect (sequential) → upload to Storage (concurrent) ──
        const fileProgresses = new Array(selectedFiles.length).fill(0);
        function updateGlobalProgress() {
            const avg = fileProgresses.reduce((s, p) => s + p, 0) / fileProgresses.length;
            progressFill.style.width = `${avg}%`;
        }

        progressText.textContent = `Scanning and uploading ${selectedFiles.length} video(s)...`;

        let motionMutex = Promise.resolve();

        const uploadPromises = selectedFiles.map(async (file, i) => {
            const videoName = file.name;
            const ext = videoName.split('.').pop()?.toLowerCase();
            const mimeType = ext === 'mov' ? 'video/quicktime'
                : ext === 'avi' ? 'video/x-msvideo'
                : ext === 'webm' ? 'video/webm'
                : 'video/mp4';

            const progEl = document.getElementById(`file-progress-${i}`);
            if (progEl) progEl.style.display = 'block';
            const fillEl = document.getElementById(`file-fill-${i}`);

            let uploadBlob = file;

            // Immediately set to 15% to indicate we are preparing network upload
            fileProgresses[i] = 15;
            if (fillEl) fillEl.style.width = '15%';
            updateGlobalProgress();

            if (!uploadInProgress) return null;

            // Step B: Upload directly to Firebase Storage
            const url = await new Promise((resolve, reject) => {
                const storageRef = ref(storage, storagePaths[i]);
                const task = uploadBytesResumable(storageRef, uploadBlob, { contentType: mimeType });
                activeUploadTasks.push(task);
                task.on('state_changed',
                    (snap) => {
                        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                        // Scale percentage realistically from 15% to 100%
                        const mappedPct = 15 + Math.round(pct * 0.85);
                        if (fillEl) fillEl.style.width = `${mappedPct}%`;
                        fileProgresses[i] = mappedPct;
                        updateGlobalProgress();
                    },
                    (err) => err.code === 'storage/canceled' ? resolve(null) : reject(err),
                    async () => resolve(await getDownloadURL(task.snapshot.ref))
                );
            });

            if (!url || !uploadInProgress) return null;

            return {
                url,
                storagePath: storagePaths[i],
                name: videoName,
                mimeType,
                size: file.size,
                actionSegments: null,
            };
        });

        const settledResults = await Promise.allSettled(uploadPromises);
        
        // If there are failures, throw an error so the UI handles it and resets
        const failures = settledResults.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            console.error("Detailed upload failures:", failures.map(f => f.reason));
            const exactError = failures[0].reason?.message || 'Unknown network error';
            throw new Error(`Failed to upload ${failures.length} video(s). Reason: ${exactError}`);
        }

        const results = settledResults
            .filter(r => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);

        if (results.length === 0) {
            throw new Error("No videos were successfully uploaded.");
        }

        // ── Save URLs + actionSegments to Firestore, then let backend trigger analysis ──
        await updateDoc(sessionRef, {
            videos: results.map(r => ({
                url: r.url,
                storagePath: r.storagePath,
                name: r.name,
                mimeType: r.mimeType,
                size: r.size,
                actionSegments: r.actionSegments || null,
            })),
            videoURL: results[0].url,
            uploadedAt: serverTimestamp(),
            // status stays 'pending' — onWebSessionUploaded trigger sets it to 'processing'
        });

        uploadInProgress = false;
        activeUploadTasks = [];
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        releaseWakeLock();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Videos';
        submitBtn.classList.remove('uploading-btn');
        if (cancelBtn) cancelBtn.textContent = 'Cancel';

        progressText.textContent = '✓ Uploaded! AI analysis starting…';
        progressFill.style.width = '100%';

        localStorage.setItem('kcLastTeam', myTeam);
        if (goalieNumber) localStorage.setItem('kcLastGoalieNumber', goalieNumber);
        if (jerseyColor) localStorage.setItem('kcLastJerseyColor', jerseyColor);

        setTimeout(() => {
            document.getElementById('uploadModal').style.display = 'none';
            selectedFiles = [];
        }, 1500);

    } catch (err) {
        console.error('Upload error:', err);
        uploadInProgress = false;
        activeUploadTasks = [];
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        releaseWakeLock();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Videos';
        submitBtn.classList.remove('uploading-btn');
        if (cancelBtn) cancelBtn.textContent = 'Cancel';
        if (sessionRef) {
            deleteDoc(sessionRef).catch(e => console.warn('Failed to clean up session doc:', e));
        }
        
        errorEl.textContent = `Upload failed: ${err.message}`;
        errorEl.style.display = 'block';
        progressBar.style.display = 'none';
    }
}
