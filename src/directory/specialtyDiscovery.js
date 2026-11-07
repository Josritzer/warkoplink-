export function collectSpecialtyMenuOptions(warungs = [], limit = 10) {
  const counts = new Map();
  for (const warung of Array.isArray(warungs) ? warungs : []) {
    const uniqueMenus = new Map();
    for (const rawMenu of Array.isArray(warung?.specialties) ? warung.specialties : []) {
      if (typeof rawMenu !== 'string') continue;
      const name = rawMenu.trim().replace(/\\s+/g, ' ');
      if (!name) continue;
      const key = name.toLocaleLowerCase('id');
      if (!uniqueMenus.has(key)) uniqueMenus.set(key, name);
    }
    for (const [key, name] of uniqueMenus) {
      const current = counts.get(key) || { name, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'id'))
    .slice(0, Math.max(0, limit));
}
