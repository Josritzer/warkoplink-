import { describe, expect, it } from 'vitest';
import { createInitialDiscoveryState, discoveryReducer } from './discoveryState.js';

describe('discovery state', () => {
  it('starts with nationwide scope, all categories, list view, and empty filters', () => {
    expect(createInitialDiscoveryState()).toEqual({
      query: '',
      category: 'all',
      regionScope: { mode: 'all', label: 'Semua Lokasi', query: '' },
      facilities: [],
      activities: [],
      operational: 'semua',
      sort: 'relevance',
      viewMode: 'list',
    });
  });

  it('uses the supplied location as the initial region scope', () => {
    const location = { mode: 'province', label: 'Jawa Timur', query: 'Jawa Timur' };
    expect(createInitialDiscoveryState(location).regionScope).toEqual(location);
  });

  it('changes only the query when SET_QUERY is dispatched', () => {
    const state = createInitialDiscoveryState();
    const next = discoveryReducer(state, { type: 'SET_QUERY', value: 'kopi susu' });
    expect(next.query).toBe('kopi susu');
    expect(next.category).toBe(state.category);
    expect(next.regionScope).toBe(state.regionScope);
  });

  it('changes only the selected category', () => {
    const state = createInitialDiscoveryState();
    expect(discoveryReducer(state, { type: 'SET_CATEGORY', value: 'nearby' })).toMatchObject({
      ...state, category: 'nearby',
    });
  });

  it('toggles facilities on and off without duplicates', () => {
    const state = createInitialDiscoveryState();
    const selected = discoveryReducer(state, { type: 'TOGGLE_FACILITY', value: 'Wi-Fi' });
    expect(selected.facilities).toEqual(['Wi-Fi']);
    expect(discoveryReducer(selected, { type: 'TOGGLE_FACILITY', value: 'Wi-Fi' }).facilities).toEqual([]);
  });

  it('toggles activities on and off without duplicates', () => {
    const state = createInitialDiscoveryState();
    const selected = discoveryReducer(state, { type: 'TOGGLE_ACTIVITY', value: 'nobar' });
    expect(selected.activities).toEqual(['nobar']);
    expect(discoveryReducer(selected, { type: 'TOGGLE_ACTIVITY', value: 'nobar' }).activities).toEqual([]);
  });

  it('updates region, operational filter, sort, and view mode independently', () => {
    const state = createInitialDiscoveryState();
    const region = { mode: 'province', label: 'Jawa Timur', query: 'Jawa Timur' };
    const withRegion = discoveryReducer(state, { type: 'SET_REGION', value: region });
    expect(withRegion.regionScope).toEqual(region);
    expect(discoveryReducer(state, { type: 'SET_OPERATIONAL', value: 'buka-sekarang' }).operational).toBe('buka-sekarang');
    expect(discoveryReducer(state, { type: 'SET_SORT', value: 'distance' }).sort).toBe('distance');
    expect(discoveryReducer(state, { type: 'SET_VIEW_MODE', value: 'map' }).viewMode).toBe('map');
  });

  it('resets query and filters while preserving region scope and view mode', () => {
    const initial = createInitialDiscoveryState({ mode: 'province', label: 'Jawa Timur', query: 'Jawa Timur' });
    const state = {
      ...initial,
      query: 'kopi',
      facilities: ['Wi-Fi'],
      activities: ['nobar'],
      operational: 'buka-sekarang',
      sort: 'distance',
      viewMode: 'map',
    };
    expect(discoveryReducer(state, { type: 'RESET_FILTERS' })).toEqual({
      ...state,
      query: '',
      facilities: [],
      activities: [],
      operational: 'semua',
      sort: 'relevance',
    });
  });

  it('returns the same state for unknown actions and invalid toggle values', () => {
    const state = createInitialDiscoveryState();
    expect(discoveryReducer(state, { type: 'UNKNOWN' })).toBe(state);
    expect(discoveryReducer(state, { type: 'TOGGLE_FACILITY', value: '' })).toBe(state);
  });
});
