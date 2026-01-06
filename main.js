const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const startBtn = document.getElementById("startBtn");
const ui = document.getElementById("ui");
const statusBox = document.getElementById("status");

let running = false;
let prevCx = 0, prevCy = 0;
const SMOOTHING = 0.7;

function waitForCVReady() {
  // If cv isn't defined yet, keep waiting.
  if (typeof cv === "undefined" || !cv || !cv.Mat) {
    statusBox.textContent = "Loading vision engine…";
    setTimeout(waitForCVReady, 50);
    return;
  }

  // If OpenCV needs runtime init, wait for it.
  cv.onRuntimeInitialized = () => {
    startBtn.disabled = false;
    startBtn.textContent = "Start AR Camera";
    statusBox.textContent = "Engine ready. Click Start.";
  };

  // Some builds may already be initialized; enable anyway after a short delay.
  setTimeout(() => {
    if (startBtn.disabled) {
      startBtn.disabled = false;
      startBtn.textContent = "Start AR Camera";
      statusBox.textContent = "Engine ready. Click Start.";
    }
  }, 500);
}

startBtn.addEventListener("click", () => {
  statusBox.textContent = "Requesting camera…";

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  }).then(stream => {
    video.srcObject = stream;

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ui.style.display = "none";
      video.style.display = "block";
      canvas.style.display = "block";

      running = true;
      statusBox.textContent = "Detecting shapes…";
      requestAnimationFrame(processFrame);
    };
  }).catch(err => {
    console.error(err);
    statusBox.textContent = "Camera permission denied / unavailable";
  });
});

function processFrame() {
  if (!running) return;

  // Draw current frame to canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Read canvas into OpenCV
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.Canny(blur, edges, 80, 150);
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // Clear overlay and draw results
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    if (cv.contourArea(cnt) < 3000) continue;

    const approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.04 * cv.arcLength(cnt, true), true);

    let shape = "Object";
    if (approx.rows === 3) shape = "Triangle";
    else if (approx.rows === 4) shape = "Rectangle";
    else if (approx.rows > 6) shape = "Circle";

    const rect = cv.boundingRect(cnt);
    const cxRaw = rect.x + rect.width / 2;
    const cyRaw = rect.y + rect.height / 2;

    const cx = SMOOTHING * prevCx + (1 - SMOOTHING) * cxRaw;
    const cy = SMOOTHING * prevCy + (1 - SMOOTHING) * cyRaw;
    prevCx = cx;
    prevCy = cy;

    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(cx - 70, cy - 50, 140, 28);

    ctx.fillStyle = "#fff";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(shape, cx, cy - 30);

    approx.delete();
  }

  src.delete();
  gray.delete();
  blur.delete();
  edges.delete();
  contours.delete();
  hierarchy.delete();

  requestAnimationFrame(processFrame);
}

waitForCVReady();
