import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

console.log('🚀 React entry point loaded');

// Initialize React app when DOM is loaded
const initializeReact = () => {
    console.log('🔄 Initializing React application...');

    try {
        const container = document.getElementById('react-root');
        if (!container) {
            console.error('❌ React root container not found! Looking for element with id="react-root"');
            console.log('Available elements with IDs:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));
            console.log('Body innerHTML preview:', document.body.innerHTML.substring(0, 500));
            return;
        }

        console.log('✅ React root container found, creating React root...');
        const root = createRoot(container);

        console.log('✅ React root created, rendering App component...');
        root.render(<App />);

        console.log('✅ React App component rendered successfully');

        // Hide loading screen
        setTimeout(() => {
            document.body.classList.add('react-loaded');
        }, 500);

    } catch (error) {
        console.error('❌ Failed to initialize React:', error);

        // Show error in loading screen
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">React Error</div>
                <div style="font-size: 1rem; color: #cccccc; margin-bottom: 2rem;">${error.message}</div>
                <div style="font-size: 0.9rem; color: #999;">Check console for details</div>
            `;
        }
    }
};

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeReact);
} else {
    // DOM is already ready
    initializeReact();
}
