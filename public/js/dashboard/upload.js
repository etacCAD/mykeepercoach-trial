import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { collection, addDoc, updateDoc, serverTimestamp, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { detectActionSegments, extractActionClip } from "./motion-detect.js";

// Analysis is triggered server-side by the onWebSessionUploaded Storage trigger.
// No Gemini API key in this file.

let selectedFiles = [];
let activeUploadTasks = [];
let uploadInProgress = false;

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

    const now = Date.now();
    const storagePaths = selectedFiles.map((file, i) =>
        `videos/${currentUser.uid}/${now}_${i}_${file.name}`
    );

    try {
        // ── Create session doc ──────────────────────────────────────────────
        progressText.textContent = 'Creating session…';
        const sessionRef = await addDoc(collection(db, 'users', currentUser.uid, 'sessions'), {
            label,
            myTeam,
            opponent,
            gameDate: rawDate,
            goalieNumber: goalieNumber || null,
            jerseyColor: jerseyColor || null,
            videos: storagePaths.map((p, i) => ({ storagePath: p, name: selectedFiles[i].name })),
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
            let actionSegments = null;

            // Step A: Motion detection (sequential mutex to prevent crashes)
            await (motionMutex = motionMutex.then(async () => {
                if (!uploadInProgress) return;
                try {
                    const segments = await detectActionSegments(file, (p) => {
                        if (fillEl) fillEl.style.width = `${Math.round(p * 40)}%`;
                        fileProgresses[i] = Math.round(p * 15);
                        updateGlobalProgress();
                    });
                    actionSegments = segments;
                    console.log(`[upload] Action segments for ${videoName}:`, segments);

                    uploadBlob = await extractActionClip(file, segments, (p) => {
                        if (fillEl) fillEl.style.width = `${40 + Math.round(p * 20)}%`;
                        fileProgresses[i] = 15 + Math.round(p * 10);
                        updateGlobalProgress();
                    });

                    if (uploadBlob !== file) {
                        const savedMB = ((file.size - uploadBlob.size) / 1048576).toFixed(1);
                        console.log(`[upload] Trimmed ${videoName}: saved ${savedMB} MB`);
                    }
                } catch (motionErr) {
                    console.warn('[upload] Motion detection failed, using original:', motionErr);
                    uploadBlob = file;
                }
            }));

            if (!uploadInProgress) return null;

            // Step B: Upload trimmed clip to Firebase Storage only
            const url = await new Promise((resolve, reject) => {
                const storageRef = ref(storage, storagePaths[i]);
                const task = uploadBytesResumable(storageRef, uploadBlob, { contentType: mimeType });
                activeUploadTasks.push(task);
                task.on('state_changed',
                    (snap) => {
                        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                        if (fillEl) fillEl.style.width = `${60 + Math.round(pct * 0.4)}%`;
                        fileProgresses[i] = 25 + Math.round(pct * 0.75);
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
                actionSegments,
            };
        });

        const settledResults = await Promise.allSettled(uploadPromises);
        const results = settledResults
            .filter(r => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);

        if (results.length === 0) return;

        // ── Save URLs + actionSegments to Firestore, then let backend trigger analysis ──
        await updateDoc(sessionRef, {
            videos: results.map(r => ({
                url: r.url,
                storagePath: r.storagePath,
                name: r.name,
                mimeType: r.mimeType,
                actionSegments: r.actionSegments || null,
            })),
            videoURL: results[0].url,
            uploadedAt: serverTimestamp(),
            // status stays 'pending' — onWebSessionUploaded trigger sets it to 'processing'
        });

        uploadInProgress = false;
        activeUploadTasks = [];
        window.removeEventListener('beforeunload', beforeUnloadHandler);
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
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Videos';
        submitBtn.classList.remove('uploading-btn');
        if (cancelBtn) cancelBtn.textContent = 'Cancel';
        errorEl.textContent = `Upload failed: ${err.message}`;
        errorEl.style.display = 'block';
        progressBar.style.display = 'none';
    }
}
