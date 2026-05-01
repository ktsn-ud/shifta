#!/usr/bin/env bash
set -e

socat TCP-LISTEN:3000,fork,reuseaddr TCP:host.docker.internal:3000 &

if [ "$(id -u)" = "0" ]; then
	mkdir -p /workspace/node_modules
	chown -R node:node /workspace/node_modules

	if command -v runuser >/dev/null 2>&1; then
		exec runuser -u node -- "$@"
	fi

	exec su -s /bin/bash node -c "exec $*"
fi

exec "$@"