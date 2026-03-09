import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter';

import { App } from './App';
import { ThemeProvider } from './context/ThemeContext';
import '../packages/core/src/input.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element "#root" was not found in the document.');
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
