# VIBE — DM + notificações

## Novidades
1. **Mensagens diretas (DM)** — ícone de chat no topo
2. **Notificações no celular** — pede permissão ao entrar; avisa quando o app está em segundo plano

## Como usar DM
- Abra o perfil de alguém → **Enviar mensagem**
- Ou toque no ícone de balão no topo → lista de conversas

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
      match /seenStories/{storyId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
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
    match /conversations/{cid} {
      allow read, write: if request.auth != null && request.auth.uid in resource.data.participants;
      allow create: if request.auth != null && request.auth.uid in request.resource.data.participants;
      match /messages/{mid} {
        allow read, create: if request.auth != null &&
          request.auth.uid in get(/databases/$(database)/documents/conversations/$(cid)).data.participants;
      }
    }
  }
}
```

## Notificações push (FCM) — opcional avançado

O app já:
- Pede permissão de notificação
- Mostra alerta do sistema quando chega curtida/comentário/seguidor e o app está em segundo plano

Para push **mesmo com o app fechado** (FCM completo):
1. Firebase → Project settings → Cloud Messaging → Web Push certificates → gerar par de chaves
2. Cole a chave VAPID no `index.html` em `const VAPID_KEY = '...'`
3. Plano Blaze + Cloud Function para enviar o push ao criar notificação (servidor)

Sem Cloud Function, as notificações in-app + Web Notification (app em background na aba) já funcionam.
