# VIBE — multi-usuário com login/cadastro

## Contas de verdade
- Cada pessoa cria conta com **e-mail + senha** ou **Google**
- Nome de usuário único (@usuario)
- Tela de login/cadastro antes de entrar no app
- Botão “Sair da conta” no perfil

## Configuração Firebase

### 1. Authentication
- **E-mail/senha** → ATIVAR
- **Google** → ATIVAR (opcional, mas recomendado)
- Anônimo pode ficar desativado

### 2. Firestore — regras (cole e publique)

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
    match /usernames/{name} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if false;
      allow delete: if false;
    }
  }
}
```

### 3. Chaves
Já estão no `index.html` do projeto vibeapp-53553.

## Deploy
Suba de novo no Vercel/Netlify (substitua os arquivos).

## Limitação
Fotos em base64 no Firestore (plano gratuito). Vídeos viram thumbnail.
