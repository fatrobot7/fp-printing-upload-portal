#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install || exit 1
fi
pkill -f "node server.js" >/dev/null 2>&1 || true
nohup npm start >/tmp/mailing-pros-upload.log 2>&1 &
sleep 2
open "http://127.0.0.1:3030"
echo "Mailing Pros preview should now be opening in your browser."
