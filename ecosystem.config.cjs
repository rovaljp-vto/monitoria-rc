// PM2 — processo da Monitoria de Qualidade no servidor.
//   pm2 start ecosystem.config.cjs && pm2 save
// As variáveis vêm de backend/.env (carregado pela aplicação).
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'monitoria-qualidade',
      // Absoluto (via __dirname): cwd relativo o PM2 resolve contra a pasta de
      // onde o comando foi chamado, não contra este arquivo.
      cwd: path.join(__dirname, 'backend'),
      script: 'dist/main.js',
      // fork, como os demais apps deste servidor. `instances` (mesmo = 1) faria
      // o PM2 assumir cluster: a porta fica com o daemon, e o health check de
      // boot (RovalOps) veria "órfão" e derrubaria TODOS os apps para recuperar.
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
