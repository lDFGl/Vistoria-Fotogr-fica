function exportReportJson() {
  if (state.capturedPhotos.length === 0) {
    alert('Adicione pelo menos uma foto antes de gerar o backup das imagens.');
    return;
  }

  if (!window.JSZip) {
    alert('Biblioteca de backup não carregada. Tente recarregar a página.');
    return;
  }

  const building = document.getElementById('buildingName').value || 'Empreendimento';
  const inspector = document.getElementById('inspectorName').value || 'Auditor Técnico';
  const sector = document.getElementById('inspectorSector').value || 'Auditoria Interna';

  const zip = new JSZip();
  const photosFolder = 'fotos';

  const normalizeName = (value, fallback) => {
    const cleaned = String(value || fallback)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .trim();

    return cleaned || fallback;
  };

  const report = {
    empreendimento: building,
    auditor: inspector,
    setor: sector,
    data: new Date().toISOString(),
    fotos: state.capturedPhotos.map((item, index) => {
      const safeFloor = normalizeName(item.floor, 'pavimento');
      const safeEnv = normalizeName(item.env, 'ambiente');
      const fileName = `${String(index + 1).padStart(2, '0')}_${safeFloor}_${safeEnv}.jpg`;

      return {
        id: item.id,
        floor: item.floor,
        env: item.env,
        notes: item.notes,
        location: item.location,
        lat: item.lat ?? 'indisponível',
        lng: item.lng ?? 'indisponível',
        timestamp: item.timestamp,
        arquivo: `${photosFolder}/${fileName}`
      };
    })
  };

  zip.file('relatorio.json', JSON.stringify(report, null, 2));

  state.capturedPhotos.forEach((item, index) => {
    const safeFloor = normalizeName(item.floor, 'pavimento');
    const safeEnv = normalizeName(item.env, 'ambiente');
    const fileName = `${String(index + 1).padStart(2, '0')}_${safeFloor}_${safeEnv}.jpg`;
    zip.file(`${photosFolder}/${fileName}`, item.blob);
  });

  zip.generateAsync({ type: 'blob' })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Backup_Imagens_${building.replace(/\s+/g, '_')}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    })
    .catch((error) => {
      console.error(error);
      alert('Não foi possível gerar o backup das imagens.');
    });
}

window.exportReportJson = exportReportJson;
