#!/usr/bin/env bash
# Instala o servidor do WhatsApp (Evolution API) numa máquina Ubuntu nova.
# Uso, dentro da máquina:  bash instalar.sh
# Pode rodar de novo: mantém as senhas já criadas.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Instalando o Docker (se ainda não tiver)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" || true

echo "==> Liberando as portas 80 e 443 no firewall da máquina"
# As imagens Ubuntu da Oracle Cloud bloqueiam tudo além do SSH por padrão.
for porta in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$porta" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport "$porta" -j ACCEPT
done
if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save; fi

echo "==> Memória extra (swap), útil em máquinas pequenas"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

IP=$(curl -fsS https://api.ipify.org)
DOMINIO="${DOMINIO:-$(echo "$IP" | tr . -).sslip.io}"

if [ ! -f .env ]; then
  echo "==> Criando as senhas"
  CHAVE=$(openssl rand -hex 32)
  SENHA_BANCO=$(openssl rand -hex 24)
  cat > .env <<EOF
# Gerado pelo instalar.sh. Não compartilhe este arquivo.
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://$DOMINIO
AUTHENTICATION_API_KEY=$CHAVE
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false

DATABASE_PROVIDER=postgresql
POSTGRES_PASSWORD=$SENHA_BANCO
DATABASE_CONNECTION_URI=postgresql://evolution:$SENHA_BANCO@postgres:5432/evolution?schema=public
DATABASE_CONNECTION_CLIENT_NAME=evolution
# Guarda só a sessão de cada WhatsApp. Mensagens, contatos e conversas não são salvos.
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=false
DATABASE_SAVE_MESSAGE_UPDATE=false
DATABASE_SAVE_DATA_CONTACTS=false
DATABASE_SAVE_DATA_CHATS=false
DATABASE_SAVE_DATA_LABELS=false
DATABASE_SAVE_DATA_HISTORIC=false

CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://redis:6379/6
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_REDIS_SAVE_INSTANCES=false
CACHE_LOCAL_ENABLED=false

# Nome que aparece em "Aparelhos conectados" no WhatsApp.
CONFIG_SESSION_PHONE_CLIENT=Controle Financeiro
CONFIG_SESSION_PHONE_NAME=Chrome
QRCODE_LIMIT=30
DEL_INSTANCE=false
WEBHOOK_GLOBAL_ENABLED=false
LOG_LEVEL=ERROR,WARN
EOF
  chmod 600 .env
fi

cat > Caddyfile <<EOF
$DOMINIO {
  reverse_proxy evolution:8080
}
EOF

echo "==> Subindo o servidor (a primeira vez demora alguns minutos)"
sudo docker compose pull
sudo docker compose up -d

echo "==> Esperando o endereço https ficar pronto"
for i in $(seq 1 60); do
  if curl -fsS "https://$DOMINIO" >/dev/null 2>&1; then break; fi
  sleep 5
done

CHAVE=$(grep '^AUTHENTICATION_API_KEY=' .env | cut -d= -f2)
echo
echo "================================================================"
echo " Servidor pronto."
echo
echo " EVOLUTION_URL     = https://$DOMINIO"
echo " EVOLUTION_API_KEY = $CHAVE"
echo
echo " Copie os dois valores para gravar no Supabase. Não mande a chave"
echo " por chat nem e-mail."
echo "================================================================"
