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
    })
    .catch(err => {
      urlBox.classList.remove("analyzed");
    })
    .finally(() => {
      btnAnalyze.disabled = false;
      btnAnalyze.innerHTML = '<i class="ti ti-scan"></i><span>Analisis URL</span>';
    });
}

function switchMode(mode) {
  currentMode = mode;
  modeTabs.forEach(tab => {
    tab.classList.toggle("active", tab.id === `tab${mode.charAt(0).toUpperCase() + mode.slice(1,3)}`);
    tab.setAttribute("aria-selected", tab.id === `tab${mode.charAt(0).toUpperCase() + mode.slice(1,3)}`);
  });
  panels.forEach(panel => {
    panel.classList.toggle("active", panel.id === `panel${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
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
    const resolution = document.querySelector(`[data-group="${resolutionGroup}"] .selected`)?.dataset.val || "";

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
});
