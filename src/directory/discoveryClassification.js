const ACTIVITY_GROUPS = [
  { key: 'work', label: 'Kerja & produktivitas', values: ['kerja-laptop'] },
  { key: 'social', label: 'Ngopi & komunitas', values: ['ngopi-bareng', 'komunitas', 'hobi'] },
  { key: 'entertainment', label: 'Hiburan & kegiatan', values: ['nobar', 'gim', 'musik', 'olahraga', 'acara'] },
];

export function groupActivityOptions(options = []) {
  const remaining = new Map((Array.isArray(options) ? options : []).map((option) => [option.key, option]));
  const groups = ACTIVITY_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    options: group.values.map((value) => remaining.get(value)).filter(Boolean),
  })).filter((group) => group.options.length > 0);
  const other = [...remaining.entries()]
    .filter(([key]) => !ACTIVITY_GROUPS.some((group) => group.values.includes(key)))
    .map(([, option]) => option);
  if (other.length) groups.push({ key: 'other', label: 'Aktivitas lainnya', options: other });
  return groups;
}
