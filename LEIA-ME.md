# VIBE — regras Firestore atualizadas

## Novidades desta versão
- Stories com **visualização única** (cada story só aparece 1 vez por usuário)
- Clique no logo **VIBE** atualiza o feed
- Clique no **nome do usuário** no post abre o perfil dele

## Regras (cole e publique)

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
  }
}
```
