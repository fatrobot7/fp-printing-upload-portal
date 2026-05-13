#!/bin/bash
pkill -f "node server.js" >/dev/null 2>&1 || true
echo "Stopped Mailing Pros preview server."
