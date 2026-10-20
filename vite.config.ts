import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' = funktioniert unter jeder GitHub-Pages-Adresse ohne Anpassung
export default defineConfig({ base: './', plugins: [react()] });
