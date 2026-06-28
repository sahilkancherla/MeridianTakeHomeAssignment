import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Distinctive type — bundled so the app renders correctly offline.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/hanken-grotesk';
import '@fontsource-variable/jetbrains-mono';

import './styles/theme.css';
import './styles/global.css';
import './styles/app.css';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
