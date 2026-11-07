const DEFAULT_REGION = Object.freeze({
  mode: 'all',
  label: 'Semua Lokasi',
  query: '',
});

export function createInitialDiscoveryState(location = DEFAULT_REGION) {
  const regionScope = location && typeof location === 'object'
    ? { ...DEFAULT_REGION, ...location }
    : { ...DEFAULT_REGION };

  return {
    query: '',
    category: 'all',
    regionScope,
    facilities: [],
    activities: [],
    operational: 'semua',
    sort: 'relevance',
    viewMode: 'list',
  };
}

function toggleValue(values, value) {
  if (typeof value !== 'string' || !value.trim()) return values;
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function discoveryReducer(state, action) {
  if (!state || !action || typeof action.type !== 'string') return state;

  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: String(action.value ?? '') };
    case 'SET_CATEGORY':
      return typeof action.value === 'string' && action.value
        ? { ...state, category: action.value }
        : state;
    case 'SET_REGION':
      return action.value && typeof action.value === 'object'
        ? { ...state, regionScope: { ...action.value } }
        : state;
    case 'TOGGLE_FACILITY': {
      const facilities = toggleValue(state.facilities, action.value);
      return facilities === state.facilities ? state : { ...state, facilities };
    }
    case 'TOGGLE_ACTIVITY': {
      const activities = toggleValue(state.activities, action.value);
      return activities === state.activities ? state : { ...state, activities };
    }
    case 'SET_OPERATIONAL':
      return typeof action.value === 'string' && action.value
        ? { ...state, operational: action.value }
        : state;
    case 'SET_SORT':
      return typeof action.value === 'string' && action.value
        ? { ...state, sort: action.value }
        : state;
    case 'SET_VIEW_MODE':
      return action.value === 'list' || action.value === 'map'
        ? { ...state, viewMode: action.value }
        : state;
    case 'RESET_FILTERS':
      return {
        ...state,
        query: '',
        category: 'all',
        facilities: [],
        activities: [],
        operational: 'semua',
        sort: 'relevance',
      };
    default:
      return state;
  }
}
