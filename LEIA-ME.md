# VIBE — multi-usuário GRATUITO (sem Storage / sem Blaze)

Esta versão **não usa Firebase Storage**.  
Fotos são comprimidas e salvas como base64 dentro do Firestore.  
Funciona 100% no plano **Spark (gratuito)**.

## O que funciona
- Login anônimo automático
- Feed compartilhado em tempo real (todo mundo vê as fotos de todo mundo)
- Curtidas e comentários sincronizados
- Exclusão pelo dono do post
- Fotos (comprimidas automaticamente)
- PWA instalável

## Limitação
- **Vídeos completos** não são enviados para a nuvem nesta versão (ficam grandes demais para o Firestore).  
  Se gravar vídeo, o app publica o **thumbnail** (foto do vídeo) em vez do arquivo de vídeo.

## Configuração (só isso)

### 1. Authentication
Já está ativado o **Anônimo** ✅

### 2. Firestore
1. No Firebase Console → **Build → Firestore Database → Create database**
2. Escolha **Start in test mode**
3. Região: `southamerica-east1` (ou a mais próxima)

### 3. Cole as chaves no código
1. No Firebase → Project settings (engrenagem) → Your apps → Web
2. Se ainda não tiver app Web, clique em `</>` e registre um
3. Copie o `firebaseConfig`
4. Abra o `index.html` e substitua o bloco:

```js
const firebaseConfig = {
  apiKey: "COLE_AQUI",
  ...
};
```

### 4. Regras do Firestore (cole e publique)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 5. Publicar
Suba a pasta no **Netlify** (arrastar) ou Vercel / Cloudflare Pages.

## Arquivos
- index.html
- manifest.json
- sw.js
- ícones
- este LEIA-ME.md
