FROM n8nio/n8n:latest

# Variables d'environnement de base
ENV NODE_ENV=production
ENV N8N_PORT=10000
ENV N8N_PROTOCOL=https

# Active l'authentification
ENV N8N_BASIC_AUTH_ACTIVE=true

# Timezone
ENV GENERIC_TIMEZONE=America/New_York
ENV TZ=America/New_York

# Sauvegarde les executions
ENV EXECUTIONS_DATA_SAVE_ON_SUCCESS=all
ENV EXECUTIONS_DATA_SAVE_ON_ERROR=all
ENV EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true

# Crée le dossier pour les données
RUN mkdir -p /home/node/.n8n

# Expose le port
EXPOSE 10000

# Démarre n8n
CMD ["n8n", "start"]
