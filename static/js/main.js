// ─────────────────────────────────────────────
// DOM Elements
// ─────────────────────────────────────────────

const urlInput       = document.getElementById("urlInput");
const btnAnalyze     = document.getElementById("btnAnalyze");
const urlBox         = document.getElementById("urlBox");

// Info Card
const infoCard       = document.getElementById("infoCard");
const infoThumb      = document.getElementById("infoThumb");
const infoTitle      = document.getElementById("infoTitle");
const infoMeta       = document.getElementById("infoMeta");

// Mode Tabs & Panels
const modeTabs       = document.querySelectorAll(".tab");
const panels         = document.querySelectorAll(".panel");
const downloadButtons = document.querySelectorAll(".btn-download");
const fmtGrids        = document.querySelectorAll('.fmt-grid');
const resGrids        = document.querySelectorAll('.res-grid');
const optsRows        = document.querySelectorAll('.opts-row');

// Progress & Ready Sections
const progressSection= document.getElementById("progressSection");
const progStatus     = document.getElementById("progStatus");
const progPct        = document.getElementById("progPct");
const progFill       = document.getElementById("progFill");
const statSpeed      = document.getElementById("statSpeed");
const statSize       = document.getElementById("statSize");
const statEta        = document.getElementById("statEta");
const readyCard      = document.getElementById("readyCard");
const readyTitle     = document.getElementById("readyTitle");
const readyMeta      = document.getElementById("readyMeta");
const btnSave        = document.getElementById("btnSave");

// History
const historyWrap    = document.getElementById("historyWrap");
const historyList    = document.getElementById("historyList");

// Toast
const toast          = document.getElementById("toast");


// ─────────────────────────────────────────────
// Global State
// ─────────────────────────────────────────────

let currentMode = "image";
let currentURL = "";
let currentTaskID = null;
let pollingInterval = null;
let currentResolution = "Terbaik";


// ─────────────────────────────────────────────
// API Calls
// ─────────────────────────────────────────────

async function api(endpoint, options = {}) {
  try {
    const response = await fetch(`/api${endpoint}`, options);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    showToast(`Error: ${error.message}`);
    console.error("API Error:", error);
    throw error;
  }
}

// ─────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────

function analyzeURL() {
  const url = urlInput.value.trim();
  if (!url) {
    showToast("Please enter a URL first.");
    return;
  }
  currentURL = url;
  btnAnalyze.disabled = true;
  btnAnalyze.innerHTML = '<i class="ti ti-loader-2 spin"></i><span>Menganalisis...</span>';

  api("/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })
    .then(data => {
      infoTitle.textContent = data.title || "No title found";
      infoMeta.textContent = `${data.uploader || "Unknown uploader"} · ${data.duration ? new Date(data.duration * 1000).toISOString().substr(11, 8) : ''}`;
      infoThumb.src = data.thumbnail || "";
      infoCard.style.display = "flex";
      urlBox.classList.add("analyzed");
      // Reveal controls and set highest available resolution after analysis
      setControlsVisible(true);
      currentResolution = getHighestResolution(data);
      const resolutionSelect = document.getElementById('resolutionSelect');
      if (resolutionSelect) {
          resolutionSelect.value = currentResolution;
      }
      updateAvailableFormats(data);
    })
    .catch(err => {
      urlBox.classList.remove("analyzed");
            // Hide format/resolution/options on error
            setControlsVisible(false);
    })
    .finally(() => {
      btnAnalyze.disabled = false;
      btnAnalyze.innerHTML = '<i class="ti ti-scan"></i><span>Analisis URL</span>';
    });
}

// Show or hide format/resolution/option controls
function setControlsVisible(visible) {
    const display = visible ? '' : 'none';
    fmtGrids.forEach(el => el.style.display = display);
    resGrids.forEach(el => el.style.display = display);
    optsRows.forEach(el => el.style.display = display);
    downloadButtons.forEach(btn => btn.style.display = visible ? 'inline-block' : 'none');
}

// Enable/disable format & resolution buttons based on info from server
function updateAvailableFormats(info) {
    const formats = info.formats || [];
    const availableExts = new Set(formats.map(f => (f.ext || '').toLowerCase()));

    const fmtMap = {
        imgFmt: { JPEG: 'jpg', PNG: 'png', WebP: 'webp', AVIF: 'avif', TIFF: 'tiff', BMP: 'bmp', SVG: 'svg', RAW: 'raw' },
        vidFmt: { MP4: 'mp4', WebM: 'webm', MKV: 'mkv', AVI: 'avi', MOV: 'mov', FLV: 'flv', TS: 'ts', '3GP': '3gp' },
        audFmt: { MP3: 'mp3', AAC: 'm4a', FLAC: 'flac', WAV: 'wav', OGG: 'ogg', OPUS: 'opus', M4A: 'm4a', AIFF: 'aiff' },
    };

    // Determine max available video height
    const videoHeights = formats.map(f => f.height || 0).filter(h => h > 0);
    const maxVideoHeight = videoHeights.length ? Math.max(...videoHeights) : 0;

    // Helper to toggle buttons in a group
    function toggleFmtGroup(groupName, map) {
        const group = document.querySelector(`[data-group="${groupName}"]`);
        if (!group) return;
        group.querySelectorAll('.fmt-btn').forEach(btn => {
            const val = btn.dataset.val;
            const mapped = (map && map[val]) ? map[val] : (val || '').toLowerCase();
            const supported = mapped && availableExts.has(mapped);
            if (supported) {
                btn.disabled = false;
                btn.classList.remove('disabled');
            } else {
                btn.disabled = true;
                btn.classList.add('disabled');
                if (btn.classList.contains('selected')) btn.classList.remove('selected');
            }
        });
    }

    // Toggle format buttons
    toggleFmtGroup('imgFmt', fmtMap.imgFmt);
    toggleFmtGroup('vidFmt', fmtMap.vidFmt);
    toggleFmtGroup('audFmt', fmtMap.audFmt);

    // Toggle video resolution buttons by comparing heights
    const vidResGroup = document.querySelector('[data-group="vidRes"]');
    if (vidResGroup) {
        const heightMap = { '360p': 360, '480p': 480, '720p': 720, '1080p': 1080, '1440p': 1440, '4K': 2160, '8K': 4320, 'Terbaik': 0 };
        vidResGroup.querySelectorAll('.res-btn').forEach(btn => {
            const val = btn.dataset.val;
            const h = heightMap[val] !== undefined ? heightMap[val] : (val.includes('4K') ? 2160 : 0);
            const supported = (val === 'Terbaik') ? (maxVideoHeight > 0) : (maxVideoHeight >= h && h > 0);
            if (supported) {
                btn.disabled = false;
                btn.classList.remove('disabled');
            } else {
                btn.disabled = true;
                btn.classList.add('disabled');
                if (btn.classList.contains('selected')) btn.classList.remove('selected');
            }
        });
    }

    // Toggle image resolution buttons based on whether thumbnail exists
    const imgResGroup = document.querySelector('[data-group="imgRes"]');
    if (imgResGroup) {
        const hasThumb = !!info.thumbnail;
        imgResGroup.querySelectorAll('.res-btn').forEach(btn => {
            if (hasThumb) {
                btn.disabled = false;
                btn.classList.remove('disabled');
            } else {
                btn.disabled = true;
                btn.classList.add('disabled');
                if (btn.classList.contains('selected')) btn.classList.remove('selected');
            }
        });
    }
}

function getHighestResolution(info) {
    const resolutionOrder = ["8K", "4K", "1440p", "1080p", "720p", "480p", "360p", "Full HD", "HD", "SD", "Original", "Terbaik"];
    const formats = info.formats || [];

    // Prefer format labels from interface if available, otherwise fallback to highest height.
    const heights = formats.map(f => f.height || 0).filter(h => h > 0);
    const maxHeight = heights.length ? Math.max(...heights) : 0;

    if (maxHeight >= 4320) return "8K";
    if (maxHeight >= 2160) return "4K";
    if (maxHeight >= 1440) return "1440p";
    if (maxHeight >= 1080) return "1080p";
    if (maxHeight >= 720) return "720p";
    if (maxHeight >= 480) return "480p";
    if (maxHeight >= 360) return "360p";
    if (info.thumbnail) return "Full HD";
    return "Terbaik";
}

function switchMode(mode) {
    currentMode = mode;
    const tabMap = {
        image: 'tabImg',
        video: 'tabVid',
        audio: 'tabAud'
    };
    const targetTabId = tabMap[mode] || '';

    modeTabs.forEach(tab => {
        const isActive = tab.id === targetTabId;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    panels.forEach(panel => {
        panel.classList.toggle('active', panel.id === `panel${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    });
}


function startDownload(mediaType) {
    if (!currentURL) {
        showToast("Please analyze a URL first.");
        return;
    }

    setDownloadButtonsDisabled(true);

    const formatGroup = mediaType === "image" ? "imgFmt" : (mediaType === "video" ? "vidFmt" : "audFmt");
    const resolutionGroup = mediaType === "image" ? "imgRes" : (mediaType === "video" ? "vidRes" : "audRes");

    const format = document.querySelector(`[data-group="${formatGroup}"] .selected`)?.dataset.val || "";
    const resolution = document.getElementById("resolutionSelect")?.value || currentResolution || document.querySelector(`[data-group="${resolutionGroup}"] .selected`)?.dataset.val || "Terbaik";

    const quality = document.getElementById("imgQuality")?.value || "85%";
    const codec = document.getElementById("videoCodec")?.value || "h264";
    const colorSpace = document.getElementById("colorSpace")?.value || "sRGB";
    const audio = document.getElementById("videoAudio")?.value || "Dengan Audio (AAC)";

    const payload = {
        url: currentURL,
        media_type: mediaType,
        format,
        resolution,
        quality,
        codec,
        color_space: colorSpace,
        audio,
    };

    progressSection.style.display = "block";
    readyCard.style.display = "none";
    
    api("/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    })
    .then(data => {
        currentTaskID = data.task_id;
        startPolling(currentTaskID);
    })
    .catch(err => {
        progressSection.style.display = "none";
        setDownloadButtonsDisabled(false);
    });
}

function startPolling(taskID) {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    pollingInterval = setInterval(() => {
        pollProgress(taskID);
    }, 1000);
}

function pollProgress(taskID) {
    api(`/progress/${taskID}`)
        .then(data => {
            updateProgressUI(data);
            if (data.status === "done" || data.status === "error") {
                clearInterval(pollingInterval);
                pollingInterval = null;
                setDownloadButtonsDisabled(false);

                if (data.status === "done") {
                    showReadyState(data);
                    saveHistory(data);
                } else {
                    showToast(`Error: ${data.error}`);
                    progressSection.style.display = "none";
                }
            }
        })
        .catch(err => {
            clearInterval(pollingInterval);
            pollingInterval = null;
            progressSection.style.display = "none";
            setDownloadButtonsDisabled(false);
        });
}


// ─────────────────────────────────────────────
// History Functions
// ─────────────────────────────────────────────

function getHistory() {
    return JSON.parse(localStorage.getItem("mediaFetchHistory") || "[]");
}

function saveHistory(item) {
    const history = getHistory();
    const historyItem = {
        title: item.title,
        filename: item.filename,
        filesize: item.filesize,
        timestamp: new Date().toISOString(),
        task_id: currentTaskID
    };
    // Add to the beginning and keep only the last 20
    history.unshift(historyItem);
    localStorage.setItem("mediaFetchHistory", JSON.stringify(history.slice(0, 20)));
    renderHistory();
}

function renderHistory() {
    const history = getHistory();
    if (history.length === 0) {
        historyWrap.style.display = "none";
        return;
    }

    historyList.innerHTML = ""; // Clear existing list
    history.forEach(item => {
        const div = document.createElement("div");
        div.className = "history-item";
        div.innerHTML = `
            <div class="hist-body">
                <p class="hist-title">${item.title}</p>
                <p class="hist-meta">${item.filename} · ${item.filesize}</p>
            </div>
            <a class="btn-save-hist" href="/api/download-file/${item.task_id}" download="${item.filename}">
                <i class="ti ti-download"></i>
            </a>
        `;
        historyList.appendChild(div);
    });
    historyWrap.style.display = "block";
}

// ─────────────────────────────────────────────
// UI/Helper Functions
// ─────────────────────────────────────────────

function setDownloadButtonsDisabled(disabled) {
    downloadButtons.forEach(btn => {
        btn.disabled = disabled;
    });
}

function updateProgressUI(data) {
    progStatus.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1) + "...";
    progPct.textContent = `${data.progress || 0}%`;
    progFill.style.width = `${data.progress || 0}%`;
    statSpeed.textContent = data.speed || "—";
    statSize.textContent = data.size || "—";
    statEta.textContent = data.eta || "—";
}

function showReadyState(data) {
    progressSection.style.display = "none";
    readyCard.style.display = "flex";
    readyTitle.textContent = data.title || "Download is ready";
    readyMeta.textContent = `File: ${data.filename} · Size: ${data.filesize}`;
    btnSave.href = `/api/download-file/${currentTaskID}`;
    btnSave.setAttribute("download", data.filename);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Event listeners for format and resolution buttons
document.querySelectorAll(".fmt-btn, .res-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        // Deselect siblings
        const group = btn.closest("[data-group]");
        group.querySelectorAll(".selected").forEach(selectedBtn => {
            selectedBtn.classList.remove("selected");
        });
        // Select clicked button
        btn.classList.add("selected");
    });
});

urlInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
        analyzeURL();
    }
});

// Initial render
document.addEventListener('DOMContentLoaded', () => {
    renderHistory();
    // Hide format/resolution/options until a URL is provided and analyzed
    setControlsVisible(false);
});
