const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("startBtn");
const ui = document.getElementById("ui");
const statusBox = document.getElementById("status");

let prevCx = 0, prevCy = 0;
const SMOOTHING = 0.7;
let running = false;

cv.onRuntimeInitialized = () => {
  statusBox.textContent = "OpenCV ready. Click Start.";
};

startBtn.onclick = () => {
  statusBox.textContent = "Starting camera…";
  startCamera();
};

function startCamera() {
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
    statusBox.textContent = "Camera access denied";
    console.error(err);
  });
}

function processFrame() {
  if (!running) return;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  let src = cv.imread(canvas);
  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let edges = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.Canny(blur, edges, 80, 150);
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

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
    ctx.fillRect(cx - 60, cy - 45, 120, 26);

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(shape, cx, cy - 26);

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
