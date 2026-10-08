import { MAX_SIDE, JPEG_QUALITY, FORM_KEY } from './config.js';
import { loadFloors, populateFloors, updateFloorInfo } from './floors.js';
import { savePhoto, loadPhotos, deletePhotoFromDB, clearPhotosInDB } from './storage.js';

const state = {
  currentAddressStr: 'Balneário Camboriú - SC',
  currentLat: '-26.990000',
  currentLng: '-48.630000',
  capturedPhotos: [],
  galleryUrls: [],
  pendingMeta: null,
  floors: []
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showBusy(message) {
  const busyText = document.getElementById('busyText');
  const busyProgress = document.getElementById('busyProgress');
  const busyOverlay = document.getElementById('busyOverlay');

  if (busyText) busyText.textContent = message || 'Processando...';
  if (busyProgress) busyProgress.textContent = '';
  if (busyOverlay) busyOverlay.classList.remove('hidden');
}

function setBusyProgress(message) {
  const busyProgress = document.getElementById('busyProgress');
  if (busyProgress) busyProgress.textContent = message;
}

function hideBusy() {
  const busyOverlay = document.getElementById('busyOverlay');
  if (busyOverlay) busyOverlay.classList.add('hidden');
}

function saveForm() {
  try {
    const fields = [
      'buildingName',
      'inspectorName',
      'inspectorSector',
      'floorSelect',
      'environmentSelect',
      'environmentCustomInput'
    ];

    const data = {};
    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (el) data[id] = el.value;
    });

    localStorage.setItem(FORM_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Não foi possível salvar o formulário:', error);
  }
}

function restoreForm() {
  try {
    const saved = JSON.parse(localStorage.getItem(FORM_KEY) || '{}');
    const fields = ['buildingName', 'inspectorName', 'inspectorSector', 'floorSelect', 'environmentSelect', 'environmentCustomInput'];

    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (el && saved[id] !== undefined && saved[id] !== '') {
        el.value = saved[id];
      }
    });
  } catch (error) {
    console.warn('Não foi possível recuperar o formulário:', error);
  }

  const buildingEl = document.getElementById('buildingName');
  if (buildingEl) {
    const header = document.getElementById('headerBuildingName');
    if (header) header.textContent = buildingEl.value || 'Sapphire Tower';
  }

  handleEnvironmentChange();
}

function bindFormPersistence() {
  const fields = ['buildingName', 'inspectorName', 'inspectorSector', 'floorSelect', 'environmentSelect', 'environmentCustomInput'];

  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', saveForm);
    el.addEventListener('change', saveForm);
  });
}

function getSelectedEnvironment() {
  const select = document.getElementById('environmentSelect');
  const customInput = document.getElementById('environmentCustomInput');

  if (!select) return 'Geral';

  if (select.value === 'OUTRO') {
    return customInput && customInput.value.trim() ? customInput.value.trim() : 'Geral';
  }

  return select.value;
}

function handleEnvironmentChange() {
  const select = document.getElementById('environmentSelect');
  const customInput = document.getElementById('environmentCustomInput');

  if (!select || !customInput) return;

  if (select.value === 'OUTRO') {
    customInput.classList.remove('hidden');
    customInput.focus();
  } else {
    customInput.classList.add('hidden');
  }

  saveForm();
}

function getLocation() {
  if (!('geolocation' in navigator)) {
    document.getElementById('geoCoordinates').innerHTML = '<strong>GPS:</strong> Geolocalização indisponível';
    return;
  }

  document.getElementById('geoCoordinates').innerHTML = '<strong>GPS:</strong> Capturando...';

  navigator.geolocation.getCurrentPosition(async (pos) => {
    state.currentLat = pos.coords.latitude.toFixed(6);
    state.currentLng = pos.coords.longitude.toFixed(6);
    document.getElementById('geoCoordinates').innerHTML = `<strong>GPS:</strong> ${state.currentLat}, ${state.currentLng}`;

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${state.currentLat}&lon=${state.currentLng}`);
      const data = await response.json();
      const rua = data.address?.road || data.address?.pedestrian || 'Rua 1500';
      const cidade = data.address?.city || data.address?.town || 'Balneário Camboriú';
      const uf = data.address?.state_code || 'SC';
      state.currentAddressStr = `${rua}, ${cidade} - ${uf}`;
      document.getElementById('geoAddress').innerHTML = `<strong>Endereço:</strong> ${state.currentAddressStr}`;
    } catch (error) {
      state.currentAddressStr = 'Balneário Camboriú - SC';
      document.getElementById('geoAddress').innerHTML = `<strong>Endereço:</strong> ${state.currentAddressStr}`;
    }
  }, () => {
    document.getElementById('geoCoordinates').innerHTML = `<strong>GPS:</strong> ${state.currentLat}, ${state.currentLng} (Aproximado)`;
    document.getElementById('geoAddress').innerHTML = `<strong>Endereço:</strong> ${state.currentAddressStr}`;
  }, { enableHighAccuracy: true, timeout: 8000 });
}

function processImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    URL.revokeObjectURL(url);
    drawWatermarkedImage(image);
  };

  image.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Não foi possível ler esta imagem. Tente novamente.');
  };

  image.src = url;
}

function drawWatermarkedImage(image) {
  const canvas = document.getElementById('photoCanvas');
  const ctx = canvas.getContext('2d');

  const srcWidth = image.naturalWidth || image.width;
  const srcHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(srcWidth, srcHeight));

  canvas.width = Math.round(srcWidth * scale);
  canvas.height = Math.round(srcHeight * scale);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const building = document.getElementById('buildingName').value || 'EMPREENDIMENTO';
  const inspector = document.getElementById('inspectorName').value || 'AUDITOR TÉCNICO';
  const floor = document.getElementById('floorSelect').value;
  const env = getSelectedEnvironment();
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');

  const lines = [
    `${building.toUpperCase()} | PAV: ${floor}`,
    `AMBIENTE: ${env.toUpperCase()} | AUDITOR: ${inspector.toUpperCase()}`,
    `DATA: ${dateStr} | END: ${state.currentAddressStr}`,
    `GPS: ${state.currentLat}, ${state.currentLng}`
  ];

  let fontSize = Math.max(12, Math.floor(canvas.width / 38));
  const fits = () => {
    ctx.font = `bold ${fontSize}px sans-serif`;
    return lines.every((line) => ctx.measureText(line).width <= canvas.width - fontSize * 1.6);
  };

  while (fontSize > 10 && !fits()) {
    fontSize -= 1;
  }

  ctx.font = `bold ${fontSize}px sans-serif`;
  const padding = fontSize * 0.8;
  const lineHeight = fontSize * 1.35;
  const boxHeight = lines.length * lineHeight + padding * 1.8;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(0, canvas.height - boxHeight, canvas.width, boxHeight);

  ctx.fillStyle = '#135C6C';
  ctx.fillRect(0, canvas.height - boxHeight, canvas.width, Math.max(3, fontSize * 0.15));

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, index) => {
    ctx.fillText(line, padding, canvas.height - boxHeight + padding + index * lineHeight + fontSize * 0.75);
  });

  state.pendingMeta = {
    floor,
    env,
    location: state.currentAddressStr,
    lat: state.currentLat,
    lng: state.currentLng,
    timestamp: now.toLocaleString('pt-BR'),
    createdAt: now.getTime()
  };

  document.getElementById('previewContainer').classList.remove('hidden');
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Falha ao gerar a imagem'));
        return;
      }
      resolve(blob);
    }, 'image/jpeg', JPEG_QUALITY);
  });
}

async function addPhotoToInspection() {
  if (!state.pendingMeta) return;

  const btn = document.getElementById('addPhotoBtn');
  if (btn) btn.disabled = true;

  try {
    const canvas = document.getElementById('photoCanvas');
    const blob = await canvasToBlob(canvas);
    const notes = document.getElementById('photoNotes').value || 'Sem inconformidades anotadas.';

    await savePhoto({
      floor: state.pendingMeta.floor,
      env: state.pendingMeta.env,
      notes,
      blob,
      location: state.pendingMeta.location,
      lat: state.pendingMeta.lat,
      lng: state.pendingMeta.lng,
      timestamp: state.pendingMeta.timestamp,
      createdAt: state.pendingMeta.createdAt
    });

    state.capturedPhotos = await loadPhotos();
    renderGallery();

    state.pendingMeta = null;
    document.getElementById('previewContainer').classList.add('hidden');
    document.getElementById('cameraInput').value = '';
    document.getElementById('photoNotes').value = '';
    alert('✅ Foto e observação salvas no relatório!');
  } catch (error) {
    console.error(error);
    alert('Não foi possível salvar a foto.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderGallery() {
  const gallery = document.getElementById('gallery');
  const photoCount = document.getElementById('photoCount');

  if (photoCount) photoCount.textContent = String(state.capturedPhotos.length);

  state.galleryUrls.forEach((url) => URL.revokeObjectURL(url));
  state.galleryUrls = [];

  if (state.capturedPhotos.length === 0) {
    gallery.innerHTML = '<p id="emptyGallery" class="col-span-2 text-xs text-gray-400 text-center py-4">Nenhuma foto adicionada ao relatório ainda.</p>';
    return;
  }

  gallery.innerHTML = state.capturedPhotos.map((item) => {
    const url = URL.createObjectURL(item.blob);
    state.galleryUrls.push(url);

    return `
      <div class="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shadow-sm flex flex-col">
        <img src="${url}" class="w-full h-32 object-cover" alt="Foto da vistoria" />
        <div class="p-2 text-[10px] space-y-1">
          <p class="font-bold text-slate-800">${escapeHtml(item.floor)}</p>
          <p class="text-[#135C6C] font-semibold truncate">Ambiente: ${escapeHtml(item.env)}</p>
          <p class="text-gray-500 line-clamp-2">${escapeHtml(item.notes)}</p>
        </div>
        <button type="button" onclick="window.removePhoto && window.removePhoto(${item.id})" class="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 shadow hover:bg-red-700">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

async function removePhoto(id) {
  if (!confirm('Remover esta foto do relatório?')) return;

  try {
    await deletePhotoFromDB(id);
    state.capturedPhotos = state.capturedPhotos.filter((photo) => photo.id !== id);
    renderGallery();
  } catch (error) {
    console.error(error);
    alert('Não foi possível remover a foto.');
  }
}

async function clearAllPhotos() {
  if (state.capturedPhotos.length === 0) return;

  if (!confirm(`Apagar TODAS as ${state.capturedPhotos.length} fotos do relatório? Esta ação não pode ser desfeita.`)) return;

  try {
    await clearPhotosInDB();
    state.capturedPhotos = [];
    renderGallery();
  } catch (error) {
    console.error(error);
    alert('Não foi possível limpar o relatório.');
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function generatePDFReport() {
  if (state.capturedPhotos.length === 0) {
    alert('Adicione pelo menos uma foto antes de gerar o relatório em PDF.');
    return;
  }

  showBusy('Gerando Relatório PDF...');

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const building = document.getElementById('buildingName').value || 'Empreendimento';
    const inspector = document.getElementById('inspectorName').value || 'Auditor Técnico';
    const sector = document.getElementById('inspectorSector').value || 'Auditoria Interna';

    const pageWidth = 210;
    const margin = 10;
    const cardWidth = (pageWidth - margin * 2 - 6) / 2;
    const cardHeight = 118;

    let itemsPerPage = 4;
    let col = 0;
    let row = 0;
    let startY = 42;

    doc.setFillColor(19, 92, 108);
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('RELATÓRIO & VISTORIA FOTOGRÁFICA', margin, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Empreendimento: ${building}`, margin, 18);
    doc.text(`Responsável: ${inspector} (${sector})`, margin, 24);

    for (let index = 0; index < state.capturedPhotos.length; index++) {
      const item = state.capturedPhotos[index];

      if (index > 0 && index % itemsPerPage === 0) {
        doc.addPage();
        col = 0;
        row = 0;
        startY = 15;
      }

      setBusyProgress(`Processando foto ${index + 1} de ${state.capturedPhotos.length}...`);

      const x = margin + col * (cardWidth + 6);
      const y = startY + row * (cardHeight + 6);

      doc.setDrawColor(220, 226, 230);
      doc.setFillColor(250, 252, 253);
      doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');

      const base64Img = await blobToBase64(item.blob);
      doc.addImage(base64Img, 'JPEG', x + 2, y + 2, cardWidth - 4, 75);

      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`Pavimento: ${item.floor}`, x + 4, y + 83);

      doc.setTextColor(19, 92, 108);
      doc.text(`Ambiente: ${item.env}`, x + 4, y + 88);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);

      const splitNotes = doc.splitTextToSize(`Obs: ${item.notes}`, cardWidth - 8);
      doc.text(splitNotes.slice(0, 4), x + 4, y + 94);

      col += 1;
      if (col > 1) {
        col = 0;
        row += 1;
      }
    }

    doc.save(`Relatorio_Vistoria_${building.replace(/\s+/g, '_')}.pdf`);
  } catch (error) {
    console.error(error);
    alert('Ocorreu um erro ao gerar o PDF. Tente novamente.');
  } finally {
    hideBusy();
  }
}

async function initApp() {
  lucide.createIcons();

  try {
    state.floors = await loadFloors();
    populateFloors('floorSelect', state.floors);
    updateFloorInfo('floorSelect', state.floors, 'floorDetailType', 'floorDetailDates');
  } catch (error) {
    console.error(error);
    alert('Não foi possível carregar o cronograma de pavimentos.');
  }

  restoreForm();
  bindFormPersistence();
  getLocation();

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  try {
    state.capturedPhotos = await loadPhotos();
  } catch (error) {
    console.error(error);
    alert('Não foi possível acessar o armazenamento local do navegador.');
  }

  renderGallery();
}

window.getLocation = getLocation;
window.handleEnvironmentChange = handleEnvironmentChange;
window.processImage = processImage;
window.addPhotoToInspection = addPhotoToInspection;
window.removePhoto = removePhoto;
window.clearAllPhotos = clearAllPhotos;
window.generatePDFReport = generatePDFReport;
window.updateFloorInfo = () => updateFloorInfo('floorSelect', state.floors, 'floorDetailType', 'floorDetailDates');

document.addEventListener('DOMContentLoaded', initApp);
