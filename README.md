# bloco-maisvarejo

Dashboard Estratégico 5W2H — WillTech Diretoria.

## Rodar localmente

1. Instalar dependências: `npm install`
2. Copiar `.env.example` para `.env.local` e preencher (Firebase, senha).
3. Rodar: `npm run dev`

## Commit automático (.exe)

Script que faz `git add .`, commit com mensagem datada e, opcionalmente, `git push`.

- **Sem .exe (Node):**  
  `npm run auto-commit` — só commit  
  `npm run auto-commit:push` — commit + push  

- **Gerar o .exe:**  
  `npm run build:auto-commit` → gera `dist/auto-commit.exe`

- **Uso do .exe:**  
  Na pasta do repositório (ou passando o caminho):  
  `auto-commit.exe` — commit e **sobe pro GitHub**  
  `auto-commit.exe --no-push` — só commit (não envia)  
  `auto-commit.exe C:\caminho\do\repo` — commit + push nesse repo
