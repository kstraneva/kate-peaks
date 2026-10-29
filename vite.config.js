import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built site work from any path, e.g. GitHub Pages project sites.
export default defineConfig({ base: './', plugins: [react()] });
