import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DemoProvider } from './state/DemoContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <DemoProvider>
    <App />
  </DemoProvider>,
);
