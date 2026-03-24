/**
 * motion-detect.js
 * 
 * Client-side motion detection using HTML5 Canvas.
 * 1. Samples video frames at low resolution every 1s
 * 2. Computes frame-to-frame pixel difference (motion score)
 * 3. Returns action segments (time ranges above threshold)
 * 4. Extracts merged segments ± padding as a single Blob at 16x speed
 */

const SAMPLE_INTERVAL_S = 1;     // sample 1 frame every N seconds (was 2s)
const SAMPLE_WIDTH = 320;        // low-res width for comparison
const SAMPLE_HEIGHT = 180;       // low-res height
const MOTION_THRESHOLD = 0.04;   // fraction of pixels that must change (0–1)
const PADDING_S = 8;             // seconds to pad around each action segment (was 30s)
const MIN_SEGMENT_GAP_S = 5;     // merge segments closer than this (was 15s)
const PLAYBACK_RATE = 16;        // speed multiplier for clip extraction

/**
 * Detect action segments in a video File.
 * @param {File} file - The video file
 * @param {(progress: number) => void} onProgress - 0..1 progress callback
 * @returns {Promise<Array<{start: number, end: number}>>} time ranges in seconds
 */
export async function detectActionSegments(file, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.preload = 'metadata';

        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_WIDTH;
        canvas.height = SAMPLE_HEIGHT;
        const ctx = canvas.getContext('2d');

        video.addEventListener('loadedmetadata', async () => {
            const duration = video.duration;
            if (!duration || duration < 1) {
                URL.revokeObjectURL(url);
                // Can't scan — treat whole thing as action
                resolve([{ start: 0, end: duration || 0 }]);
                return;
            }

            const totalFrames = Math.floor(duration / SAMPLE_INTERVAL_S);
            let prevImageData = null;
            const hotTimes = []; // timestamps (seconds) with high motion

            for (let i = 0; i <= totalFrames; i++) {
                const t = i * SAMPLE_INTERVAL_S;
                try {
                    await seekTo(video, t);
                    ctx.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
                    const imageData = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);

                    if (prevImageData) {
                        const score = motionScore(prevImageData.data, imageData.data);
                        if (score > MOTION_THRESHOLD) {
                            hotTimes.push(t);
                        }
                    }
                    prevImageData = imageData;
                } catch (_) {
                    // Seek failed — skip this frame
                }
                onProgress(i / totalFrames);
            }

            URL.revokeObjectURL(url);

            if (hotTimes.length === 0) {
                // No motion detected — return full video
                resolve([{ start: 0, end: duration }]);
                return;
            }

            // Build segments: each hot time → [t - padding, t + padding]
            const raw = hotTimes.map(t => ({
                start: Math.max(0, t - PADDING_S),
                end: Math.min(duration, t + PADDING_S),
            }));

            // Merge overlapping / close segments
            const merged = mergeSegments(raw, MIN_SEGMENT_GAP_S);
            resolve(merged);
        });

        video.addEventListener('error', (e) => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load video for motion detection: ' + (e.message || '')));
        });
    });
}

/**
 * Compute the fraction of pixels that differ significantly between two frames.
 */
function motionScore(a, b) {
    const CHANGE_THRESHOLD = 25; // per-channel change to count as "different"
    let changed = 0;
    const totalPixels = a.length / 4;
    for (let i = 0; i < a.length; i += 4) {
        const dr = Math.abs(a[i]     - b[i]);
        const dg = Math.abs(a[i + 1] - b[i + 1]);
        const db = Math.abs(a[i + 2] - b[i + 2]);
        if (dr > CHANGE_THRESHOLD || dg > CHANGE_THRESHOLD || db > CHANGE_THRESHOLD) {
            changed++;
        }
    }
    return changed / totalPixels;
}

/**
 * Merge overlapping or nearby segments.
 */
function mergeSegments(segments, gapThreshold) {
    if (segments.length === 0) return [];
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const result = [{ ...sorted[0] }];
    for (let i = 1; i < sorted.length; i++) {
        const last = result[result.length - 1];
        if (sorted[i].start - last.end <= gapThreshold) {
            last.end = Math.max(last.end, sorted[i].end);
        } else {
            result.push({ ...sorted[i] });
        }
    }
    return result;
}

/**
 * Seek a video element to a specific time and wait for seeked event.
 */
function seekTo(video, time) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Seek timeout')), 5000);
        video.addEventListener('seeked', () => { clearTimeout(timeout); resolve(); }, { once: true });
        video.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Seek error')); }, { once: true });
        video.currentTime = time;
    });
}

/**
 * Extract only action segments from a video File as a new Blob.
 * Uses a hidden video + MediaRecorder at 16x playback speed for fast extraction.
 * 
 * @param {File} file - Source video file
 * @param {Array<{start, end}>} segments - Time ranges to extract
 * @param {(progress: number) => void} onProgress - 0..1 progress callback
 * @returns {Promise<Blob>} - Merged clip blob
 */
export async function extractActionClip(file, segments, onProgress = () => {}) {
    // If segments cover nearly the full video or MediaRecorder isn't supported, return original
    if (!window.MediaRecorder) return file;

    const totalDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
    const fileDuration = await getVideoDuration(file);

    // If we're keeping >85% of the video, don't bother trimming
    if (totalDuration / fileDuration > 0.85) {
        console.log('[motion] Segments cover >85% of video — skipping trim');
        onProgress(1);
        return file;
    }

    console.log(`[motion] Extracting ${segments.length} segment(s), ${totalDuration.toFixed(0)}s of ${fileDuration.toFixed(0)}s total (${PLAYBACK_RATE}x speed)`);

    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;

        // Find a supported MIME type
        const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
            m => MediaRecorder.isTypeSupported(m)
        ) || '';

        const chunks = [];
        let recorder = null;
        let segIndex = 0;
        let totalRecorded = 0;

        async function recordNextSegment() {
            if (segIndex >= segments.length) {
                // All segments done
                recorder?.stop();
                return;
            }

            const seg = segments[segIndex++];
            await seekTo(video, seg.start).catch(() => {});

            // Set high playback rate for fast extraction
            video.playbackRate = PLAYBACK_RATE;
            video.play().catch(() => {});

            const segDur = seg.end - seg.start;

            const checkEnd = setInterval(() => {
                const elapsed = video.currentTime - seg.start;
                totalRecorded = segments.slice(0, segIndex - 1).reduce((s, seg) => s + (seg.end - seg.start), 0) + Math.min(elapsed, segDur);
                onProgress(Math.min(totalRecorded / totalDuration, 0.99));

                if (video.currentTime >= seg.end - 0.1) {
                    clearInterval(checkEnd);
                    video.pause();
                    recordNextSegment();
                }
            }, 100); // Check more frequently since we're at high speed

            // Safety timeout (adjusted for playback rate)
            const safetyTimeoutMs = ((segDur / PLAYBACK_RATE) + 3) * 1000;
            setTimeout(() => clearInterval(checkEnd), safetyTimeoutMs);
        }

        video.addEventListener('loadedmetadata', async () => {
            try {
                const stream = video.captureStream?.() || video.mozCaptureStream?.();
                if (!stream) {
                    // captureStream not supported — return original
                    URL.revokeObjectURL(url);
                    onProgress(1);
                    resolve(file);
                    return;
                }

                recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
                recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
                recorder.onstop = () => {
                    URL.revokeObjectURL(url);
                    const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
                    const savedPct = ((1 - blob.size / file.size) * 100).toFixed(0);
                    console.log(`[motion] Trimmed clip: ${(blob.size / 1048576).toFixed(1)} MB (was ${(file.size / 1048576).toFixed(1)} MB, saved ${savedPct}%)`);
                    onProgress(1);
                    resolve(blob);
                };
                recorder.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; // fallback

                recorder.start(500); // collect in 500ms chunks for finer granularity at high speed
                await recordNextSegment();
            } catch (err) {
                URL.revokeObjectURL(url);
                console.warn('[motion] Clip extraction failed, using original:', err);
                resolve(file); // graceful fallback
            }
        });

        video.addEventListener('error', () => {
            URL.revokeObjectURL(url);
            resolve(file); // graceful fallback
        });
    });
}

/**
 * Get video duration from a File.
 */
function getVideoDuration(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.src = url;
        v.preload = 'metadata';
        v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration || 0); };
        v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    });
}
