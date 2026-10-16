import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// ae:p 포털(ae2p.duckdns.org) 아래 /diary/ 에서 돈다.
// PWA(manifest·서비스워커·웹 푸시)는 도메인에 하나만 있어야 해서 포털이 맡는다
export default defineConfig({
  base: '/diary/',
  plugins: [react()],
});
