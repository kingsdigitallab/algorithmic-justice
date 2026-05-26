#!/bin/bash
set -e



npm install -g opencode-ai
cd app && npm ci
# cd ../tools && npm ci

# apt update -y
# apt install -y openssh-client openssh-server

# sudo /usr/sbin/sshd
