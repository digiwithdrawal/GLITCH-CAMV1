/* Glitch Cam V1 — Scan / Blocks / Warp
   - Keeps ratio system + photo/video capture
   - One Strength slider (0..100)
   - Low-opacity HUD + robotic font
   - iOS-safe START button for permission
*/

const $ = (id) => document.getElementById(id);

const overlay = $("startOverlay");
const startBtn = $("startBtn");
const errBox = $("errBox");

function logErr(msg){
  errBox.textContent = (errBox.textContent ? errBox.textContent + "\n\n" : "") + msg;
}
function clearErr(){ errBox.textContent = ""; }

const video = $("vid");
const screen = $("screen");
const sctx = screen.getContext("2d", { willReadFrequently: true });

// true output canvas
const frame = document.createElement("canvas");
const fctx = frame.getContext("2d", { willReadFrequently: true });

// scratch canvases for glitch passes
const scratchA = document.createElement("canvas");
const sActx = scratchA.getContext("2d", { willReadFrequently: true });
const scratchB = document.createElement("canvas");
const sBctx = scratchB.getContext("2d", { willReadFrequently: true });

const ui = {
  panel: $("panel"),
  showHud: $("showHud"),
  hud: $("hud"),
  tip: $("tip"),

  flip: $("flip"),
  snap: $("snap"),
  rec: $("rec"),

  format: $("format"),
  style: $("style"),

  s_strength: $("s_strength"),
  s_res: $("s_res"),
};

let facingMode = "environment";
let stream = null;
let lastKey = "";

// HUD hide/show
let hudHidden = false;
function setHudHidden(v){
  hudHidden = !!v;
  ui.panel.classList.toggle("hidden", hudHidden);
  ui.showHud.classList.toggle("show", hudHidden);
  ui.hud.textContent = hudHidden ? "SHOW HUD" : "HIDE HUD";
}
setHudHidden(false);

// Recording
let recorder = null;
let recChunks = [];
let isRecording = false;

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function rand(n=1){ return Math.random() * n; }
function lerp(a,b,t){ return a + (b-a)*t; }

function viewportSize(){
  const vw = Math.floor(window.visualViewport?.width || window.innerWidth);
  const vh = Math.floor(window.visualViewport?.height || window.innerHeight);
  return { vw, vh };
}
function deviceIsLandscape(){
  const { vw, vh } = viewportSize();
  return vw > vh;
}
function chosenMode(){
  const m = ui.format.value;
  if (m === "auto") return deviceIsLandscape() ? "landscape" : "portrait";
  return m;
}
function modeAspect(mode){
  if (mode === "square") return 1;
  if (mode === "landscape") return 16/9;
  // portrait-ish clamp based on viewport
  const { vw, vh } = viewportSize();
  return clamp(vw / vh, 9/19.5, 9/14);
}

function resizeAll(){
  const { vw, vh } = viewportSize();
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  screen.width = Math.floor(vw * dpr);
  screen.height = Math.floor(vh * dpr);

  const res = parseInt(ui.s_res.value, 10); // short side
  const mode = chosenMode();
  const ar = modeAspect(mode);

  let fw, fh;
  if (ar >= 1){ fh = res; fw = Math.round(res * ar); }
  else { fw = res; fh = Math.round(res / ar); }

  frame.width = fw;
  frame.height = fh;

  scratchA.width = fw;
  scratchA.height = fh;
  scratchB.width = fw;
  scratchB.height = fh;

  ui.tip.innerHTML = `Mode: <b>${mode.toUpperCase()}</b> • Output: <b>${fw}×${fh}</b>`;
}

// Draw video cropped-to-fit (no stretching)
function drawVideoCoverTo(ctx, W, H){
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const srcA = vw / vh;
  const dstA = W / H;

  let sx=0, sy=0, sW=vw, sH=vh;
  if (srcA > dstA){
    sH = vh;
    sW = vh * dstA;
    sx = (vw - sW)/2;
  } else {
    sW = vw;
    sH = vw / dstA;
    sy = (vh - sH)/2;
  }
  ctx.drawImage(video, sx, sy, sW, sH, 0, 0, W, H);
}

// Letterbox contain draw frame -> screen
function drawFrameToScreen(){
  const SW = screen.width, SH = screen.height;
  const FW = frame.width, FH = frame.height;

  const scale = Math.min(SW/FW, SH/FH);
  const dw = Math.round(FW*scale);
  const dh = Math.round(FH*scale);
  const dx = Math.floor((SW - dw)/2);
  const dy = Math.floor((SH - dh)/2);

  sctx.save();
  sctx.setTransform(1,0,0,1,0,0);
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = "#000";
  sctx.fillRect(0,0,SW,SH);
  sctx.drawImage(frame, 0,0,FW,FH, dx,dy,dw,dh);
  sctx.restore();
}

/* ---------- GLITCH CORE ---------- */

let t = 0;
let prevFrame = null;

function applyChromaSplit(ctx, strength01){
  // draw RGB layers offset
  const W = frame.width, H = frame.height;
  const maxOff = lerp(0, 10, strength01);

  const ox1 = (rand(2)-1)*maxOff, oy1 = (rand(2)-1)*maxOff;
  const ox2 = (rand(2)-1)*maxOff, oy2 = (rand(2)-1)*maxOff;
  const ox3 = (rand(2)-1)*maxOff, oy3 = (rand(2)-1)*maxOff;

  // base
  sActx.clearRect(0,0,W,H);
  sActx.drawImage(frame,0,0);

  // R
  sBctx.clearRect(0,0,W,H);
  sBctx.globalCompositeOperation = "source-over";
  sBctx.drawImage(scratchA, ox1, oy1);

  sBctx.globalCompositeOperation = "source-in";
  sBctx.fillStyle = "rgba(255,0,0,0.90)";
  sBctx.fillRect(0,0,W,H);

  // G
  sActx.clearRect(0,0,W,H);
  sActx.drawImage(scratchA, ox2, oy2);
  sActx.globalCompositeOperation = "source-in";
  sActx.fillStyle = "rgba(0,255,0,0.75)";
  sActx.fillRect(0,0,W,H);

  // B
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = lerp(0.0, 0.85, strength01);
  ctx.drawImage(scratchB,0,0);
  ctx.drawImage(scratchA,0,0);
  ctx.restore();

  // blue
  sBctx.clearRect(0,0,W,H);
  sBctx.globalCompositeOperation = "source-over";
  sBctx.drawImage(frame, ox3, oy3);
  sBctx.globalCompositeOperation = "source-in";
  sBctx.fillStyle = "rgba(0,120,255,0.85)";
  sBctx.fillRect(0,0,W,H);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = lerp(0.0, 0.70, strength01);
  ctx.drawImage(sBctx.canvas,0,0);
  ctx.restore();
}

function scanSlices(ctx, strength01){
  // horizontal slice tearing + occasional big rips
  const W = frame.width, H = frame.height;

  const slices = Math.floor(lerp(0, 26, strength01));
  for (let i=0; i<slices; i++){
    const y = Math.floor(rand(H));
    const h = Math.floor(lerp(2, 18, strength01) + rand(6));
    const shift = Math.floor((rand(2)-1) * lerp(0, 90, strength01));

    ctx.drawImage(ctx.canvas, 0, y, W, h, shift, y, W, h);
  }

  // big “scan rip”
  if (Math.random() < lerp(0.02, 0.22, strength01)){
    const bandY = Math.floor(rand(H*0.8));
    const bandH = Math.floor(lerp(10, 70, strength01));
    const sh = Math.floor((rand(2)-1) * lerp(40, 180, strength01));
    ctx.drawImage(ctx.canvas, 0, bandY, W, bandH, sh, bandY, W, bandH);
  }
}

function blockTear(ctx, strength01){
  // chunky compression blocks that drift
  const W = frame.width, H = frame.height;
  const n = Math.floor(lerp(0, 60, strength01));
  for (let i=0;i<n;i++){
    const bw = Math.floor(lerp(12, 90, strength01) + rand(40));
    const bh = Math.floor(lerp(8, 60, strength01) + rand(30));
    const x = Math.floor(rand(W - bw));
    const y = Math.floor(rand(H - bh));
    const dx = x + Math.floor((rand(2)-1) * lerp(0, 120, strength01));
    const dy = y + Math.floor((rand(2)-1) * lerp(0, 26, strength01));
    ctx.drawImage(ctx.canvas, x, y, bw, bh, dx, dy, bw, bh);
  }
}

function warpRipple(ctx, strength01){
  // sine-based row displacement (“generative scan glitch” vibe)
  const W = frame.width, H = frame.height;

  // copy current to scratch
  sActx.clearRect(0,0,W,H);
  sActx.drawImage(ctx.canvas,0,0);

  const amp = lerp(0, 18, strength01);
  const freq = lerp(0.008, 0.028, strength01);
  const speed = lerp(0.6, 2.4, strength01);

  for (let y=0; y<H; y+=2){
    const off = Math.sin(y*freq + t*speed) * amp + Math.sin(y*(freq*0.35) - t*0.9) * (amp*0.35);
    ctx.drawImage(scratchA, 0, y, W, 2, off, y, W, 2);
  }
}

function addFeedback(ctx, strength01){
  // ghost smear using previous frame (very light so it feels like TD feedback)
  if (!prevFrame){
    prevFrame = document.createElement("canvas");
    prevFrame.width = frame.width;
    prevFrame.height = frame.height;
    prevFrame.getContext("2d").drawImage(ctx.canvas,0,0);
    return;
  }
  const pctx = prevFrame.getContext("2d");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = lerp(0.0, 0.22, strength01);
  ctx.drawImage(prevFrame, Math.floor((rand(2)-1)*6*strength01), Math.floor((rand(2)-1)*3*strength01));
  ctx.restore();

  // update prev (slight decay)
  pctx.save();
  pctx.globalAlpha = 0.88;
  pctx.drawImage(ctx.canvas,0,0);
  pctx.restore();
}

function applyContrastNoise(ctx, strength01){
  const W = frame.width, H = frame.height;
  const img = ctx.getImageData(0,0,W,H);
  const d = img.data;

  const c = lerp(1.0, 1.24, strength01);
  const b = lerp(0, 8, strength01);
  const n = lerp(0, 18, strength01);

  for (let i=0;i<d.length;i+=4){
    const nn = (rand(2)-1)*n;
    d[i]   = clamp((d[i]-128)*c + 128 + b + nn, 0, 255);
    d[i+1] = clamp((d[i+1]-128)*c + 128 + b + nn, 0, 255);
    d[i+2] = clamp((d[i+2]-128)*c + 128 + b + nn, 0, 255);
  }
  ctx.putImageData(img,0,0);
}

function renderGlitch(){
  const strength01 = parseInt(ui.s_strength.value,10)/100;
  const style = ui.style.value;

  // base image
  fctx.setTransform(1,0,0,1,0,0);
  fctx.imageSmoothingEnabled = true;
  drawVideoCoverTo(fctx, frame.width, frame.height);

  // optional feedback + contrast/noise
  addFeedback(fctx, strength01);
  applyContrastNoise(fctx, strength01);

  // main deformation
  if (style === "scan"){
    scanSlices(fctx, strength01);
    warpRipple(fctx, strength01*0.8);
    if (Math.random() < lerp(0.04, 0.25, strength01)) blockTear(fctx, strength01*0.8);
  } else if (style === "blocks"){
    blockTear(fctx, strength01);
    scanSlices(fctx, strength01*0.7);
  } else { // warp
    warpRipple(fctx, strength01);
    if (Math.random() < lerp(0.03, 0.18, strength01)) scanSlices(fctx, strength01*0.9);
  }

  // chroma split layer
  applyChromaSplit(fctx, strength01);

  // subtle bloom-ish blur
  if (strength01 > 0.01){
    const blurPx = 3 + strength01*10;
    fctx.save();
    fctx.globalCompositeOperation = "screen";
    fctx.globalAlpha = lerp(0.0, 0.28, strength01);
    fctx.filter = `blur(${blurPx}px)`;
    fctx.drawImage(frame,0,0);
    fctx.filter = "none";
    fctx.restore();
  }
}

/* ---------- SNAP + REC ---------- */
function snapPhoto(){
  const a = document.createElement("a");
  a.download = `glitchcam_${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
  a.href = frame.toDataURL("image/png");
  a.click();
}

function pickMimeType(){
  const opts = ["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"];
  for (const t of opts) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

function startRecording(){
  if (!("MediaRecorder" in window)){
    ui.tip.textContent = "MediaRecorder not supported here.";
    return;
  }
  try{
    const stream = frame.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
    recChunks = [];
    recorder.ondataavailable = (e)=> { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = ()=>{
      const blob = new Blob(recChunks, { type: recorder.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `glitchcam_${new Date().toISOString().replace(/[:.]/g,'-')}.webm`;
      a.href = url;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 2500);
    };
    recorder.start();
    isRecording = true;
    ui.rec.textContent = "STOP";
    ui.tip.textContent = "Recording…";
  }catch(err){
    ui.tip.textContent = `REC failed: ${String(err)}`;
  }
}

function stopRecording(){
  if (recorder && isRecording) recorder.stop();
  isRecording = false;
  ui.rec.textContent = "REC";
  ui.tip.textContent = "Saved.";
}

/* ---------- CAMERA ---------- */
async function startCamera(){
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (location.protocol !== "https:" && !isLocal){
    throw new Error("Camera requires https:// on iPhone Safari.");
  }
  if (!navigator.mediaDevices?.getUserMedia){
    throw new Error("getUserMedia not available.");
  }

  if (stream) stream.getTracks().forEach(t => t.stop());

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width:{ideal:1280}, height:{ideal:720} },
    audio: false
  });

  video.srcObject = stream;

  await new Promise((res, rej)=>{
    video.onloadedmetadata = ()=>res();
    setTimeout(()=>rej(new Error("Video metadata timeout")), 4500);
  });

  resizeAll();
  requestAnimationFrame(loop);
}

function loop(){
  const key = [
    chosenMode(),
    ui.format.value,
    ui.s_res.value,
    (window.visualViewport?.width||0),
    (window.visualViewport?.height||0),
    video.videoWidth, video.videoHeight
  ].join("|");

  if (key !== lastKey){
    lastKey = key;
    resizeAll();
    prevFrame = null; // reset feedback when resizing/format changes
  }

  t += 0.016;

  // render effect into frame
  renderGlitch();

  // show
  drawFrameToScreen();

  requestAnimationFrame(loop);
}

/* ---------- UI wiring ---------- */
ui.hud.addEventListener("click", ()=> setHudHidden(!hudHidden));
ui.showHud.addEventListener("click", ()=> setHudHidden(false));

ui.snap.addEventListener("click", snapPhoto);
ui.rec.addEventListener("click", ()=> isRecording ? stopRecording() : startRecording());

ui.flip.addEventListener("click", async ()=>{
  facingMode = (facingMode === "environment") ? "user" : "environment";
  try{ await startCamera(); } catch(err){ logErr(String(err)); }
});

ui.format.addEventListener("change", ()=> { lastKey=""; resizeAll(); });
ui.style.addEventListener("change", ()=> { /* no-op */ });
ui.s_res.addEventListener("input", ()=> { lastKey=""; resizeAll(); });

if (window.visualViewport){
  window.visualViewport.addEventListener("resize", ()=> { lastKey=""; resizeAll(); });
  window.visualViewport.addEventListener("scroll", ()=> { lastKey=""; resizeAll(); });
}
window.addEventListener("orientationchange", ()=> { lastKey=""; resizeAll(); });
window.addEventListener("resize", ()=> { lastKey=""; resizeAll(); });

// START (permission)
startBtn.addEventListener("click", async ()=>{
  clearErr();
  ui.tip.textContent = "Starting camera…";
  try{
    await startCamera();
    overlay.style.display = "none";
    ui.tip.textContent = "Running.";
  }catch(err){
    logErr(String(err));
    ui.tip.textContent = "Failed. See error.";
  }
});
