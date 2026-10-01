const MAX_FILE_SIZE = 50 * 1024 * 1024;

const form = document.getElementById("teleuploadForm");
const fileInput = document.getElementById("files");
const fileName = document.getElementById("fileName");
const selectedFilesList = document.getElementById("selectedFiles");
const uploadDrop = document.getElementById("uploadDrop");
const passwordInput = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const titleInput = document.getElementById("title");
const sendButton = document.getElementById("sendButton");
const progress = document.getElementById("progress");
const progressFill = document.getElementById("progressFill");
const status = document.getElementById("status");

let selectedFiles = [];

function syncInputFiles() {
  const transfer = new DataTransfer();
  selectedFiles.forEach((file) => transfer.items.add(file));
  fileInput.files = transfer.files;
}

function renderFiles() {
  selectedFilesList.replaceChildren();

  selectedFiles.forEach((file, index) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.className = "selected-file-name";
    name.textContent = file.name;

    const size = document.createElement("span");
    size.className = "selected-file-size";
    size.textContent = `${(file.size / 1048576).toFixed(1)} MB`;

    const remove = document.createElement("button");
    remove.className = "remove-file";
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${file.name}`);
    remove.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    remove.addEventListener("click", () => {
      selectedFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index);
      syncInputFiles();
      renderFiles();
    });

    item.append(name, size, remove);
    selectedFilesList.append(item);
  });

  fileName.textContent = selectedFiles.length
    ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`
    : "Files select karein ya yahan drag and drop karein";
  uploadDrop.classList.toggle("has-file", selectedFiles.length > 0);
}

function addFiles(files) {
  for (const file of files) {
    const duplicate = selectedFiles.some(
      (selectedFile) =>
        selectedFile.name === file.name &&
        selectedFile.size === file.size &&
        selectedFile.lastModified === file.lastModified,
    );
    if (!duplicate) selectedFiles.push(file);
  }
  syncInputFiles();
  renderFiles();
}

fileInput.addEventListener("change", () => addFiles(fileInput.files));

for (const eventName of ["dragenter", "dragover"]) {
  uploadDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadDrop.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  uploadDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadDrop.classList.remove("is-dragging");
  });
}

uploadDrop.addEventListener("drop", (event) => {
  addFiles(event.dataTransfer.files);
});

togglePassword.addEventListener("click", () => {
  const reveal = passwordInput.type === "password";
  passwordInput.type = reveal ? "text" : "password";
  togglePassword.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
  togglePassword.setAttribute("aria-pressed", String(reveal));
  togglePassword.querySelector("i").className = reveal
    ? "fas fa-eye-slash"
    : "fas fa-eye";
});

function safeFileName(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "upload";
}

async function sendFile(file, password, index, total) {
  const pathname = `teleupload/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  let uploadedBlob;

  try {
    const { upload } = await import(
      "https://esm.sh/@vercel/blob@2.8.0/client?bundle"
    );
    status.textContent = `Uploading ${index + 1}/${total}: ${file.name}`;
    uploadedBlob = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/teleupload-upload",
      clientPayload: JSON.stringify({ password }),
      multipart: file.size > 5 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => {
        const batchProgress = ((index + percentage / 100) / total) * 90;
        progressFill.style.width = `${batchProgress}%`;
      },
    });

    status.textContent = `Telegram par bhej rahe hain (${index + 1}/${total}): ${file.name}`;
    const response = await fetch("/api/teleupload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        pathname: uploadedBlob.pathname,
        filename: file.name,
        title: titleInput.value.trim(),
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "File Telegram par nahi bheji ja saki.");
    }
  } catch (error) {
    if (uploadedBlob?.pathname) {
      fetch("/api/teleupload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cleanup",
          password,
          pathname: uploadedBlob.pathname,
        }),
      }).catch(() => {});
    }
    throw error;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedFiles.length) {
    status.textContent = "Pehle ek ya zyada files select karein.";
    status.className = "teleupload-status error";
    return;
  }
  if (!form.reportValidity()) return;

  const oversized = selectedFiles.find((file) => file.size > MAX_FILE_SIZE);
  if (oversized) {
    status.textContent = `${oversized.name}: file 50 MB se chhoti honi chahiye.`;
    status.className = "teleupload-status error";
    return;
  }

  const password = passwordInput.value;
  const failedFiles = [];
  let sentCount = 0;
  sendButton.disabled = true;
  progress.hidden = false;
  progressFill.style.width = "0%";
  status.className = "teleupload-status";

  for (const [index, file] of selectedFiles.entries()) {
    try {
      await sendFile(file, password, index, selectedFiles.length);
      sentCount += 1;
      progressFill.style.width = `${((index + 1) / selectedFiles.length) * 100}%`;
    } catch (error) {
      failedFiles.push(file);
      status.textContent = `${file.name}: ${error.message || "Upload failed."}`;
      status.className = "teleupload-status error";
    }
  }

  sendButton.disabled = false;
  form.reset();
  selectedFiles = failedFiles;
  syncInputFiles();
  renderFiles();

  if (!failedFiles.length) {
    status.textContent = `${sentCount} file${sentCount === 1 ? "" : "s"} Telegram par bhej di.`;
    status.className = "teleupload-status success";
  } else {
    status.textContent = `${sentCount} sent; ${failedFiles.length} failed. Password dobara daal kar failed files retry karein.`;
    status.className = "teleupload-status error";
  }
});