module.exports = {
  apps: [
    {
      name: 'skillquest-backend',
      script: 'backend/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/pm2/skillquest-error.log',
      out_file: '/var/log/pm2/skillquest-out.log',
      merge_logs: true
    }
  ]
};
