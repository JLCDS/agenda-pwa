import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree/wght.css';
import './estilos.css';
import App from './App';
import { aplicarPreferencias, leerPreferencias } from './lib/preferencias';
import { iniciarSincronizacion } from './lib/sincronizacion';

aplicarPreferencias(leerPreferencias());
iniciarSincronizacion();
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
