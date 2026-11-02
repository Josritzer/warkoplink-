const cleanName = (value, field) => {
  const name = String(value || '').trim().replace(/\\s+/g, ' ');
  if (name.length < 2 || name.length > 100) throw new Error(`Nama ${field} harus 2–100 karakter.`);
  return name;
};

export function buildRegionIdentity(selection) {
  if (!selection || typeof selection !== 'object') throw new Error('Pilih wilayah dari daftar resmi.');

  const provinceCode = String(selection.provinceCode || '');
  const regencyCode = String(selection.regencyCode || '');
  const districtCode = String(selection.districtCode || '');
  const villageCode = String(selection.villageCode || '');

  if (!/^\\d{2}$/.test(provinceCode)
    || !/^\\d{2}\\.\\d{2}$/.test(regencyCode)
    || !/^\\d{2}\\.\\d{2}\\.\\d{2}$/.test(districtCode)
    || !/^\\d{2}\\.\\d{2}\\.\\d{2}\\.\\d{4}$/.test(villageCode)
    || !regencyCode.startsWith(`${provinceCode}.`)
    || !districtCode.startsWith(`${regencyCode}.`)
    || !villageCode.startsWith(`${districtCode}.`)) {
    throw new Error('Kode wilayah tidak sesuai dengan urutan administrasi resmi.');
  }

  return {
    regionCode: villageCode,
    provinceCode,
    provinceName: cleanName(selection.provinceName, 'provinsi'),
    regencyCode,
    regencyName: cleanName(selection.regencyName, 'kabupaten/kota'),
    districtCode,
    districtName: cleanName(selection.districtName, 'kecamatan'),
    villageCode,
    villageName: cleanName(selection.villageName, 'desa/kelurahan'),
  };
}
