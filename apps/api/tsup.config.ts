import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  target: 'node22',
  clean: true,
  // 워크스페이스 공유 패키지는 TS 소스라 번들에 포함
  noExternal: ['@kingtepad/shared'],
});
