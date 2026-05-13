#!/usr/bin/env node

const { execSync } = require('node:child_process')

const env = {
  ...process.env,
  NODE_ENV: 'production',
}

execSync('npm --prefix web run build', { stdio: 'inherit', env })
execSync('npm run stage:web-host', { stdio: 'inherit' })
