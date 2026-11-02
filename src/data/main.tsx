import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme } from '../theme';
import '../styles.css';
import './data.css';
import { DataPage } from './DataPage';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataPage />
  </StrictMode>,
);
