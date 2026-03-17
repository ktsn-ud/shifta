FROM node:22-bookworm-slim

ENV HOME=/home/node \
    CODEX_HOME=/home/node/.codex

WORKDIR /workspace

# 必要なツール
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  curl \
  vim \
  less \
  procps \
  ca-certificates \
  socat \
  && rm -rf /var/lib/apt/lists/*

# corepack を有効化し、pnpm をビルド時に取得しておく
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

# Codex CLI
RUN npm install -g @openai/codex

# コンテナ内 localhost:3000 で Codex CLI がアクセスできるようにするための設定
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# node ユーザー用ディレクトリを明示的に作る
RUN mkdir -p /home/node/.codex /home/node/.npm \
  && chown -R node:node /home/node /workspace /usr/local/bin/docker-entrypoint.sh

USER node

ENTRYPOINT [ "docker-entrypoint.sh" ]
CMD ["bash"]