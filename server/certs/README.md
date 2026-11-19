# Certificado SSL da Supabase (`prod-ca-2021.crt`)

Para que o PostgreSQL estabeleça conexões SSL com **validação estrita de certificado** (`rejectUnauthorized: true`), o cliente precisa confiar na Autoridade de Certificação (CA) da Supabase.

---

## 1. Como baixar o certificado oficial da Supabase

1. Acesse o painel da Supabase: **[https://supabase.com/dashboard](https://supabase.com/dashboard)**
2. Selecione o seu projeto (**SimulaMEI** / `fdkfhffcwigarpxneqzl`).
3. No menu lateral, clique em **Project Settings** (ícone de engrenagem) ➔ **Database**.
4. Role até a seção **SSL Configuration**.
5. Clique no botão **Download Certificate** (o arquivo baixado se chama `prod-ca-2021.crt`).

---

## 2. Como usar localmente

Coloque o arquivo baixado neste diretório com o nome:
```
server/certs/prod-ca-2021.crt
```
O servidor `server/db.js` detecta automaticamente este arquivo e ativa `rejectUnauthorized: true`.

---

## 3. Como usar na Vercel (Produção)

Na Vercel, o método recomendado é via variável de ambiente:

1. Acesse o painel do projeto na Vercel ➔ **Settings** ➔ **Environment Variables**.
2. Adicione uma nova variável:
   - **Key**: `SUPABASE_CA_CERT`
   - **Value**: Cole todo o conteúdo do arquivo `prod-ca-2021.crt`, incluindo:
     ```
     -----BEGIN CERTIFICATE-----
     ...
     -----END CERTIFICATE-----
     ```
   - **Environments**: Marque `Production`, `Preview`, `Development`.
3. Salve. O `server/db.js` passará a validar a conexão de ponta a ponta na Vercel.

---

## 4. Testar a conexão com certificado

Para verificar se a conexão e o certificado estão funcionando corretamente, execute:
```bash
node server/scripts/test_db_ssl.js
```
