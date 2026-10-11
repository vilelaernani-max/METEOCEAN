#!/bin/bash
# Igual ao iniciar, mas liberando acesso pelo celular na mesma rede Wi-Fi (sem senha: só rede de casa).
cd "$(dirname "$0")"
METEOCEAN_HOST=0.0.0.0 python3 run.py
