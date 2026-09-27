# VIBE — login + stories + perfil + seguidores + notificações

## Novidades
- Stories reais (24h) — toque em “Seu story” e escolha uma foto
- Editar perfil: foto, @usuário e bio
- Seguidores / seguindo reais
- Notificações reais (curtida, comentário, novo seguidor)

## Regras Firestore (cole e publique)

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
      match /following/{id} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }
      match /followers/{id} {
        allow read: if true;
        allow write: if request.auth != null;
      }
    }
    match /usernames/{name} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth != null;
      allow update: if false;
    }
    match /stories/{id} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    match /notifications/{id} {
      allow read: if request.auth != null && request.auth.uid == resource.data.toUserId;
      allow create: if request.auth != null;
      allow update: if request.auth != null && request.auth.uid == resource.data.toUserId;
      allow delete: if request.auth != null && request.auth.uid == resource.data.toUserId;
    }
  }
}
```

## Como usar
1. Publique as regras acima
2. Suba o ZIP no Vercel (substitua os arquivos)
3. Stories: toque no círculo “Seu story”
4. Perfil: botão “Editar perfil”
5. Notificações aparecem na aba de atividade (coração)
