const $ = (id) => document.getElementById(id);

const els = {
  videoFile: $('videoFile'),
  videoPreview: $('videoPreview'),
  frameTime: $('frameTime'),
  grabFrame: $('grabFrame'),
  frameCanvas: $('frameCanvas'),
  framePreview: $('framePreview'),
  manualUrl: $('manualUrl'),
  prompt: $('prompt'),
  cameraMotion: $('cameraMotion'),
  resolution: $('resolution'),
  duration: $('duration'),
  generate: $('generate'),
  status: $('status'),
  resultVideo: $('resultVideo'),
  glbFile: $('glbFile'),
  modelViewer: $('modelViewer'),
};

let lastImageUrl = null;

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.style.color = isError ? '#ff7a7a' : '';
}

function refreshGenerateEnabled() {
  els.generate.disabled = !(lastImageUrl || els.manualUrl.value.trim());
}

els.videoFile.addEventListener('change', () => {
  const file = els.videoFile.files?.[0];
  if (!file) return;
  els.videoPreview.src = URL.createObjectURL(file);
});

els.manualUrl.addEventListener('input', refreshGenerateEnabled);

els.grabFrame.addEventListener('click', async () => {
  const video = els.videoPreview;
  if (!video.src) {
    setStatus('Pick a video first.', true);
    return;
  }
  const t = Number(els.frameTime.value) || 0;
  await new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', () => reject(new Error('video error')), { once: true });
    try {
      video.currentTime = Math.min(t, Math.max(0, (video.duration || 0) - 0.05));
    } catch (e) {
      reject(e);
    }
  });

  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const canvas = els.frameCanvas;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) {
    setStatus('Could not extract frame from video.', true);
    return;
  }

  els.framePreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = URL.createObjectURL(blob);
  els.framePreview.appendChild(img);

  setStatus('Uploading frame…');
  const res = await fetch('/api/upload-frame', {
    method: 'POST',
    headers: { 'content-type': 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) {
    setStatus(`Upload failed: ${res.status}`, true);
    return;
  }
  const data = await res.json();
  lastImageUrl = data.url;
  setStatus(
    `Frame uploaded → ${data.url}` + (data.note ? ` — ${data.note}` : ''),
    Boolean(data.isLocal),
  );
  refreshGenerateEnabled();
});

els.generate.addEventListener('click', async () => {
  els.generate.disabled = true;
  els.resultVideo.removeAttribute('src');
  const imageUrl = els.manualUrl.value.trim() || lastImageUrl;
  if (!imageUrl) {
    setStatus('Need a frame URL first.', true);
    els.generate.disabled = false;
    return;
  }
  setStatus('Submitting to Luma…');
  let createRes;
  try {
    createRes = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        prompt: els.prompt.value,
        cameraMotion: els.cameraMotion.value || undefined,
        resolution: els.resolution.value,
        duration: els.duration.value,
      }),
    });
  } catch (e) {
    setStatus(`Network error: ${e.message}`, true);
    els.generate.disabled = false;
    return;
  }
  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    setStatus(`Luma error: ${created.error || created.detail || createRes.status}`, true);
    els.generate.disabled = false;
    return;
  }

  const id = created.id;
  setStatus(`Submitted (id ${id}). Polling…`);

  const started = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000;
  while (Date.now() - started < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 4000));
    const r = await fetch(`/api/generation/${id}`);
    const g = await r.json();
    setStatus(`State: ${g.state}…`);
    if (g.state === 'completed') {
      const url = g.assets?.video;
      if (!url) {
        setStatus('Completed but no video URL returned.', true);
        break;
      }
      els.resultVideo.src = url;
      setStatus('Done.');
      break;
    }
    if (g.state === 'failed') {
      setStatus(`Generation failed: ${g.failure_reason || 'unknown'}`, true);
      break;
    }
  }

  els.generate.disabled = false;
});

els.glbFile.addEventListener('change', () => {
  const f = els.glbFile.files?.[0];
  if (!f) return;
  els.modelViewer.src = URL.createObjectURL(f);
});

(async () => {
  try {
    const r = await fetch('/api/health');
    const h = await r.json();
    if (!h.hasKey) {
      setStatus(
        'Server is missing LUMAAI_API_KEY. Restart with `LUMAAI_API_KEY=luma-... node server.mjs`.',
        true,
      );
    }
  } catch {}
})();
