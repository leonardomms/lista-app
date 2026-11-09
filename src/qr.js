/* Leitura de QR pela câmera, sem plugin: BarcodeDetector onde existe (Chrome/Android), senão jsQR (iPhone/Safari).
   Precisa de HTTPS (ou localhost). Para sozinho se o <video> sair da tela. */
export const temCamera = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext !== false;

/* abre a câmera traseira no <video> e chama onText(texto) na primeira leitura; devolve stop(). Rejeita se a câmera for negada. */
export async function lerQR(video, onText){
  const stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: "environment"}}, audio: false});
  let parado = false;
  const stop = () => { parado = true; stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
  try {
    video.setAttribute("playsinline", ""); video.muted = true; video.srcObject = stream;
    await video.play();
    let det = null, jsQR = null;
    if ("BarcodeDetector" in window) { try { det = new window.BarcodeDetector({formats: ["qr_code"]}); } catch(e){} }
    if (!det) jsQR = (await import("jsqr")).default;
    const cv = document.createElement("canvas"), cx = cv.getContext("2d", {willReadFrequently: true});
    const tick = async () => {
      if (parado) return;
      if (!video.isConnected) { stop(); return; }
      if (video.readyState >= 2 && video.videoWidth) {
        try {
          let txt = null;
          if (det) { const r = await det.detect(video); txt = r[0] && r[0].rawValue; }
          else {
            const k = Math.min(1, 960 / video.videoWidth), w = Math.round(video.videoWidth * k), h = Math.round(video.videoHeight * k);
            cv.width = w; cv.height = h; cx.drawImage(video, 0, 0, w, h);
            const q = jsQR(cx.getImageData(0, 0, w, h).data, w, h, {inversionAttempts: "dontInvert"});
            txt = q && q.data;
          }
          if (txt && !parado) { stop(); onText(txt); return; }
        } catch(e){}
      }
      setTimeout(tick, det ? 150 : 220);
    };
    tick();
  } catch(e){ stop(); throw e; }
  return stop;
}
