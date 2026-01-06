const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const overlayCtx = overlay.getContext("2d");

const proc = document.getElementById("proc");
const procCtx = proc.getContext("2d");

const startBtn = document.getElementById("startBtn");
const ui = document.getElementById("ui");
const statusBox = document.getElementById("status");

let running = false;
let prevCx = 0, prevCy = 0;
const SMOOTHING = 0.7;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function ensureOpenCV() {
  statusBox.textContent = "Loading vision engine…";

  // CDN first (reliable). Cache-busted.
  try {
    await loadScript("https://docs.opencv.org/4.x/opencv.js?v=" + Date.now());
  } catch (e) {
    console.warn("CDN OpenCV failed, trying local ./opencv.js", e);
    await loadScript("./opencv.js?v=" + Date.now());
  }

  while (typeof cv === "undefined" || !cv) {
    await new Promise(r => setTimeout(r, 50));
  }

  await new Promise(resolve => {
    // Some builds are already ready
    if (cv.Mat) return resolve();
    cv.onRuntimeInitialized = resolve;
  });

  startBtn.disabled = false;
  startBtn.textContent = "Start AR Camera";
  statusBox.textContent = "Engine ready. Click Start.";
}

startBtn.addEventListener("click", async () => {
  statusBox.textContent = "Requesting camera…";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });

    video.srcObject = stream;

    video.onloadedmetadata = () => {
      // Match internal pixel sizes to the camera feed for correct CV geometry
      const w = video.videoWidth;
      const h = video.videoHeight;

      // Visible layers
      video.style.display = "block";
      overlay.style.display = "block";

      // IMPORTANT: set canvas pixel dimensions (not just CSS)
      overlay.width = w;
      overlay.height = h;

      proc.width = w;
      proc.height = h;

      // Hide landing UI
      ui.style.display = "none";

      running = true;
      statusBox.textContent = "Detecting shapes…";
      requestAnimationFrame(processFrame);
    };
  } catch (err) {
    console.error(err);
    statusBox.textContent = "Camera permission denied / unavailable";
  }
});

function processFrame() {
  if (!running) return;

  // 1) Draw video to HIDDEN processing canvas (for OpenCV)
  procCtx.drawImage(video, 0, 0, proc.width, proc.height);

  // 2) Read that canvas into OpenCV
  const src = cv.imread(proc);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.Canny(blur, edges, 80, 150);

  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // 3) Clear ONLY the overlay (video stays visible in <video>)
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < 3000) continue;

    const approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.04 * cv.arcLength(cnt, true), true);

    let shape = "Object";
    if (approx.rows === 3) shape = "Triangle";
    else if (approx.rows === 4) shape = "Rectangle";
    else if (approx.rows > 6) shape = "Circle";

    const rect = cv.boundingRect(cnt);

    // Smoothed label anchor for nicer AR feel
    const cxRaw = rect.x + rect.width / 2;
    const cyRaw = rect.y + rect.height / 2;

    const cx = SMOOTHING * prevCx + (1 - SMOOTHING) * cxRaw;
    const cy = SMOOTHING * prevCy + (1 - SMOOTHING) * cyRaw;
    prevCx = cx;
    prevCy = cy;

    // Draw bounding box
    overlayCtx.strokeStyle = "#00ff88";
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    // Draw label bubble
    overlayCtx.fillStyle = "rgba(0,0,0,0.65)";
    overlayCtx.fillRect(cx - 70, cy - 50, 140, 28);

    overlayCtx.fillStyle = "#fff";
    overlayCtx.font = "16px Arial";
    overlayCtx.textAlign = "center";
    overlayCtx.fillText(shape, cx, cy - 30);

    approx.delete();
  }

  // Cleanup mats
  src.delete();
  gray.delete();
  blur.delete();
  edges.delete();
  contours.delete();
  hierarchy.delete();

  requestAnimationFrame(processFrame);
}

// Boot
ensureOpenCV().catch(err => {
  console.error(err);
  statusBox.textContent = "Failed to load OpenCV (network / URL issue)";
});
