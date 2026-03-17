#!/usr/bin/env bash
set -e

socat TCP-LISTEN:3000,fork,reuseaddr TCP:host.docker.internal:3000 &
exec "$@"