import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import WarungDiscoveryMap from './WarungDiscoveryMap.jsx';

afterEach(() => {
  cleanup();
  delete window.L;
});

describe('WarungDiscoveryMap', () => {
  it('plots verified warkop with valid coordinates and opens the selected profile', async () => {
    let markerClick;
    const map = { setView: vi.fn(() => map), remove: vi.fn(), invalidateSize: vi.fn(), fitBounds: vi.fn() };
    const group = { addTo: vi.fn(() => group), clearLayers: vi.fn() };
    const marker = {
      bindTooltip: vi.fn(() => marker),
      on: vi.fn((event, callback) => { if (event === 'click') markerClick = callback; }),
      addTo: vi.fn(() => marker)
    };
    const L = {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      featureGroup: vi.fn(() => group),
      marker: vi.fn(() => marker)
    };
    Object.defineProperty(window, 'L', { configurable: true, value: L });
    const onOpenWarung = vi.fn();
    const { getByText } = render(<WarungDiscoveryMap warungs={[
      { id: 'w1', name: 'Kopi Maduran', coordinates: { lat: -7.05, lng: 112.3 } },
      { id: 'w2', name: 'Tanpa Koordinat' }
    ]} onOpenWarung={onOpenWarung}/>);
    expect(getByText('1 titik warkop')).toBeTruthy();
    await waitFor(() => expect(L.marker).toHaveBeenCalledOnce());
    expect(L.marker).toHaveBeenCalledWith([-7.05, 112.3]);
    markerClick();
    expect(onOpenWarung).toHaveBeenCalledWith('w1');
  });
});
