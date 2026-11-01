import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';
import './chat-compact.css';
import './ui-2026.css';
import './interaction-states-2026.css';
import './chat-2026.css';
import './theme-2026.css';
import './warkoplink-reference-blend.css';
import './feed-border-reset.css';
import './global-menu-divider-reset.css';
import './wl-visual-system.css';
// Must load last so responsive overflow safeguards cannot be overridden.
import './mobile-layout-safety.css';
// Luxury editorial layer is retained for the existing page composition.
import './wl-luxury-2026.css';
// Glass is limited to navigation/overlays; Card Play styles actionable directory content.
import './wl-glass-card-play.css';
import './notifications/notifications.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
