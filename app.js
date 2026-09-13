import {
  auth,
  db,
  storage,
  signInAnonymously,
  onAuthStateChanged,
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  where,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from './firebase.js';

(function(){
  const GRADIENTS = [
    'linear-gradient(135deg,#4DE8FF,#A78BFA)',
    'linear-gradient(135deg,#FF3DBD,#A78BFA)',
    'linear-gradient(135deg,#C6FF5C,#4DE8FF)',
    'linear-gradient(135deg,#FF3DBD,#C6FF5C)',
    'linear-gradient(135deg,#4DE8FF,#FF3DBD)',
    'linear-gradient(135deg,#A78BFA,#C6FF5C)'
  ];
  function gradFor(name){
    let h=0; for(const c of (name||'?')) h = (h*31 + c.charCodeAt(0)) % GRADIENTS.length;
    return GRADIENTS[h];
  }
  function uid(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id'+Date.now()+'-'+Math.random().toString(36).slice(2);
  }

  // Persistência e sincronização agora ficam no Firebase.
  // Os arquivos de foto/vídeo vão para Firebase Storage e os metadados para Firestore.
  // O estado de curtida/salvo é específico do usuário anônimo atual.

  let currentUser = null;
  let postsUnsubscribe = null;
  let activityUnsubscribe = null;
  let resolveAuthReady;
  const authReady = new Promise(resolve => { resolveAuthReady = resolve; });
  const mediaObjectUrls = {};
  const localSaved = new Set();
  const localLiked = new Set();

  const SEED_POSTS = [
    {id:'s1', user:'mia.rocha', loc:'Praia do Futuro, Fortaleza', mediaType:'image', img:'https://picsum.photos/seed/vibe1/600/750', caption:'sol, mar e nenhum plano pra hoje 🌅', likes:482, liked:false, saved:false, comments:[{user:'joaop', text:'que vibe boa!'},{user:'ana.k', text:'preciso ir la'}], time:'2H', trending:true},
    {id:'s2', user:'thecoffeeguy', loc:'Beco do Cafe', mediaType:'image', img:'https://picsum.photos/seed/vibe2/600/750', caption:'primeiro gole do dia ☕', likes:211, liked:false, saved:false, comments:[{user:'lu.dias', text:'cheiro daqui'}], time:'4H'},
    {id:'s3', user:'nightowl.rec', loc:'Estudio 12', mediaType:'image', img:'https://picsum.photos/seed/vibe3/600/750', caption:'gravando ate tarde, novo som chegando 🎧', likes:906, liked:true, saved:true, comments:[{user:'dj.fefe', text:'ansioso pra ouvir'},{user:'bia', text:"let's go"}], time:'6H'},
    {id:'s4', user:'trilhaverde', loc:'Serra da Meruoca', mediaType:'image', img:'https://picsum.photos/seed/vibe4/600/750', caption:'topo alcancado, vista que vale cada passo', likes:154, liked:false, saved:false, comments:[], time:'1D'},
    {id:'s5', user:'gabi.fotos', loc:'Centro Historico', mediaType:'image', img:'https://picsum.photos/seed/vibe5/600/750', caption:'a cidade em tons quentes hoje', likes:337, liked:false, saved:false, comments:[{user:'raulzin', text:'edicao top'}], time:'1D'}
  ];
  const STORY_USERS = [
    {user:'mia.rocha', img:'https://picsum.photos/seed/story1/500/900'},
    {user:'thecoffeeguy', img:'https://picsum.photos/seed/story2/500/900'},
    {user:'nightowl.rec', img:'https://picsum.photos/seed/story3/500/900'},
    {user:'trilhaverde', img:'https://picsum.photos/seed/story4/500/900'},
    {user:'gabi.fotos', img:'https://picsum.photos/seed/story5/500/900'}
  ];
  let ACTIVITY = [
    {avatar:'mia.rocha', text:'curtiu sua foto', time:'3min', thumb:'https://picsum.photos/seed/actv1/80/80'},
    {avatar:'thecoffeeguy', text:'comecou a seguir voce', time:'25min'},
    {avatar:'nightowl.rec', text:'comentou: "muito bom!"', time:'1h', thumb:'https://picsum.photos/seed/actv2/80/80'},
    {avatar:'trilhaverde', text:'curtiu sua foto', time:'3h', thumb:'https://picsum.photos/seed/actv3/80/80'},
    {avatar:'gabi.fotos', text:'mencionou voce em um comentario', time:'1d'}
  ];
  const CAPTION_IDEAS = [
    'vivendo no meu melhor timeline ✨',
    'essa e a vibe do momento 🌌',
    'capturando frequencias boas 🎧',
    'modo holograma ativado ✨',
    'outro dia, outro highlight reel 🌠',
    'sincronizado com o universo hoje 🔮',
    'salvando esse frame pra sempre 💾'
  ];
  const SIMULATED_ENGAGERS = ['mia.rocha','thecoffeeguy','nightowl.rec','trilhaverde','gabi.fotos'];

  let posts = [];
  let activeCommentPostId = null;
  let cameraStream = null;
  let facingMode = 'user';
  let captureMode = 'photo'; // 'photo' | 'video'
  let capturedBlob = null;
  let capturedMediaType = 'image';
  let capturedThumb = null; // dataURL usado como poster para videos
  let mediaRecorder = null;
  let recordedChunks = [];
  let recTimerInterval = null;
  let recStartedAt = 0;
  let pressTimer = null;
  let hasUnseenActivity = true;
  let deferredInstallPrompt = null;

  async function loadPosts(){
    // Os posts chegam em tempo real pelo listener iniciado depois do login.
    posts = [];
  }

  async function savePosts(){
    // Mantido por compatibilidade com o código da interface.
    // Alterações reais são gravadas diretamente nas funções Firebase.
    return true;
  }

  function initials(name){ const clean = (name||'?').replace(/[^a-zA-Z]/g,''); return (clean[0]||'?').toUpperCase(); }

  function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 1800);
  }

  /* Resolve a URL exibivel de um post: seed usa "img" remoto direto,
     posts do usuario usam mediaKey (indexedDB). Retorna via callback
     para permitir lookup assincrono sem travar a renderizacao. */
  async function resolveSrc(p){
    if (p.mediaUrl) return p.mediaUrl;
    if (p.mediaKey && mediaObjectUrls[p.mediaKey]) return mediaObjectUrls[p.mediaKey];
    if (p.mediaKey) {
      try {
        const url = await getDownloadURL(ref(storage, p.mediaKey));
        mediaObjectUrls[p.mediaKey] = url;
        return url;
      } catch(e) {
        return null;
      }
    }
    return p.img || null;
  }

  async function resolveThumb(p){
    if (p.mediaType === 'video') return p.thumb || p.img || '';
    return resolveSrc(p);
  }

  function renderStories(){
    const row = document.getElementById('storiesRow');
    row.innerHTML = '';
    const you = document.createElement('div');
    you.className = 'story';
    you.innerHTML = `<div class="ring-spin you-add" style="position:relative;"><div class="avatar" style="background:${gradFor('you')};">Y<div class="plus-badge">+</div></div></div><span>Voce</span>`;
    you.onclick = ()=> openCamera();
    row.appendChild(you);
    STORY_USERS.forEach(s=>{
      const el = document.createElement('div');
      el.className = 'story';
      el.innerHTML = `<div class="ring-spin"><div class="avatar" style="background:${gradFor(s.user)};">${initials(s.user)}</div></div><span>${s.user.split('.')[0]}</span>`;
      el.onclick = ()=> openStory(s);
      row.appendChild(el);
    });
  }

  function postCard(p){
    const el = document.createElement('div');
    el.className = 'post';
    const isMine = !!currentUser && p.ownerId === currentUser.uid;
    el.innerHTML = `
      <div class="post-head">
        <div class="avatar" style="background:${gradFor(p.user)};">${initials(p.user)}</div>
        <div class="who"><div class="uname">${p.user}${isMine ? '<span class="you-tag">VOCE</span>' : ''}</div><div class="loc">${p.loc||''}</div></div>
        <button class="icon-btn menu-btn" style="background:transparent; border:none;"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
      </div>
      <div class="post-img-wrap">
        <div class="media-slot" style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px;">carregando...</div>
        ${p.trending ? `<div class="trend-badge">🔥 <span>EM ALTA</span></div>` : ''}
        ${p.mediaType==='video' ? `<div class="video-badge"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10 8 6 4-6 4V8Z"/><rect x="2" y="4" width="20" height="16" rx="3"/></svg></div>` : ''}
        <div class="burst-heart"><svg viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1"><path d="M12 21s-7.5-4.7-10-9.3C.3 8.2 2 4.5 5.7 4c2.1-.3 4 1 6.3 3.4C14.3 5 16.2 3.7 18.3 4c3.7.5 5.4 4.2 3.7 7.7C19.5 16.3 12 21 12 21z"/></svg></div>
      </div>
      <div class="actions">
        <button class="icon-btn heart-btn ${p.liked?'liked':''}"><svg viewBox="0 0 24 24" fill="${p.liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.7-10-9.3C.3 8.2 2 4.5 5.7 4c2.1-.3 4 1 6.3 3.4C14.3 5 16.2 3.7 18.3 4c3.7.5 5.4 4.2 3.7 7.7C19.5 16.3 12 21 12 21z"/></svg></button>
        <button class="icon-btn comment-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></button>
        <button class="icon-btn share-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg></button>
        <div class="spacer"></div>
        <button class="icon-btn bookmark-btn ${p.saved?'saved':''}"><svg viewBox="0 0 24 24" fill="${p.saved?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/></svg></button>
      </div>
      <div class="likes-line">${p.likes.toLocaleString('pt-BR')} curtidas</div>
      <div class="caption"><b>${p.user}</b>${p.caption}</div>
      ${p.comments.length ? `<div class="view-comments">Ver ${p.comments.length===1?'1 comentario':p.comments.length+' comentarios'}</div>` : `<div class="view-comments">Adicionar comentario</div>`}
      <div class="timestamp">${p.time}</div>
    `;
    const imgWrap = el.querySelector('.post-img-wrap');
    const slot = el.querySelector('.media-slot');
    resolveSrc(p).then(src=>{
      if(!src){ slot.textContent = 'midia indisponivel'; return; }
      if(p.mediaType === 'video'){
        slot.outerHTML = `<video class="post-video" src="${src}" ${p.thumb?`poster="${p.thumb}"`:''} playsinline loop muted></video><div class="play-overlay show"><svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M8 5v14l11-7Z"/></svg></div><button class="mute-btn"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M23 9 17 15M17 9l6 6"/></svg></button>`;
        wireVideo();
      } else {
        const img = document.createElement('img');
        img.alt = 'post';
        img.src = src;
        // Se o URL salvo no documento estiver expirado/inválido, tenta
        // novamente pelo caminho do Storage. Isso também cobre posts
        // antigos que só possuem mediaKey.
        img.onerror = async ()=>{
          if(!p.mediaKey) {
            img.alt = 'midia indisponivel';
            return;
          }
          try {
            const fallback = await getDownloadURL(ref(storage, p.mediaKey));
            if(fallback && fallback !== img.src) {
              mediaObjectUrls[p.mediaKey] = fallback;
              img.src = fallback;
            }
          } catch(e) {
            img.alt = 'midia indisponivel';
          }
        };
        slot.replaceWith(img);
      }
    });
    function wireVideo(){
      const video = imgWrap.querySelector('.post-video');
      const overlay = imgWrap.querySelector('.play-overlay');
      const muteBtn = imgWrap.querySelector('.mute-btn');
      video.muted = true;
      video.addEventListener('click', (e)=>{
        if(e.target === muteBtn || muteBtn.contains(e.target)) return;
      });
      function togglePlay(){
        if(video.paused){ video.play().catch(()=>{}); overlay.classList.remove('show'); }
        else { video.pause(); overlay.classList.add('show'); }
      }
      video._togglePlay = togglePlay;
      video.addEventListener('click', togglePlay);
      muteBtn.onclick = (e)=>{
        e.stopPropagation();
        video.muted = !video.muted;
        muteBtn.querySelector('svg').innerHTML = video.muted
          ? '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M23 9 17 15M17 9l6 6"/>'
          : '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/>';
      };
    }
    const heartBtn = el.querySelector('.heart-btn');
    heartBtn.onclick = ()=> toggleLike(p, heartBtn, el);
    let lastTap = 0;
    imgWrap.addEventListener('click', (e)=>{
      if(e.target.closest('.mute-btn')) return;
      const now = Date.now();
      if(now - lastTap < 300){
        if(!p.liked) toggleLike(p, heartBtn, el);
        const burst = el.querySelector('.burst-heart');
        burst.classList.remove('pop'); void burst.offsetWidth; burst.classList.add('pop');
      }
      lastTap = now;
    });
    el.querySelector('.bookmark-btn').onclick = async (e)=>{
      if(!currentUser) return;
      const savedRef = doc(db, 'users', currentUser.uid, 'saved', p.id);
      const willSave = !localSaved.has(p.id);
      try {
        if(willSave) {
          await setDoc(savedRef, {postId:p.id, savedAt:serverTimestamp()});
          localSaved.add(p.id);
        } else {
          await deleteDoc(savedRef);
          localSaved.delete(p.id);
        }
        p.saved = willSave;
        e.currentTarget.classList.toggle('saved', willSave);
        const svg = e.currentTarget.querySelector('svg');
        svg.setAttribute('fill', willSave ? 'currentColor':'none');
        showToast(willSave ? 'Salvo' : 'Removido dos salvos');
        renderProfile();
      } catch(err) {
        showToast('Não foi possível salvar');
      }
    };
    el.querySelector('.share-btn').onclick = ()=> sharePost(p);
    el.querySelector('.comment-btn').onclick = ()=> openComments(p.id);
    el.querySelector('.view-comments').onclick = ()=> openComments(p.id);
    el.querySelector('.menu-btn').onclick = ()=> openPostMenu(p);
    return el;
  }

  async function sharePost(p){
    const shareText = `${p.caption} — via VIBE`;
    try{
      if(navigator.share){
        await navigator.share({ title:'VIBE', text: shareText, url: location.href });
        showToast('Compartilhado!');
        return;
      }
    }catch(e){ /* usuario cancelou ou nao suportado, cai no fallback */ }
    try{
      await navigator.clipboard.writeText(shareText + ' ' + location.href);
      showToast('Link copiado');
    }catch(e){
      showToast('Nao foi possivel compartilhar');
    }
  }

  async function toggleLike(p, btn, cardEl){
    if(!currentUser) return;

    const likeRef = doc(db, 'posts', p.id, 'likes', currentUser.uid);
    const willLike = !localLiked.has(p.id);

    try {
      await runTransaction(db, async (tx)=>{
        const snap = await tx.get(likeRef);
        const postRef = doc(db, 'posts', p.id);
        const postSnap = await tx.get(postRef);
        if(!postSnap.exists()) throw new Error('Post não encontrado');

        const currentLikes = Number(postSnap.data().likes || 0);
        if(willLike && !snap.exists()) {
          tx.set(likeRef, {userId:currentUser.uid, createdAt:serverTimestamp()});
          tx.update(postRef, {likes:currentLikes + 1});
        } else if(!willLike && snap.exists()) {
          tx.delete(likeRef);
          tx.update(postRef, {likes:Math.max(0, currentLikes - 1)});
        }
      });

      if(willLike) localLiked.add(p.id); else localLiked.delete(p.id);
      p.liked = willLike;
      p.likes += willLike ? 1 : -1;
      btn.classList.toggle('liked', willLike);
      btn.querySelector('svg').setAttribute('fill', willLike ? 'currentColor':'none');
      btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse');
      cardEl.querySelector('.likes-line').textContent = p.likes.toLocaleString('pt-BR') + ' curtidas';
    } catch(err) {
      showToast('Não foi possível curtir');
    }
  }

  function renderFeed(){
    const list = document.getElementById('feedList');
    list.innerHTML = '';
    if(posts.length === 0){
      list.innerHTML = `<div class="empty-state">Seu feed esta vazio<br><button id="feedEmptyCamBtn">Compartilhar seu primeiro momento</button></div>`;
      document.getElementById('feedEmptyCamBtn').onclick = openCamera;
      return;
    }
    posts.forEach(p => list.appendChild(postCard(p)));
  }

  function normalize(str){
    return (str||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  async function gridCell(p, opts){
    opts = opts || {};
    const cell = document.createElement('div');
    cell.className = 'cell';
    const thumb = await resolveThumb(p);
    cell.innerHTML = thumb ? `<img src="${thumb}">` : '';
    if(p.mediaType === 'video'){
      const tag = document.createElement('div');
      tag.className = 'cell-video-tag';
      tag.innerHTML = '<svg viewBox="0 0 24 24" fill="#fff"><path d="m10 8 6 4-6 4V8Z"/><rect x="2" y="4" width="20" height="16" rx="3" fill="none" stroke="#fff" stroke-width="2"/></svg>';
      cell.appendChild(tag);
    }
    cell.onclick = ()=> openPostViewer(p);
    return cell;
  }

  async function renderSearch(query){
    const grid = document.getElementById('searchGrid');
    const emptyEl = document.getElementById('searchEmpty');
    grid.innerHTML = '';
    const q = normalize(query||'');
    const filtered = q ? posts.filter(p=> normalize(p.user).includes(q) || normalize(p.caption).includes(q) || normalize(p.loc).includes(q)) : posts;
    emptyEl.style.display = filtered.length ? 'none' : 'block';
    for(const p of filtered){
      grid.appendChild(await gridCell(p));
    }
  }

  async function renderActivity(){
    const list = document.getElementById('activityList');
    list.innerHTML = '';
    ACTIVITY.forEach(a=>{
      const row = document.createElement('div');
      row.className = 'activity-item';
      row.innerHTML = `
        <div class="avatar" style="background:${gradFor(a.avatar)};">${initials(a.avatar)}</div>
        <div class="txt"><span class="u">${a.avatar}</span> ${a.text} <div class="time">${a.time}</div></div>
        ${a.thumb ? `<img class="thumb" src="${a.thumb}">` : ''}
      `;
      list.appendChild(row);
    });
    hasUnseenActivity = false;
    document.getElementById('activityBadge').classList.remove('show');
    document.getElementById('navActivityDot').classList.remove('show');
  }

  let profileTab = 'posts';
  async function renderProfile(){
    const mine = posts.filter(p=>currentUser && p.ownerId===currentUser.uid);
    const saved = posts.filter(p=>localSaved.has(p.id));
    document.getElementById('myPostCount').textContent = mine.length;
    const wrap = document.getElementById('myGridWrap');
    const list = profileTab === 'posts' ? mine : saved;
    if(list.length===0){
      const msg = profileTab === 'posts' ? 'Nenhuma publicacao ainda' : 'Nenhum post salvo ainda';
      wrap.innerHTML = `<div class="empty-state">${msg}${profileTab==='posts' ? '<br><button id="emptyCamBtn">Compartilhar seu primeiro momento</button>' : ''}</div>`;
      if(profileTab==='posts') document.getElementById('emptyCamBtn').onclick = openCamera;
    } else {
      wrap.innerHTML = '<div class="grid3"></div>';
      const grid = wrap.querySelector('.grid3');
      for(const p of list){
        grid.appendChild(await gridCell(p));
      }
    }
  }
  document.querySelectorAll('.profile-tab').forEach(tab=>{
    tab.onclick = ()=>{
      document.querySelectorAll('.profile-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      profileTab = tab.dataset.tab;
      renderProfile();
    };
  });

  function renderAll(){ renderStories(); renderFeed(); renderSearch(''); renderActivity(); renderProfile(); }

  function switchView(name){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+name).classList.add('active');
    document.querySelectorAll('.nav-btn[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
    if(name==='search') renderSearch(document.getElementById('searchInput').value);
    if(name==='profile') renderProfile();
    if(name==='activity') renderActivity();
  }
  document.querySelectorAll('.nav-btn[data-view]').forEach(b=> b.onclick = ()=> switchView(b.dataset.view));
  document.getElementById('navCamera').onclick = openCamera;
  document.getElementById('topActivityBtn').onclick = ()=> switchView('activity');
  document.getElementById('topSearchBtn').onclick = ()=> switchView('search');

  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', ()=>{
    document.getElementById('clearSearchBtn').classList.toggle('show', !!searchInput.value);
    renderSearch(searchInput.value);
  });
  document.getElementById('clearSearchBtn').onclick = ()=>{
    searchInput.value = '';
    document.getElementById('clearSearchBtn').classList.remove('show');
    renderSearch('');
    searchInput.focus();
  };

  /* ---------------- Comentarios ---------------- */
  async function openComments(postId){
    activeCommentPostId = postId;
    const p = posts.find(x=>x.id===postId);
    const list = document.getElementById('commentsList');
    list.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px 0;">Carregando...</div>';

    try {
      const snap = await getDocs(query(
        collection(db, 'posts', postId, 'comments'),
        orderBy('createdAt', 'asc'),
        limit(100)
      ));
      const comments = snap.docs.map(d=>d.data());
      p.comments = comments;
      list.innerHTML = comments.length ? '' : '<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px 0;">Seja o primeiro a comentar</div>';
      comments.forEach(c=>{
        const row = document.createElement('div');
        row.className = 'comment-row';
        row.innerHTML = `<div class="avatar" style="background:${gradFor(c.user||'usuario')};">${initials(c.user||'usuario')}</div><div class="txt"><b>${c.user||'usuario'}</b>${c.text||''}</div>`;
        list.appendChild(row);
      });
    } catch(err) {
      list.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px 0;">Não foi possível carregar os comentários</div>';
    }

    document.getElementById('menuSheet').classList.remove('active');
    document.getElementById('sheetBackdrop').classList.add('active');
    document.getElementById('commentsSheet').classList.add('active');
  }

  function closeComments(){
    document.getElementById('sheetBackdrop').classList.remove('active');
    document.getElementById('commentsSheet').classList.remove('active');
    activeCommentPostId = null;
  }
  document.getElementById('sheetBackdrop').onclick = (e)=>{ if(e.target.id==='sheetBackdrop') { closeComments(); closePostMenu(); } };
  document.getElementById('sendCommentBtn').onclick = sendComment;
  document.getElementById('commentInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendComment(); });
  async function sendComment(){
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if(!text || !activeCommentPostId || !currentUser) return;

    const p = posts.find(x=>x.id===activeCommentPostId);
    if(!p) return;

    try {
      await addDoc(collection(db, 'posts', p.id, 'comments'), {
        userId: currentUser.uid,
        user: 'voce',
        text,
        createdAt: serverTimestamp()
      });
      input.value = '';
      await openComments(activeCommentPostId);
    } catch(err) {
      showToast('Não foi possível comentar');
    }
  }

  /* ---------------- Menu do post (excluir / opcoes) ---------------- */
  function openPostMenu(p){
    const isMine = !!currentUser && p.ownerId === currentUser.uid;
    const menu = document.getElementById('menuSheet');
    menu.innerHTML = isMine ? `
      <div class="sheet-handle"></div>
      <div class="menu-item danger" id="menuDelete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
        Excluir publicacao
      </div>
      <div class="menu-item" id="menuCancel">Cancelar</div>
    ` : `
      <div class="sheet-handle"></div>
      <div class="menu-item" id="menuShareOpt">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/></svg>
        Compartilhar
      </div>
      <div class="menu-item danger" id="menuReport">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        Denunciar
      </div>
      <div class="menu-item" id="menuCancel">Cancelar</div>
    `;
    document.getElementById('commentsSheet').classList.remove('active');
    document.getElementById('sheetBackdrop').classList.add('active');
    menu.classList.add('active');
    if(isMine){
      document.getElementById('menuDelete').onclick = ()=> confirmDelete(p);
    } else {
      document.getElementById('menuShareOpt').onclick = ()=>{ closePostMenu(); sharePost(p); };
      document.getElementById('menuReport').onclick = ()=>{ closePostMenu(); showToast('Denuncia enviada'); };
    }
    document.getElementById('menuCancel').onclick = closePostMenu;
  }
  function closePostMenu(){
    document.getElementById('menuSheet').classList.remove('active');
    if(!document.getElementById('commentsSheet').classList.contains('active')){
      document.getElementById('sheetBackdrop').classList.remove('active');
    }
  }
  async function confirmDelete(p){
    closePostMenu();
    document.getElementById('sheetBackdrop').classList.remove('active');
    if(!confirm('Excluir esta publicacao? Essa acao nao pode ser desfeita.')) return;
    await deletePost(p.id);
  }
  async function deletePost(postId){
    const p = posts.find(x=>x.id===postId);
    if(!p || !currentUser || p.ownerId !== currentUser.uid) return;

    try {
      await deleteDoc(doc(db, 'posts', postId));
      if(p.mediaKey) {
        try { await deleteObject(ref(storage, p.mediaKey)); } catch(e) {}
      }
      posts = posts.filter(x=>x.id!==postId);
      renderFeed(); renderProfile(); renderSearch(searchInput.value);
      document.getElementById('viewerBackdrop').classList.remove('active');
      document.getElementById('viewerInner').innerHTML = '';
      showToast('Publicação excluída');
    } catch(err) {
      showToast('Não foi possível excluir');
    }
  }

  /* ---------------- Visualizador (grid -> post completo) ---------------- */
  async function openPostViewer(p){
    const inner = document.getElementById('viewerInner');
    inner.innerHTML = '';
    inner.appendChild(postCard(p));
    document.getElementById('viewerBackdrop').classList.add('active');
  }
  document.getElementById('viewerCloseBtn').onclick = ()=> document.getElementById('viewerBackdrop').classList.remove('active');

  /* ---------------- Stories ---------------- */
  let storyTimer = null;
  function openStory(s){
    document.getElementById('storyAvatar').style.background = gradFor(s.user);
    document.getElementById('storyAvatar').textContent = initials(s.user);
    document.getElementById('storyUname').textContent = s.user;
    document.getElementById('storyImg').src = s.img;
    const prog = document.getElementById('storyProgress');
    prog.innerHTML = STORY_USERS.map(()=> '<div class="bar"><i></i></div>').join('');
    const idx = STORY_USERS.indexOf(s);
    const bars = prog.querySelectorAll('.bar');
    bars.forEach((b,i)=>{ if(i<idx) b.classList.add('done'); });
    bars[idx].classList.add('playing');
    document.getElementById('storyView').classList.add('active');
    clearTimeout(storyTimer);
    storyTimer = setTimeout(closeStory, 4000);
  }
  function closeStory(){
    document.getElementById('storyView').classList.remove('active');
    clearTimeout(storyTimer);
  }
  document.getElementById('closeStoryBtn').onclick = closeStory;
  document.getElementById('storyView').addEventListener('click', (e)=>{ if(e.target.id==='storyView') closeStory(); });

  /* ---------------- Camera: foto + video ---------------- */
  async function openCamera(){
    document.getElementById('cameraView').classList.add('active');
    setMode('photo');
    await startStream();
  }
  function setMode(mode){
    captureMode = mode;
    document.querySelectorAll('#modeSwitch button').forEach(b=> b.classList.toggle('active', b.dataset.mode===mode));
    document.getElementById('cameraHint').textContent = mode==='photo' ? 'Toque no botao para capturar' : 'Toque e segure para gravar';
    startStream();
  }
  document.querySelectorAll('#modeSwitch button').forEach(b=> b.onclick = ()=> setMode(b.dataset.mode));

  async function startStream(){
    stopStream();
    try{
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: captureMode==='video' });
      const video = document.getElementById('video');
      video.srcObject = cameraStream;
      video.style.transform = facingMode==='user' ? 'scaleX(-1)' : 'scaleX(1)';
    }catch(err){
      document.getElementById('cameraHint').textContent = 'Camera indisponivel — use a galeria';
    }
  }
  function stopStream(){
    if(cameraStream){ cameraStream.getTracks().forEach(t=>t.stop()); cameraStream = null; }
  }
  document.getElementById('closeCameraBtn').onclick = ()=>{
    stopStream();
    document.getElementById('cameraView').classList.remove('active');
  };
  document.getElementById('flipCameraBtn').onclick = ()=>{
    facingMode = facingMode==='user' ? 'environment' : 'user';
    startStream();
  };

  function capturePhotoFromVideo(){
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const targetW = 480;
    const targetH = Math.round(targetW * (video.videoHeight/video.videoWidth || 1.25));
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.save();
    if(facingMode==='user'){ ctx.translate(targetW,0); ctx.scale(-1,1); }
    ctx.drawImage(video, 0, 0, targetW, targetH);
    ctx.restore();
    canvas.toBlob(blob=>{
      capturedBlob = blob; capturedMediaType = 'image'; capturedThumb = canvas.toDataURL('image/jpeg',0.6);
      openPreview();
    }, 'image/jpeg', 0.72);
  }

  function startRecording(){
    if(!cameraStream || !window.MediaRecorder) { showToast('Gravacao nao suportada'); return; }
    recordedChunks = [];
    let mime = '';
    ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].some(m=>{
      if(MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)){ mime = m; return true; }
      return false;
    });
    try{
      mediaRecorder = mime ? new MediaRecorder(cameraStream, {mimeType:mime}) : new MediaRecorder(cameraStream);
    }catch(e){ showToast('Gravacao nao suportada'); return; }
    mediaRecorder.ondataavailable = (e)=>{ if(e.data && e.data.size>0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = onRecordingStop;
    mediaRecorder.start();
    document.getElementById('shutterBtn').classList.add('recording');
    document.getElementById('recTimer').classList.add('show');
    recStartedAt = Date.now();
    recTimerInterval = setInterval(()=>{
      const secs = Math.floor((Date.now()-recStartedAt)/1000);
      const m = Math.floor(secs/60), s = secs%60;
      document.getElementById('recTimerText').textContent = m+':'+String(s).padStart(2,'0');
      if(secs >= 15) stopRecording();
    }, 250);
  }
  function stopRecording(){
    if(mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    clearInterval(recTimerInterval);
    document.getElementById('shutterBtn').classList.remove('recording');
    document.getElementById('recTimer').classList.remove('show');
  }
  async function onRecordingStop(){
    if(!recordedChunks.length) return;
    const blob = new Blob(recordedChunks, {type: mediaRecorder.mimeType || 'video/webm'});
    capturedBlob = blob;
    capturedMediaType = 'video';
    capturedThumb = await generateVideoThumb(blob);
    openPreview();
  }
  function generateVideoThumb(blob){
    return new Promise(resolve=>{
      const v = document.getElementById('hiddenVideoProcessor');
      const url = URL.createObjectURL(blob);
      v.src = url;
      v.onloadeddata = ()=>{ v.currentTime = Math.min(0.15, (v.duration||1)/4); };
      v.onseeked = ()=>{
        const canvas = document.getElementById('canvas');
        canvas.width = 360; canvas.height = Math.round(360*(v.videoHeight/v.videoWidth||1.25));
        canvas.getContext('2d').drawImage(v,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',0.6));
        URL.revokeObjectURL(url);
      };
      v.onerror = ()=> resolve(null);
    });
  }

  const shutterBtn = document.getElementById('shutterBtn');
  shutterBtn.addEventListener('pointerdown', (e)=>{
    if(!document.getElementById('video').srcObject){ document.getElementById('fileInput').click(); return; }
    if(captureMode==='video'){
      pressTimer = setTimeout(()=> startRecording(), 180);
    }
  });
  shutterBtn.addEventListener('pointerup', ()=>{
    clearTimeout(pressTimer);
    if(captureMode==='video'){
      if(mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
    } else {
      if(document.getElementById('video').srcObject) capturePhotoFromVideo();
    }
  });
  shutterBtn.addEventListener('pointerleave', ()=>{
    if(mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
  });

  document.getElementById('galleryBtn').onclick = ()=> document.getElementById('fileInput').click();
  document.getElementById('fileInput').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    if(file.type.startsWith('video/')){
      capturedBlob = file;
      capturedMediaType = 'video';
      capturedThumb = await generateVideoThumb(file);
      openPreview();
    } else {
      const reader = new FileReader();
      reader.onload = ()=>{
        const img = new Image();
        img.onload = ()=>{
          const canvas = document.getElementById('canvas');
          const targetW = 480;
          const targetH = Math.round(targetW * (img.height/img.width));
          canvas.width = targetW; canvas.height = targetH;
          canvas.getContext('2d').drawImage(img,0,0,targetW,targetH);
          canvas.toBlob(blob=>{
            capturedBlob = blob; capturedMediaType = 'image'; capturedThumb = canvas.toDataURL('image/jpeg',0.6);
            openPreview();
          }, 'image/jpeg', 0.75);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  });

  function openPreview(){
    const wrap = document.getElementById('previewMediaWrap');
    const url = URL.createObjectURL(capturedBlob);
    wrap.innerHTML = capturedMediaType === 'video'
      ? `<video src="${url}" controls playsinline muted autoplay loop></video>`
      : `<img src="${url}" alt="preview">`;
    document.getElementById('captionInput').value = '';
    document.getElementById('locInput').value = '';
    document.getElementById('previewView').classList.add('active');
  }
  document.getElementById('closePreviewBtn').onclick = document.getElementById('discardBtn').onclick = ()=>{
    document.getElementById('previewView').classList.remove('active');
    document.getElementById('previewMediaWrap').innerHTML = '';
  };
  document.getElementById('aiSuggestBtn').onclick = ()=>{
    const idea = CAPTION_IDEAS[Math.floor(Math.random()*CAPTION_IDEAS.length)];
    document.getElementById('captionInput').value = idea;
  };
  document.getElementById('shareBtn').onclick = async ()=>{
    const shareBtn = document.getElementById('shareBtn');
    shareBtn.disabled = true;
    document.getElementById('uploadProgress').classList.add('show');
    try{
      const caption = document.getElementById('captionInput').value.trim() || 'novo momento capturado ✨';
      const loc = document.getElementById('locInput').value.trim() || 'Agora';
      // No celular, o toque em Publicar pode acontecer antes do callback
      // onAuthStateChanged terminar. Esperamos a autenticação uma única vez.
      await authReady;
      if(!currentUser) throw new Error('Usuário não autenticado');
      if(!capturedBlob || !capturedBlob.size) throw new Error('A foto não foi capturada corretamente');

      const extension = capturedMediaType === 'video' ? 'webm' : 'jpg';
      const mediaPath = `posts/${currentUser.uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
      const storageRef = ref(storage, mediaPath);
      await uploadBytes(storageRef, capturedBlob, {
        contentType: capturedBlob.type || (capturedMediaType === 'video' ? 'video/webm' : 'image/jpeg')
      });
      const mediaUrl = await getDownloadURL(storageRef);

      const postData = {
        ownerId: currentUser.uid,
        user: 'voce',
        loc,
        mediaType: capturedMediaType,
        mediaKey: mediaPath,
        mediaUrl,
        thumb: capturedMediaType === 'video' ? capturedThumb : null,
        caption,
        likes: 0,
        time: 'AGORA',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'posts'), postData);

      document.getElementById('previewView').classList.remove('active');
      document.getElementById('previewMediaWrap').innerHTML = '';
      document.getElementById('cameraView').classList.remove('active');
      stopStream();
      switchView('feed');
      showToast('Publicado!');
    } catch(err){
      console.error('VIBE/Firebase - erro ao publicar:', err);
      const code = err?.code || '';
      let msg = 'Erro ao publicar';

      if (code === 'storage/unauthorized') {
        msg = 'Storage bloqueado pelas regras';
      } else if (code === 'storage/bucket-not-found') {
        msg = 'Storage não encontrado: confira o bucket';
      } else if (code === 'storage/unauthenticated') {
        msg = 'Firebase não autenticou este usuário';
      } else if (code === 'storage/quota-exceeded') {
        msg = 'Limite do Storage atingido';
      } else if (code === 'permission-denied') {
        msg = 'Firestore bloqueou a publicação';
      } else if (code === 'failed-precondition') {
        msg = 'Firebase precisa de uma configuração';
      } else if (!currentUser) {
        msg = 'Usuário Firebase não autenticado';
      }

      showToast(msg);
      alert(`${msg}\\n\\nCódigo: ${code || 'sem código'}\\n${err?.message || 'Verifique o console do navegador.'}`);
    } finally {
      shareBtn.disabled = false;
      document.getElementById('uploadProgress').classList.remove('show');
    }
  };

  function tick(){
    const d = new Date();
    document.getElementById('clock').textContent = d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }
  tick(); setInterval(tick, 30000);

  /* ---------------- PWA: instalacao e service worker ---------------- */
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredInstallPrompt = e;
    document.getElementById('installBtn').classList.add('show');
  });
  document.getElementById('installBtn').onclick = async ()=>{
    if(!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('installBtn').classList.remove('show');
  };
  window.addEventListener('appinstalled', ()=>{
    document.getElementById('installBtn').classList.remove('show');
    showToast('VIBE instalado!');
  });
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('sw.js').catch(()=>{});
    });
  }

  async function loadCurrentUserState(){
    if(!currentUser) return;
    localSaved.clear();
    localLiked.clear();

    try {
      const savedSnap = await getDocs(collection(db, 'users', currentUser.uid, 'saved'));
      savedSnap.forEach(d=>localSaved.add(d.id));
    } catch(e) {}

    for(const p of posts){
      p.saved = localSaved.has(p.id);
    }

    // Verifica curtidas do usuário somente para os posts exibidos.
    await Promise.all(posts.map(async p=>{
      try {
        const s = await getDoc(doc(db, 'posts', p.id, 'likes', currentUser.uid));
        p.liked = s.exists();
        if(p.liked) localLiked.add(p.id);
      } catch(e) {
        p.liked = false;
      }
    }));
  }

  function subscribePosts(){
    if(postsUnsubscribe) postsUnsubscribe();

    // Não use orderBy('createdAt') aqui: posts antigos ou criados durante
    // uma falha de rede podem não ter esse campo e seriam omitidos da query.
    // Carregamos a coleção e ordenamos no cliente, garantindo que TODOS os
    // posts públicos apareçam no feed.
    const q = query(collection(db, 'posts'), limit(100));
    postsUnsubscribe = onSnapshot(q, async (snap)=>{
      if(snap.empty){
        posts = SEED_POSTS.map(p=>({...p, ownerId:null}));
      } else {
        posts = snap.docs.map(d=>{
          const data = d.data();
          return {
            id:d.id,
            user:data.user || 'usuario',
            ownerId:data.ownerId || null,
            loc:data.loc || '',
            mediaType:data.mediaType || 'image',
            mediaKey:data.mediaKey || null,
            mediaUrl:data.mediaUrl || null,
            thumb:data.thumb || null,
            img:data.img || null,
            caption:data.caption || '',
            likes:Number(data.likes || 0),
            liked:false,
            saved:false,
            comments:[],
            time:data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString('pt-BR') : (data.time || 'AGORA'),
            createdAtMs:data.createdAt?.toMillis ? data.createdAt.toMillis() : 0,
            trending:!!data.trending
          };
        }).sort((a,b)=>b.createdAtMs-a.createdAtMs);
      }

      await loadCurrentUserState();
      renderAll();
    }, (err)=>{
      showToast('Erro ao conectar ao Firebase');
    });
  }

  function subscribeActivity(){
    if(!currentUser) return;
    if(activityUnsubscribe) activityUnsubscribe();

    const q = query(
      collection(db, 'users', currentUser.uid, 'activity'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    activityUnsubscribe = onSnapshot(q, (snap)=>{
      ACTIVITY = snap.docs.map(d=>{
        const a = d.data();
        return {
          avatar:a.avatar || 'vibe',
          text:a.text || '',
          time:a.createdAt?.toDate ? a.createdAt.toDate().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : 'agora',
          thumb:a.thumb || null
        };
      });
      if(ACTIVITY.length){
        hasUnseenActivity = true;
        document.getElementById('activityBadge').classList.add('show');
        document.getElementById('navActivityDot').classList.add('show');
      }
      renderActivity();
    }, ()=>{});
  }

  function setPublishEnabled(enabled){
    document.querySelectorAll('[data-publish], #publishBtn, #btnPublish').forEach(btn=>{
      btn.disabled = !enabled;
    });
  }

  async function init(){
    setPublishEnabled(false);
    try {
      await signInAnonymously(auth);
    } catch(err) {
      console.error('VIBE/Firebase - erro no login anônimo:', err);
      if (resolveAuthReady) resolveAuthReady(null);
      const code = err?.code || '';
      const message = err?.message || '';
      showToast('Firebase não autenticou');
      setTimeout(() => {
        alert(
          'O Firebase não conseguiu autenticar este celular.\\n\\n' +
          'Código: ' + (code || 'sem código') + '\\n' +
          message + '\\n\\n' +
          'Confira: Authentication > Sign-in method > Anonymous > Ativado.'
        );
      }, 50);
      renderAll();
    }
  }

  onAuthStateChanged(auth, async (user)=>{
    currentUser = user;
    resolveAuthReady(user);

    if(!user) {
      showToast('Não foi possível autenticar no Firebase');
      return;
    }

    await loadPosts();
    subscribePosts();
    subscribeActivity();
  });

  init();
})();