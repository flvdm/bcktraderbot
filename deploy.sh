#!/bin/bash
set -e

echo "Pulling latest code..."
git pull origin main

echo "Installing dependencies..."
npm install --production

echo "Building (if needed)..."
npm run build

echo "Restarting app with PM2..."
pm2 restart all --update-env

echo "Deploy completed!"
