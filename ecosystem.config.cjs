/**
 * pm2 프로세스 정의 (Oracle Cloud 서버).
 *
 * 최초 1회:
 *   npm ci && npm run build
 *   python3 -m venv venv && ./venv/bin/pip install -r jobs/requirements.txt
 *   pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
 * 업데이트:
 *   git pull && npm ci && npm run build && pm2 startOrReload ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      // API + 알림 스케줄러 + 에이전트 모니터(pixel-agents 자식 프로세스 포함)
      name: 'kingtepad-api',
      script: 'dist/index.js',
      cwd: `${__dirname}/apps/api`,
      node_args: '--env-file=.env',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      restart_delay: 3000,
      kill_timeout: 3000,
    },
    {
      name: 'stock-job',
      script: 'jobs/run_stocks.py',
      interpreter: './venv/bin/python3',
      cwd: __dirname,
      max_memory_restart: '200M',
      restart_delay: 5000,
    },
    {
      name: 'watch-openg',
      script: 'jobs/watch_openg.py',
      interpreter: './venv/bin/python3',
      cwd: __dirname,
      max_memory_restart: '200M',
      restart_delay: 5000,
      // 개찰결과를 찾으면 알림 후 exit 0 으로 끝난다. 이때 재시작하면 알림이 반복되므로 멈춘 채로 둔다
      stop_exit_codes: [0],
    },
  ],
};
