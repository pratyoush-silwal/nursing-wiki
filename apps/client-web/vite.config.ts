import { defineConfig } from 'vite';
export default defineConfig({base:'/client/',server:{proxy:{'/api':{target:'http://127.0.0.1:3000',rewrite:path=>path.replace(/^\/api/,'')}}}});
