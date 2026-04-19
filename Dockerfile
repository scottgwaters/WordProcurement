FROM node:20-slim

WORKDIR /app

COPY server.js .

ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
