import { CV_WIDTH, CV_HEIGHT, state } from './state.js';

export function createCVController({
    videoEl,
    previewCanvas,
    placeholderEl,
    cameraSelectEl,
    gameCanvas,
    onMotionHit,
    onStatusChange
}) {
    const previewCtx = previewCanvas.getContext('2d');
    const cvCanvas = document.createElement('canvas');
    cvCanvas.width = CV_WIDTH;
    cvCanvas.height = CV_HEIGHT;
    const cvCtx = cvCanvas.getContext('2d', { willReadFrequently: true });

    let cameraStream = null;
    let previousGrayFrame = null;
    let cvInterval = null;

    async function populateCameraList() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(d => d.kind === 'videoinput');
            const savedId = state.settings.selectedCameraId || cameraSelectEl.value;

            cameraSelectEl.innerHTML = '<option value="">Автовыбор (внешняя USB)</option>';
            videoInputs.forEach((dev, idx) => {
                const opt = document.createElement('option');
                opt.value = dev.deviceId;
                opt.textContent = dev.label || `Камера #${idx + 1}`;
                cameraSelectEl.appendChild(opt);
            });

            if (savedId && videoInputs.some(d => d.deviceId === savedId)) {
                cameraSelectEl.value = savedId;
            }
        } catch (err) {
            console.warn('Не удалось получить список камер:', err);
        }
    }

    async function startCamera() {
        stopCamera();
        try {
            const selectedId = state.settings.selectedCameraId || cameraSelectEl.value;
            const videoConstraints = {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            };

            if (selectedId) {
                videoConstraints.deviceId = { exact: selectedId };
            } else {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(d => d.kind === 'videoinput');
                if (videoInputs.length > 1) {
                    const external = videoInputs.find(d => {
                        const lbl = d.label.toLowerCase();
                        return lbl && !lbl.includes('integrated') && !lbl.includes('built-in') && !lbl.includes('facetime');
                    });
                    if (external) {
                        videoConstraints.deviceId = { exact: external.deviceId };
                    }
                }
            }

            cameraStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
            videoEl.srcObject = cameraStream;
            await videoEl.play();

            await populateCameraList();

            state.isCameraActive = true;
            previousGrayFrame = null;
            placeholderEl.style.display = 'none';
            onStatusChange('Камера 720p активна', 'active');

            cvInterval = setInterval(processCameraFrame, 50);
        } catch (err) {
            console.error('Ошибка запуска камеры:', err);
            onStatusChange('Ошибка доступа к камере', 'error');
        }
    }

    function stopCamera() {
        if (cvInterval) {
            clearInterval(cvInterval);
            cvInterval = null;
        }
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
        }
        videoEl.srcObject = null;
        previousGrayFrame = null;
        state.isCameraActive = false;
        state.motionBlobs = [];

        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        placeholderEl.style.display = 'flex';
        onStatusChange(
            state.isGameRunning ? 'Игра запущена (мышь)' : 'Система готова',
            state.isGameRunning ? 'active' : ''
        );
    }

    function getRoiBounds() {
        const x1 = Math.floor((state.settings.roiLeft / 100) * CV_WIDTH);
        const x2 = Math.floor(CV_WIDTH - (state.settings.roiRight / 100) * CV_WIDTH);
        const y1 = Math.floor((state.settings.roiTop / 100) * CV_HEIGHT);
        const y2 = Math.floor(CV_HEIGHT - (state.settings.roiBottom / 100) * CV_HEIGHT);
        return {
            x1,
            y1,
            w: Math.max(10, x2 - x1),
            h: Math.max(10, y2 - y1)
        };
    }

    function processCameraFrame() {
        if (!state.isCameraActive || videoEl.readyState < 2) return;

        cvCtx.save();
        if (state.settings.mirrorCamera) {
            cvCtx.translate(CV_WIDTH, 0);
            cvCtx.scale(-1, 1);
        }
        cvCtx.drawImage(videoEl, 0, 0, CV_WIDTH, CV_HEIGHT);
        cvCtx.restore();

        const frameData = cvCtx.getImageData(0, 0, CV_WIDTH, CV_HEIGHT);
        const data = frameData.data;
        const totalPixels = CV_WIDTH * CV_HEIGHT;
        const currentGray = new Uint8Array(totalPixels);

        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            currentGray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        }

        const roi = getRoiBounds();

        if (!previousGrayFrame) {
            previousGrayFrame = currentGray;
            drawCameraPreview(roi, null);
            return;
        }

        const threshold = Math.max(12, 70 - state.settings.sensitivity * 5.5);
        const binaryMask = new Uint8Array(totalPixels);

        for (let y = roi.y1; y < roi.y1 + roi.h; y++) {
            const rowOffset = y * CV_WIDTH;
            for (let x = roi.x1; x < roi.x1 + roi.w; x++) {
                const idx = rowOffset + x;
                if (Math.abs(currentGray[idx] - previousGrayFrame[idx]) > threshold) {
                    binaryMask[idx] = 1;
                }
            }
        }

        previousGrayFrame = currentGray;

        const blobs = findMotionBlobs(binaryMask, roi);
        const now = performance.now();

        state.motionBlobs = blobs.map(blob => {
            const normX = (blob.cx - roi.x1) / roi.w;
            const normY = (blob.cy - roi.y1) / roi.h;
            return {
                x: normX * gameCanvas.width,
                y: normY * gameCanvas.height,
                radius: Math.min(90, Math.max(18, Math.sqrt(blob.pixels) * 3.2)),
                born: now
            };
        });

        if (state.isGameRunning && state.motionBlobs.length > 0) {
            for (const blob of state.motionBlobs) {
                onMotionHit(blob.x, blob.y, blob.radius);
            }
        }

        if (!document.body.classList.contains('fullscreen-game')) {
            drawCameraPreview(roi, binaryMask);
        }
    }

    function findMotionBlobs(mask, roi) {
        const visited = new Uint8Array(CV_WIDTH * CV_HEIGHT);
        const blobs = [];
        const minPixels = state.settings.minBlobSize;
        const maxX = roi.x1 + roi.w;
        const maxY = roi.y1 + roi.h;

        for (let y = roi.y1; y < maxY; y += 2) {
            for (let x = roi.x1; x < maxX; x += 2) {
                const startIdx = y * CV_WIDTH + x;
                if (mask[startIdx] === 1 && visited[startIdx] === 0) {
                    const stack = [x, y];
                    let pixels = 0;
                    let sumX = 0;
                    let sumY = 0;

                    while (stack.length > 0) {
                        const cy = stack.pop();
                        const cx = stack.pop();
                        if (cx < roi.x1 || cx >= maxX || cy < roi.y1 || cy >= maxY) continue;
                        const idx = cy * CV_WIDTH + cx;
                        if (visited[idx] === 1 || mask[idx] === 0) continue;

                        visited[idx] = 1;
                        pixels++;
                        sumX += cx;
                        sumY += cy;

                        stack.push(cx + 2, cy, cx - 2, cy, cx, cy + 2, cx, cy - 2);
                    }

                    if (pixels * 4 >= minPixels) {
                        blobs.push({
                            cx: sumX / pixels,
                            cy: sumY / pixels,
                            pixels: pixels * 4
                        });
                    }
                }
            }
        }
        return blobs;
    }

    function drawCameraPreview(roi, binaryMask) {
        if (state.settings.showMotionMask && binaryMask) {
            const img = previewCtx.createImageData(CV_WIDTH, CV_HEIGHT);
            for (let i = 0; i < binaryMask.length; i++) {
                const val = binaryMask[i] ? 255 : 0;
                const p = i * 4;
                img.data[p] = val;
                img.data[p + 1] = val ? 80 : 0;
                img.data[p + 2] = val ? 80 : 0;
                img.data[p + 3] = 255;
            }
            previewCtx.putImageData(img, 0, 0);
        } else {
            previewCtx.drawImage(cvCanvas, 0, 0);
        }

        previewCtx.strokeStyle = '#4ade80';
        previewCtx.lineWidth = 2;
        previewCtx.strokeRect(roi.x1, roi.y1, roi.w, roi.h);
    }

    return {
        populateCameraList,
        startCamera,
        stopCamera
    };
}