cv['onRuntimeInitialized'] = () => {
  console.log("OpenCV is ready");
  startCamera();
};

navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" }
}).then(stream => {
  video.srcObject = stream;
});
