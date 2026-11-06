import { useEffect, useRef, useState } from 'react';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
let leafletPromise;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-warkop-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      link.dataset.warkopLeaflet = 'true';
      document.head.appendChild(link);
    }
    let script = document.querySelector('script[data-warkop-leaflet]');
    const finish = () => window.L ? resolve(window.L) : reject(new Error('Leaflet tidak tersedia.'));
    if (!script) {
      script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.async = true;
      script.dataset.warkopLeaflet = 'true';
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => reject(new Error('Peta gagal dimuat.')), { once: true });
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => reject(new Error('Peta gagal dimuat.')), { once: true });
    }
  }).catch(error => { leafletPromise = null; throw error; });
  return leafletPromise;
}

function coordinatesFor(warung) {
  const lat = Number(warung?.coordinates?.lat);
  const lng = Number(warung?.coordinates?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? [lat, lng]
    : null;
}

export default function WarungDiscoveryMap({ warungs = [], onOpenWarung }) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const openWarungRef = useRef(onOpenWarung);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { openWarungRef.current = onOpenWarung; }, [onOpenWarung]);

  useEffect(() => {
    let cancelled = false;
    let map;
    loadLeaflet().then(L => {
      if (cancelled || !elementRef.current) return;
      map = L.map(elementRef.current, { scrollWheelZoom: false }).setView([-2.5, 118], 4);
      mapRef.current = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
      }).addTo(map);
      markersRef.current = L.featureGroup().addTo(map);
      setReady(true);
      window.setTimeout(() => map?.invalidateSize(), 0);
    }).catch(() => { if (!cancelled) setError('Peta belum dapat dimuat. Periksa koneksi internet lalu coba lagi.'); });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !markersRef.current || !mapRef.current || !window.L) return;
    const L = window.L;
    markersRef.current.clearLayers();
    const points = [];
    warungs.forEach(warung => {
      const coordinates = coordinatesFor(warung);
      if (!coordinates) return;
      const marker = L.marker(coordinates).bindTooltip(String(warung.name || 'Warkop'));
      marker.on('click', () => openWarungRef.current?.(warung.id));
      marker.addTo(markersRef.current);
      points.push(coordinates);
    });
    if (points.length === 1) mapRef.current.setView(points[0], 14);
    else if (points.length > 1) mapRef.current.fitBounds(points, { padding: [28, 28], maxZoom: 13 });
  }, [ready, warungs]);

  return <section className="warung-discovery-map" aria-label="Peta lokasi warkop">
    <div className="warung-discovery-map-caption"><b>{warungs.filter(item => coordinatesFor(item)).length} titik warkop</b><span>Ketuk pin untuk membuka profil warkop</span></div>
    {error ? <p className="directory-category-status" role="alert">{error}</p> : <div className="warung-discovery-map-canvas" ref={elementRef} role="application" aria-label="Peta interaktif WARKOPLINK"/>}
  </section>;
}
