import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {Toaster} from './components/ui/toast';
import './styles/theme.css';
import './styles/app.css';
import './styles/soc.css';
import './styles/evidenceWorkbench.css';
createRoot(document.getElementById('root')!).render(<StrictMode><App/><Toaster/></StrictMode>);
