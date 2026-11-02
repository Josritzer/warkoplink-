import { useEffect, useRef, useState } from 'react';
import { getMapInitialView, parseMapCoordinates } from './mapLocation.js';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
let leafletPromise;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-warkop-leaflet]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = LEAFLET_CSS;
      stylesheet.dataset.warkopLeaflet = 'true';
      document.head.appendChild(stylesheet);
    }

    const existingScript = document.querySelector('script[data-warkop-leaflet]');
    const script = existingScript || document.createElement('script');
    const finish = () => window.L ? resolve(window.L) : reject(new Error('Leaflet tidak tersedia.'));
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Pustaka peta gagal dimuat.')), { once: true });
    if (!existingScript) {
      script.src = LEAFLET_JS;
      script.async = true;
      script.dataset.warkopLeaflet = 'true';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    leafletPromise = null;
    throw error;
  });

  return leafletPromise;
}

export default function LeafletLocationPicker({ latitude, longitude, onChange }) {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const coordinatesRef = useRef({ latitude, longitude });
  const [mapError, setMapError] = useState('');

  useEffect(() => {
    onChangeRef.current = onChange;
    coordinatesRef.current = { latitude, longitude };
  }, [onChange, latitude, longitude]);

  useEffect(() => {
    let cancelled = false;
    let map;

    loadLeaflet().then((L) => {
      if (cancelled || !mapElement.current) return;
      const latestCoordinates = coordinatesRef.current;
      const initial = getMapInitialView(latestCoordinates.latitude, latestCoordinates.longitude);
      const iconBase = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/images/`;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: iconBase + 'marker-icon-2x.png',
        iconUrl: iconBase + 'marker-icon.png',
        shadowUrl: iconBase + 'marker-shadow.png',
      });
      map = L.map(mapElement.current, { scrollWheelZoom: false }).setView(initial.center, initial.zoom);
      mapRef.current = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      const setPoint = (point) => {
        const next = [Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6))];
        if (!markerRef.current) {
          markerRef.current = L.marker(next, { draggable: true }).addTo(map);
          markerRef.current.on('dragend', (event) => setPoint(event.target.getLatLng()));
        } else {
          markerRef.current.setLatLng(next);
        }
        onChangeRef.current(String(next[0]), String(next[1]));
      };

      const current = parseMapCoordinates(latestCoordinates.latitude, latestCoordinates.longitude);
      if (current) {
        markerRef.current = L.marker(current, { draggable: true }).addTo(map);
        markerRef.current.on('dragend', (event) => setPoint(event.target.getLatLng()));
      }
      map.on('click', (event) => setPoint(event.latlng));
      window.setTimeout(() => map?.invalidateSize(), 0);
    }).catch(() => {
      if (!cancelled) setMapError('Peta belum dapat dimuat. Periksa koneksi internet atau gunakan GPS/koordinat manual.');
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const coordinates = parseMapCoordinates(latitude, longitude);
    const map = mapRef.current;
    if (!map || !window.L) return;
    if (!coordinates) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }
    if (!markerRef.current) {
      markerRef.current = window.L.marker(coordinates, { draggable: true }).addTo(map);
      markerRef.current.on('dragend', (event) => {
        const point = event.target.getLatLng();
        onChangeRef.current(String(Number(point.lat.toFixed(6))), String(Number(point.lng.toFixed(6))));
      });
    } else {
      markerRef.current.setLatLng(coordinates);
    }
    map.panTo(coordinates, { animate: false });
  }, [latitude, longitude]);

  return (
    <div className="warung-map-picker" style={{ display: 'grid', gap: 8, margin: '14px 0' }}>
      <div className="warung-map-picker-heading" style={{ display: 'grid', gap: 3, fontSize: 13 }}>
        <strong>Pilih Lokasi di Peta</strong>
        <span>Ketuk peta atau geser pin ke posisi warkop.</span>
      </div>
      <div ref={mapElement} className="warung-map-canvas" role="application" aria-label="Peta pemilih lokasi warkop" style={{ width: '100%', height: 260, borderRadius: 12, overflow: 'hidden', background: '#f1eff6', border: '1px solid #e7e4ee', zIndex: 0 }} />
      {mapError && <p className="form-hint" role="status">{mapError}</p>}
      <small className="warung-map-attribution" style={{ color: '#687080', fontSize: 11 }}>Peta © OpenStreetMap contributors</small>
    </div>
  );
}
