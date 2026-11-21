(function(){
var S = window.SITE || {};
S.categories = S.categories || []; S.posts = S.posts || []; S.tlock = S.tlock || []; S.auth = S.auth || []; S.me = null; S.settings = S.settings || {};
S.members = S.members || []; S.contents = S.contents || []; S.heroes = S.heroes || [];
S.schema = S.schema || {}; S.schema.grades = S.schema.grades || []; S.schema.checks = S.schema.checks || []; S.schema.badges = S.schema.badges || [];
var st = S.settings;
var app = document.getElementById('app'), titleEl = document.getElementById('title'), backEl = document.getElementById('back'), homeEl = document.getElementById('home');
if (st.mainColor) document.documentElement.style.setProperty('--main', st.mainColor);
if (st.bgColor) document.documentElement.style.setProperty('--bg', st.bgColor);
document.title = st.title || document.title;
document.getElementById('foot').textContent = st.footer || '';
var HERO = {}; S.heroes.forEach(function(h){ HERO[h.id] = h; });
/* 같은 사람의 계정 묶음: 등급·이름색·아이콘은 대표 계정 기준 */
S.people = S.people || []; var MBY = {}, PBY = {};
S.members.forEach(function(m){ MBY[m.id] = m; });
S.people.forEach(function(p){ p.accounts.forEach(function(a){ PBY[a] = p; }); });
function mainOf(m){ var p = PBY[m.id]; return (p && MBY[p.main]) ? MBY[p.main] : m; }
var UNLOCKED = false;
var LEAD = {'길드장':1, '부길드장':1};   // 직책은 이 둘만 표시(엘리트 등은 수시로 바뀌어 표시하지 않음)
var KEY = null, CARDS = {};      // 열린 암호 키, 이미 받은 카드

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function inline(s){
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}
function md(src){
  var lines = src.replace(/\r/g,'').split('\n'), out = [], list = false, para = [];
  function flushP(){ if(para.length){ out.push('<p>'+inline(para.join('\n')).replace(/\n/g,'<br>')+'</p>'); para=[]; } }
  function closeL(){ if(list){ out.push('</ul>'); list=false; } }
  lines.forEach(function(l){
    var m;
    if(!l.trim()){ flushP(); closeL(); return; }
    if((m=l.match(/^@youtube\(([\w-]+)\)/))){ flushP(); closeL(); out.push('<div class="video"><iframe src="https://www.youtube.com/embed/'+m[1]+'" allowfullscreen loading="lazy"></iframe></div>'); return; }
    if((m=l.match(/^@video\(([^)]+)\)/))){ flushP(); closeL(); out.push('<video controls playsinline preload="metadata" src="'+esc(m[1])+'"></video>'); return; }
    if((m=l.match(/^@clip\(([^|)]+)\|([^)]+)\)/))){ flushP(); closeL(); out.push(clipHtml(m[1].trim(), m[2].trim(), '')); return; }   // @clip(이미지|영상경로 또는 yt:영상ID): 이미지를 누르면 그 자리에서 재생
    if((m=l.match(/^!\[([^\]]*)\]\(([^)]+)\)/))){ flushP(); closeL(); out.push('<img src="'+esc(m[2])+'" alt="'+esc(m[1])+'" loading="lazy">'); return; }
    if((m=l.match(/^(#{1,3})\s+(.*)/))){ flushP(); closeL(); var n=m[1].length+1; out.push('<h'+n+'>'+inline(m[2])+'</h'+n+'>'); return; }
    if((m=l.match(/^[-*]\s+(.*)/))){ flushP(); if(!list){ out.push('<ul>'); list=true; } out.push('<li>'+inline(m[1])+'</li>'); return; }
    closeL(); para.push(l);
  });
  flushP(); closeL();
  return out.join('\n');
}
/* 이미지 -> 누르면 그 자리에서 영상 재생. video: 'images/clips/x.mp4' 또는 'yt:영상ID' */
function clipHtml(img, video, alt){
  return '<div class="clip" role="button" tabindex="0" data-clip="'+esc(video)+'" title="눌러서 영상 재생"><img class="clipimg" loading="lazy" src="'+esc(img)+'" alt="'+esc(alt||'')+'"><span class="clip-play">▶</span></div>';
}
function playClip(box){
  if(!box || box.getAttribute('data-playing')) return;
  var v = box.getAttribute('data-clip') || '', im = box.querySelector('img'), hh = im ? im.offsetHeight : 0;
  box.setAttribute('data-playing', '1'); box.removeAttribute('role'); box.removeAttribute('title');
  if(hh) box.style.minHeight = hh + 'px';
  if(v.indexOf('yt:') === 0) box.innerHTML = '<div class="video"><iframe src="https://www.youtube.com/embed/'+encodeURIComponent(v.slice(3))+'?autoplay=1&rel=0" allow="autoplay; fullscreen" allowfullscreen></iframe></div>';
  else { box.innerHTML = '<video controls autoplay playsinline src="'+esc(v)+'"></video>'; var vd = box.querySelector('video'); if(vd && vd.play) vd.play().catch(function(){}); }
}
document.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-clip]'); if(b){ e.preventDefault(); playClip(b); } });
document.addEventListener('keydown', function(e){ if((e.key==='Enter'||e.key===' ') && e.target.getAttribute && e.target.getAttribute('data-clip') && !e.target.getAttribute('data-playing')){ e.preventDefault(); playClip(e.target); } });
function iconHtml(ic){
  if(/^images\//.test(ic||'')) return '<img src="'+esc(ic)+'" alt="">';
  return esc(ic || '📁');
}

/* ---------- 암호(인증 길드원 전용 정보) ---------- */
function fromB64(s){ var b = atob(s), a = new Uint8Array(b.length); for(var i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a; }
async function decryptWith(key, b64){
  var buf = fromB64(b64);
  var pt = await crypto.subtle.decrypt({name:'AES-GCM', iv: buf.slice(0,12)}, key, buf.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}
var KEYS = {};   // 등급 id -> 풀 수 있는 열쇠(개인 암호로 로그인했을 때)
function normPass(s){ return String(s||'').toLowerCase().replace(/[\s-]/g,''); }
function importRaw(b64){ return crypto.subtle.importKey('raw', fromB64(b64), {name:'AES-GCM'}, false, ['decrypt']); }
async function pbkdfKey(pass, saltB64){
  var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt: fromB64(saltB64), iterations: S.crypto.iterations, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['decrypt']);
}
async function finishUnlock(key, keys, me){
  for(var i=0;i<S.members.length;i++){ var m = S.members[i]; if(m.enc) m.priv = await decryptWith(key, m.enc); }
  if(S.scout) S.scoutData = await decryptWith(key, S.scout);
  if(S.rank) S.rankData = await decryptWith(key, S.rank);
  if(S.warRank) S.warRankData = await decryptWith(key, S.warRank);
  S.tprivData = [];
  if(S.tpriv){
    var first = S.schema.grades[0].id;
    for(var gid in S.tpriv){ var kk = (gid === first) ? key : (keys||{})[gid]; if(!kk) continue; try{ S.tprivData = S.tprivData.concat(await decryptWith(kk, S.tpriv[gid])); }catch(e){} }
  }
  KEY = key; KEYS = keys || {}; S.me = me || null; UNLOCKED = true;
  await openPriv();
  return true;
}
/* 개인 비공개 화면(육성 가이드, 길드전 정보): 본인(개인 암호 꾸러미의 mks) 또는 본인보다 높은 등급(wrap을 푸는 열쇠)만 열린다. 같은 등급은 못 연다 */
async function openPriv(){
  var me = S.me, real = -1, test = false;
  if(me){ var mm0 = meMember(); real = mm0 ? gradeIdx(mm0) : 0; test = !!(me.admin && admOff()); }
  for(var i=0;i<S.members.length;i++){
    var m = S.members[i]; delete m.priv2; delete m.k2; if(!m.enc2) continue;
    var k = null;
    try{
      if(me && me.mks && me.mks[m.id] && !(test && mainOf(m).id !== me.id)) k = me.mks[m.id];
      else if(me && m.wg && m.wrap && KEYS[m.wg] && (!test || gradeIdOf(m.wg) <= real)) k = await decryptWith(KEYS[m.wg], m.wrap);
      if(k){ var ck2 = await importRaw(k); m.priv2 = await decryptWith(ck2, m.enc2); m.k2 = ck2; }
    }catch(e){}
  }
}
async function tryUnlock(pass){            // 공용 암호: 누구인지는 알 수 없고 기본 등급(첫 등급) 자료만 열린다
  if(!S.crypto) return false;
  if(!(window.crypto && crypto.subtle)) throw new Error('nosubtle');
  var key = await pbkdfKey(pass, S.crypto.salt);
  try { await decryptWith(key, S.crypto.check); } catch(e){ return false; }
  return finishUnlock(key, {}, null);
}
async function tryLogin(id, pass){         // 개인 암호: 닉네임과 암호가 맞아야 내 등급까지의 열쇠가 풀린다
  if(!S.crypto) return false;
  if(!(window.crypto && crypto.subtle)) throw new Error('nosubtle');
  var a = S.auth.filter(function(x){ return x.id === id; })[0]; if(!a) return false;
  var w; try{ w = await decryptWith(await pbkdfKey(normPass(pass), a.salt), a.enc); }catch(e){ return false; }
  var keys = {}; for(var gid in w.keys){ keys[gid] = await importRaw(w.keys[gid]); }
  var first = S.schema.grades[0].id;
  try { await decryptWith(keys[first], S.crypto.check); } catch(e){ return false; }
  return finishUnlock(keys[first], keys, {id:w.id, name:w.name, g:w.g, admin:!!w.admin, mks:w.mks||{}});
}
function meMember(){ return S.me ? (S.members.filter(function(m){ return m.id === S.me.id; })[0] || null) : null; }
function gradeIdOf(id){ for(var i=0;i<S.schema.grades.length;i++){ if(S.schema.grades[i].id===id) return i; } return 0; }
function nextHint(m){
  var gi = gradeIdx(m), nxt = S.schema.grades[gi+1], gm = mainOf(m);
  if(!nxt) return '';
  var parts = [];
  if(!nxt.requires) parts.push('조건 준비 중');
  else { nxt.requires.forEach(function(id){ if(!(gm.checks && gm.checks[id])){ var ck = S.schema.checks.filter(function(x){return x.id===id;})[0]; parts.push(ck?ck.name:id); } });
    if(nxt.minBadges && (gm.badges||[]).length < nxt.minBadges) parts.push('배지 '+(nxt.minBadges-(gm.badges||[]).length)+'개'); }
  return '다음 등급 <b style="color:'+esc(nxt.color)+'">'+esc(nxt.name)+'</b>까지: '+(parts.join(', ')||'조건 달성');
}
function isAdmin(m){ return !!(m && S.me && S.me.admin && m.id === S.me.id); }
function admOff(){ try{ return localStorage.getItem('gw_admin_off') === '1'; }catch(e){ return false; } }
/* 등급 제한 글을 못 여는 이유 안내(열쇠가 없으니 본문은 어차피 풀리지 않는다) */
function lockNote(minId){
  var need = gradeIdOf(minId), ng = S.schema.grades[need] || {name:minId, color:'#888'};
  var head = '이 글은 <b style="color:'+esc(ng.color)+'">'+esc(ng.name)+'</b> 등급부터 볼 수 있어요.';
  if(!UNLOCKED) return '<p class="next">🔒 길드원 암호를 입력하면 볼 수 있습니다. ('+esc(ng.name)+' 등급부터)</p>';
  var me = meMember();
  if(!me) return '<p class="next">'+head+' 받은 <b>개인 암호</b>를 입력하면 내 등급을 확인해 드려요.</p>';
  var gi = gradeIdx(me), cg = S.schema.grades[gi] || {name:'', color:'#888'};
  var back = (isAdmin(me) && admOff()) ? '<p class="next"><small>제작자 시험 보기 중입니다. <a href="#" id="admOn">제작자 권한으로 돌아가기</a></small></p>' : '';
  return back+'<p class="next">'+head+' '+esc(me.name)+'님은 지금 <b style="color:'+esc(cg.color)+'">'+esc(cg.name)+'</b>이에요.</p><p class="next">'+nextHint(me)+'</p><p class="next"><a href="#/m/'+esc(me.id)+'">내 승급 조건 보기 ▶</a></p>';
}
function visibleTpriv(){                   // 풀린 글. 제작자 시험 보기 중이면 내 실제 등급까지의 글만
  var arr = S.tprivData || [], me = meMember();
  if(me && isAdmin(me) && admOff()){ var gi = gradeIdx(me); arr = arr.filter(function(p){ return !p.minGrade || gradeIdOf(p.minGrade) <= gi; }); }
  return arr;
}
function adminNote(p){ return (p.minGrade && isAdmin(meMember()) && !admOff()) ? '<p class="next"><small>제작자 권한으로 열람 중이에요. ('+esc((S.schema.grades[gradeIdOf(p.minGrade)]||{}).name||'')+' 등급 미만에게는 잠겨 있어요) <a href="#" id="admOff">등급 제한 시험 보기</a></small></p>' : ''; }
function lockBar(){
  if(!S.crypto) return '';
  if(UNLOCKED){
    var me = S.me, who;
    if(me){ var m = meMember(), g = m ? (S.schema.grades[gradeIdx(m)]||{}) : {}; who = '🔓 <b>'+esc(me.name)+'</b>님 로그인'+(g.name?' · '+esc(g.name):'')+(me.admin?' · 제작자':''); }
    else who = '🔓 공용 암호로 열람 중 <small>(등급별 글은 개인 암호 로그인이 필요해요)</small>';
    return '<div class="lockbar ok">'+who+' <a href="#" id="relock">'+(me?'로그아웃':'잠그기')+'</a></div>';
  }
  return '<div class="lockbar"><b>🔒 인증 길드원 전용 정보가 있습니다</b><div class="lrow"><input id="pw" type="password" placeholder="받은 암호" autocomplete="off"><button id="pwbtn">확인</button></div><small class="hint2">받은 <b>개인 암호</b>만 입력하면 누구인지 자동으로 찾아 내 등급에 맞는 화면이 열려요.</small><div class="err" id="pwerr"></div></div>';
}

/* ---------- 길드원 등급 계산 ---------- */
function checkCount(m){ var c=0; S.schema.checks.forEach(function(k){ if(m.checks && m.checks[k.id]) c++; }); return c; }
function stepOk(g, mm){      // 이 등급으로 올라가는 조건을 모두 채웠는가(requires가 없으면 조건 준비 중이라 올라갈 수 없음)
  if(!g.requires) return false;
  for(var i=0;i<g.requires.length;i++){ if(!(mm.checks && mm.checks[g.requires[i]])) return false; }
  if(g.minBadges && (mm.badges||[]).length < g.minBadges) return false;
  return true;
}
function gradeIdx(m){        // 계단식: 앞 단계를 통과해야 다음 단계를 볼 수 있다
  var mm = mainOf(m), gi = 0;
  for(var i=1;i<S.schema.grades.length;i++){ if(stepOk(S.schema.grades[i], mm)) gi = i; else break; }
  return gi;
}
function unlockedIcons(gi){
  var a = []; S.schema.grades.forEach(function(g,i){ if(i<=gi) (g.icons||[]).forEach(function(x){ a.push(x); }); });
  return a;
}
function memberIcon(m){
  var gi = gradeIdx(m), pool = unlockedIcons(gi), mm = mainOf(m);
  if(mm.icon && pool.indexOf(mm.icon) >= 0) return mm.icon;
  var g = S.schema.grades[gi]; return (g && g.icons && g.icons[0]) || '🙂';
}
function nameHtml(m){
  var g = S.schema.grades[gradeIdx(m)] || {};
  var cls = (gradeIdx(m) === S.schema.grades.length-1 && S.schema.grades.length>1) ? ' legend' : '';
  return '<span class="mname'+cls+'" style="color:'+esc(g.color||'#222')+'">'+esc(m.name)+'</span>';
}
function heroTile(id, on){
  var h = HERO[id] || {id:id, name:id};
  var inner = h.image ? '<img src="'+esc(h.image)+'" alt="">' : esc((h.name||'?').charAt(0));
  return '<div class="hero '+(on?'on':'off')+'"><div class="hi">'+inner+'</div><div class="hn">'+esc(h.name)+'</div></div>';
}

/* ---------- 화면 ---------- */
function home(){
  titleEl.textContent = st.title || '길드 공략 허브'; backEl.hidden = true;
  var h = '';
  if(st.subtitle) h += '<p class="sub">'+esc(st.subtitle)+'</p>';
  if(!S.categories.length){ app.innerHTML = h+'<div class="empty">아직 올라온 공략이 없습니다.</div>'; return; }
  h += '<div class="grid">';
  S.categories.forEach(function(c){
    if(c.parent) return;
    var href = c.type==='members' ? '#/members' : '#/c/'+esc(c.id);
    h += '<a class="tile" href="'+href+'"><span class="ic">'+iconHtml(c.icon)+'</span><span class="nm">'+esc(c.name)+'</span></a>';
  });
  app.innerHTML = h + '</div>';
}
function tileHtml(c){
  var href = c.type==='members' ? '#/members' : (c.type==='scout' ? '#/scout' : '#/c/'+esc(c.id));   // 이벤트 카드 페이지(type event)도 #/c/ 를 쓴다
  return '<a class="tile" href="'+href+'"><span class="ic">'+iconHtml(c.icon)+'</span><span class="nm">'+esc(c.name)+'</span></a>';
}
/* 이벤트 카드 페이지: 정답지 카드 -> 최종 보상 카드 -> 진행 기록(최신이 위) */
function eventPage(c){
  var ev = (S.events||{})[c.id] || {}, h = '';
  (ev.guides||[]).forEach(function(g){
    h += '<article class="vcard"><h2>'+esc(g.title||'')+'</h2>'+(g.note?'<p class="next">'+esc(g.note)+'</p>':'')+''+(g.video ? clipHtml(g.image, g.video, g.title||'') : '<img class="gimg" loading="lazy" src="'+esc(g.image)+'" alt="'+esc(g.title||'')+'">')+'</article>';
  });
  var rw = ev.rewards||{}, items = rw.items||[];
  h += '<article class="vcard"><h2>🎁 최종 보상</h2>';
  if(items.length){
    h += '<ul class="hl rwl">'; items.forEach(function(x){ h += '<li><b>'+esc(x.name||'')+'</b>'+(x.count?' x '+esc(x.count):'')+(x.note?' <small>'+esc(x.note)+'</small>':'')+'</li>'; }); h += '</ul>';
    if(rw.pending) h += '<p class="next">'+esc(rw.pending)+'</p>';
  } else h += '<p class="next">'+esc(rw.pending||'아직 정리된 보상 정보가 없습니다.')+'</p>';
  h += '</article>';
  var hist = (ev.history||[]).slice().sort(function(a,b){ return String(b.date||'').localeCompare(String(a.date||'')); });
  h += '<article class="vcard"><h2>📅 진행 기록</h2>';
  if(hist.length){
    h += '<ul class="hl hist">'; hist.forEach(function(x){ h += '<li><b>'+esc(x.date||'')+'</b>'+(x.note?' · '+esc(x.note):'')+'</li>'; }); h += '</ul>';
  } else h += '<p class="next">아직 기록된 진행 날짜가 없습니다. 이벤트가 진행될 때마다 날짜를 기록하고, 최신 기록이 위로 올라옵니다.</p>';
  h += '</article>';
  var posts = S.posts.filter(function(p){return p.cat===c.id;});
  posts.forEach(function(p){ h += '<article class="vcard"><h2>'+esc(p.title)+'</h2><div class="meta">'+esc(p.date)+'</div>'+md(p.body)+'</article>'; });
  app.innerHTML = h;
}
function catPage(id){
  var c = S.categories.filter(function(x){return x.id===id;})[0];
  if(!c){ location.hash='#/'; return; }
  titleEl.textContent = c.name; backEl.hidden = false; backEl.href = c.parent ? '#/c/'+c.parent : '#/';
  if(c.type==='event'){ eventPage(c); return; }
  var kids = S.categories.filter(function(x){return x.parent===id;});
  var posts = S.posts.filter(function(p){return p.cat===id;});
  var h = '';
  if(c.desc) h += '<p class="sub">'+esc(c.desc)+'</p>';
  if(kids.length){ h += '<div class="grid">'; kids.forEach(function(k){ h += tileHtml(k); }); h += '</div>'; }
  if(c.layout==='cards' || c.layout==='acc'){
    // 카드형: 새 카드가 맨 위, 기존 카드는 아래로 내려간다(글은 날짜 내림차순)
    var all = posts.slice(), openIds = {};
    visibleTpriv().filter(function(p){return p.cat===id;}).forEach(function(p){ all.push(p); openIds[p.id] = 1; });
    var tl = S.tlock.filter(function(p){return p.cat===id;});
    tl.forEach(function(p){ if(!openIds[p.id]) all.push({id:p.id, title:p.title, date:p.date, minGrade:p.minGrade, locked:true}); });
    all.sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); });
    if(tl.length) h += lockBar();
    if(!all.length) h += '<div class="empty">아직 올라온 카드가 없습니다.</div>';
    all.forEach(function(p){
      var body = p.locked ? '<div class="gate">'+lockNote(p.minGrade)+'</div>' : adminNote(p)+md(p.body);
      if(c.layout==='acc'){   // 제목 목록: 제목을 누르면 내용이 펼쳐진다
        h += '<details class="acc"><summary><span class="at">'+(p.locked?'🔒 ':'')+esc(p.title)+'</span><small>'+esc(String(p.date||'').slice(0,10))+'</small></summary><div class="accb">'+body+'</div></details>';
      } else h += '<article class="vcard"><h2>'+esc(p.title)+'</h2><div class="meta">'+esc(p.date)+'</div>'+body+'</article>';
    });
  } else if(posts.length || !kids.length){
    h += '<div class="list">';
    posts.forEach(function(p){ h += '<a href="#/p/'+esc(p.id)+'"><b>'+esc(p.title)+'</b><small>'+esc(p.date)+'</small></a>'; });
    h += '</div>';
  }
  app.innerHTML = h;
}
/* ---------- 매칭 길드 분석원 (길드원 암호로만 열림) ---------- */
function scoutStat(g){
  var w=0,l=0,d=0,p=0,last='', ms = g.meetings||[];
  ms.forEach(function(m){ if(m.result==='승') w++; else if(m.result==='패') l++; else if(m.result==='무') d++; else p++; if((m.collectedAt||'')>last) last=m.collectedAt; });
  var rec = (w+l+d) ? (w+'승 '+l+'패'+(d?' '+d+'무':'')) : '확정 전적 없음';
  return { last:last, text:'만남 '+ms.length+'회 · '+rec+(p?' · 집계 중 '+p+'회':'')+(last?' · 최근 '+last:'') };
}
function scoutLocked(title, back){
  titleEl.textContent = title; backEl.hidden = false; backEl.href = back;
  app.innerHTML = lockBar()+'<section class="locked"><h3>🔒 길드원 전용</h3><p class="next">상대 길드 분석 기록은 길드원 암호를 입력하면 볼 수 있습니다.</p></section>';
}
function scoutListPage(){
  if(!S.scoutData){ scoutLocked('매칭 길드 분석원','#/c/guildwar'); return; }
  titleEl.textContent = '매칭 길드 분석원'; backEl.hidden = false; backEl.href = '#/c/guildwar';
  var gs = S.scoutData.slice().sort(function(a,b){ return scoutStat(b).last.localeCompare(scoutStat(a).last); });
  var h = lockBar()+'<p class="sub">만나는 길드의 기록을 누적해 다음 대결에 활용합니다</p><div class="list">';
  gs.forEach(function(g){ h += '<a href="#/scout/'+esc(g.id)+'"><b>'+esc(g.name)+'</b><small>'+esc(scoutStat(g).text)+'</small></a>'; });
  app.innerHTML = h+'</div>';
}
function scoutPage(id){
  if(!S.scoutData){ scoutLocked('매칭 길드 분석원','#/scout'); return; }
  var g = S.scoutData.filter(function(x){return x.id===id;})[0];
  if(!g){ location.hash='#/scout'; return; }
  titleEl.textContent = g.name; backEl.hidden = false; backEl.href = '#/scout';
  var st = scoutStat(g), h = lockBar();
  h += '<div class="pcard"><div class="pic">🔎</div><div><div class="nm2"><b>'+esc(g.name)+'</b></div><div class="pmeta">'+esc(g.league||'')+(g.level?' · Lv.'+esc(g.level):'')+' · 처음 만남 '+esc(g.firstMet||'')+'</div></div></div>';
  h += '<section><h3>누적 전적</h3><p class="next">'+esc(st.text)+'</p></section>';
  h += '<section><h3>만남 기록</h3>';
  (g.meetings||[]).slice().sort(function(a,b){ return (b.collectedAt||'').localeCompare(a.collectedAt||''); }).forEach(function(m){
    h += '<div class="rec"><b>'+esc(m.season||'')+' '+esc(m.label||'')+'</b> <small>'+esc(m.collectedAt||'')+(m.status?' · '+esc(m.status):'')+'</small>';
    h += '<div class="rv">우리 <b>'+esc(m.ourScore==null?'-':m.ourScore+'%')+'</b> vs 상대 <b>'+esc(m.theirScore==null?'-':m.theirScore+'%')+'</b> · 결과 <b>'+esc(m.result||'최종 미확인')+'</b></div>';
    if((m.highlights||[]).length){ h += '<ul class="hl">'; m.highlights.forEach(function(x){ h += '<li>'+esc(x)+'</li>'; }); h += '</ul>'; }
    if(m.note) h += '<div class="note">'+esc(m.note)+'</div>';
    h += '</div>';
  });
  h += '</section>';
  var ep = g.enemyProfile||{}, epHas = ep.memberCount || ep.formation || (ep.topHeroes||[]).length || ep.note;
  h += '<section><h3>상대 길드 분포와 배치</h3>';
  if(epHas){
    h += '<table class="kv">'+(ep.memberCount?'<tr><th>인원</th><td>'+esc(ep.memberCount)+'</td></tr>':'')+(ep.formation?'<tr><th>배치</th><td>'+esc(ep.formation)+'</td></tr>':'')+((ep.topHeroes||[]).length?'<tr><th>주요 영웅</th><td>'+esc(ep.topHeroes.join(', '))+'</td></tr>':'')+(ep.note?'<tr><th>메모</th><td>'+esc(ep.note)+'</td></tr>':'')+'</table>';
  } else h += '<p class="next">아직 수집 전입니다. 길드전이 진행될 때마다 채워 갑니다.</p>';
  h += '</section><section><h3>추천 공격 거점</h3>';
  if((g.targets||[]).length){
    h += '<table class="kv"><tr><th>거점</th><th>공격 길드원</th><th>예상 승률</th></tr>';
    g.targets.forEach(function(x){ h += '<tr><td>'+esc(x.point||'')+'</td><td>'+esc(x.attacker||'')+'</td><td>'+esc(x.winRate==null?'':x.winRate+'%')+(x.note?' · '+esc(x.note):'')+'</td></tr>'; });
    h += '</table>';
  } else h += '<p class="next">승률 근거가 쌓이면, 이 길드를 다시 만났을 때 이길 수 있는 거점과 공격할 길드원을 추천합니다.</p>';
  h += '</section>';
  if(g.notes) h += '<section><h3>메모</h3><p>'+esc(g.notes)+'</p></section>';
  app.innerHTML = h;
}

/* ---------- 귀속 병사 순위 페이지 (길드원 암호로만 열림) ---------- */
function rankPage(){
  titleEl.textContent = '귀속 병사 순위'; backEl.hidden = false; backEl.href = '#/members';
  if(!S.rankData){ app.innerHTML = lockBar()+'<section class="locked"><h3>🔒 길드원 전용</h3><p class="next">순위는 길드원 암호를 입력하면 볼 수 있습니다.</p></section>'; return; }
  var mic = {1:'🥇',2:'🥈',3:'🥉'}, h = lockBar();
  S.rankData.forEach(function(g){
    h += '<section class="rkcard"><h3>'+esc(g.hero)+'</h3>';
    g.rows.slice().sort(function(x,y){ return (x.medal-y.medal) || (y.power-x.power); }).forEach(function(r){
      h += '<a class="rkrow" href="#/m/'+esc(r.id)+'?hero='+encodeURIComponent(g.hero)+'"><span class="rkm">'+mic[r.medal]+'</span><span class="rkn">'+esc(r.name)+(r.main?' <small>('+esc(r.main)+')</small>':'')+'</span><span class="rkp">'+Number(r.power).toLocaleString('en-US')+'</span></a>';
    });
    h += '</section>';
  });
  app.innerHTML = h;
}

function postPage(id){
  var p = S.posts.filter(function(x){return x.id===id;})[0] || visibleTpriv().filter(function(x){return x.id===id;})[0];
  if(!p){
    var lk = S.tlock.filter(function(x){return x.id===id;})[0];
    if(lk){ titleEl.textContent = '길드원 훈련소'; backEl.hidden = false; backEl.href = '#/c/'+lk.cat; app.innerHTML = lockBar()+'<section class="locked"><h3>🔒 '+esc(lk.title)+'</h3>'+lockNote(lk.minGrade)+'</section>'; return; }
    location.hash='#/'; return;
  }
  var c = S.categories.filter(function(x){return x.id===p.cat;})[0];
  titleEl.textContent = c ? c.name : ''; backEl.hidden = false; backEl.href = '#/c/'+p.cat;
  app.innerHTML = adminNote(p)+'<article><h1>'+esc(p.title)+'</h1><div class="meta">'+esc(p.date)+'</div>'+md(p.body)+'</article>';
}

function membersPage(){
  titleEl.textContent = '길드원'; backEl.hidden = false; backEl.href = '#/';
  var max = S.schema.maxMembers || 30, collapseBelow = S.schema.collapseGradesBelow || 0;
  var groups = {};
  var shown = 0;
  S.members.forEach(function(m){ if(mainOf(m) !== m) return; shown++; var gi = gradeIdx(m); (groups[gi] = groups[gi] || []).push(m); });
  var WR = S.warRankData;   // 길드원 암호로 열었을 때만 있음: {id:[시즌 공격 승, 패]}
  var sub = '길드원 '+shown+'명'+(shown!==S.members.length?' · 계정 '+S.members.length+'개':'')+' (정원 '+S.members.length+' / '+max+') · ';
  if(WR){
    var all = []; S.members.forEach(function(m){ if(mainOf(m) === m) all.push(m); });
    var rate = function(m){ var r = WR[m.id]; if(!r) return null; var n = r[0]+r[1]; return n ? r[0]/n : null; };
    var games = function(m){ var r = WR[m.id]; return r ? r[0]+r[1] : 0; };
    all.sort(function(a,b){ var x = rate(a), y = rate(b); if(x===null && y!==null) return 1; if(y===null && x!==null) return -1; if(x!==y && x!==null) return y-x; if(games(a)!==games(b)) return games(b)-games(a); return a.name.localeCompare(b.name,'ko'); });
    var h = '<p class="sub">'+sub+'길드전 승률 높은 순 <small>(시즌 공격 승률, 같으면 공격 많은 순)</small></p>'+lockBar();
    all.forEach(function(m, i){
      var r = WR[m.id], rt = rate(m);
      h += '<a class="mrow" href="#/m/'+esc(m.id)+'"><span class="mic">'+iconHtml(memberIcon(m))+'</span>'+nameHtml(m)+(LEAD[m.role]?'<span class="role">'+esc(m.role)+'</span>':'')+(PBY[m.id]?'<span class="abadge">계정 '+PBY[m.id].accounts.length+'</span>':'')+'<span class="wr'+(rt===null?' none':'')+'">'+(rt===null ? '기록 없음' : '<b>'+Math.round(rt*100)+'%</b><small>'+r[0]+'승 '+r[1]+'패</small>')+'</span><span class="chev">›</span></a>';
    });
    app.innerHTML = h; return;
  }
  var h = '<p class="sub">'+sub+'등급 높은 순</p>'+lockBar();
  Object.keys(groups).map(Number).sort(function(a,b){return b-a;}).forEach(function(gi){
    var g = S.schema.grades[gi] || {name:'', color:'#888'};
    var arr = groups[gi].sort(function(a,b){ return a.name.localeCompare(b.name,'ko'); });
    var collapsed = gi < collapseBelow;
    h += '<details class="grp"'+(collapsed?'':' open')+'><summary class="gh" style="border-left-color:'+esc(g.color)+'">'+esc(g.name)+' <small>'+arr.length+'명'+(collapsed?' · 눌러서 펼치기':'')+'</small></summary>';
    arr.forEach(function(m){
      h += '<a class="mrow" href="#/m/'+esc(m.id)+'"><span class="mic">'+iconHtml(memberIcon(m))+'</span>'+nameHtml(m)+(LEAD[m.role]?'<span class="role">'+esc(m.role)+'</span>':'')+(PBY[m.id]?'<span class="abadge">계정 '+PBY[m.id].accounts.length+'</span>':'')+'<span class="chev">›</span></a>';
    });
    h += '</details>';
  });
  app.innerHTML = h;
}
var WARS = {}, WARN = 0;
function fmtN(n){ return n==null ? '-' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
var ATK_OK = '다음에 같은 상대를 공격하세요', ATK_NG = '공략 도전하시거나 봇 거점을 공격해 주세요';
var DEF_OK = '이 방어 배치를 유지하세요', DEF_NG = '방어 진영을 점검하고 훈련소 파훼 가이드를 확인하세요';
function chipHtml(win, okTxt, ngTxt, video){
  var cls = win ? 'win' : 'loss', t = win ? okTxt : ngTxt;
  if(video && String(video).indexOf('yt:') === 0) return '<button type="button" class="bt-chip '+cls+'" data-yt="'+esc(String(video).slice(3))+'" title="영상 보기">▶ '+t+'</button>';
  return video ? '<a class="bt-chip '+cls+'" href="'+esc(video)+'" target="_blank" rel="noopener" title="영상 보기">▶ '+t+'</a>' : '<i class="bt-chip '+cls+'">'+t+'</i>';
}
function openYt(id){
  closeYt();
  var o = document.createElement('div'); o.id = 'ytmodal'; o.className = 'ytm';
  o.innerHTML = '<div class="ytbox"><button type="button" class="ytx" aria-label="닫기">✕</button><div class="ytfr"><iframe src="https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id)+'?rel=0&playsinline=1&autoplay=1" title="길드전 기록 영상" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><a class="ytlink" href="https://youtu.be/'+encodeURIComponent(id)+'" target="_blank" rel="noopener">재생이 안 되면 YouTube에서 열기</a></div>';
  o.addEventListener('click', function(e){ if(e.target === o || (e.target.classList && e.target.classList.contains('ytx'))) closeYt(); });
  document.body.appendChild(o); document.body.classList.add('ytopen');
}
function closeYt(){ var o = document.getElementById('ytmodal'); if(o) o.remove(); document.body.classList.remove('ytopen'); }
document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeYt(); });
document.addEventListener('click',function(e){ var id = e.target && e.target.id; if(id==='admOff'||id==='admOn'){ e.preventDefault(); try{ if(id==='admOff') localStorage.setItem('gw_admin_off','1'); else localStorage.removeItem('gw_admin_off'); }catch(x){} openPriv().then(route); } });
document.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-yt]'); if(b){ e.preventDefault(); openYt(b.getAttribute('data-yt')); } });
function battleHtml(b){
  var A = b.attack||{}, D = b.defense||{}, c = b.contrib||{}, s = b.season||{};
  var h = '<div class="bt-sec"><h4>내가 한 공격</h4><div class="bt-sum"><span class="'+((A.win||0)>=(A.loss||0)&&(A.win||0)>0?'w':((A.win||0)===0&&(A.loss||0)===0?'':'l'))+'">확인된 공격 '+(A.win||0)+'승 '+(A.loss||0)+'패</span><small>사용 '+(A.used||0)+' / '+(A.total||0)+'회'+((A.used||0)>(A.confirmed||0)?' · 나머지 '+((A.used||0)-(A.confirmed||0))+'회는 기록을 아직 확인하지 못함':'')+'</small></div>';
  var cap = A.total || 5, rows = A.rows||[];
  for(var i=0; i<cap; i++){
    var r = rows[i];
    if(r){
      h += '<div class="bt-card '+(r.win?'win':'loss')+'"><div class="bt-l"><small>'+(i+1)+'회 · '+esc(r.when||'')+'</small><b>'+esc(r.base||'')+' '+esc(r.opp)+'</b><span>'+esc(r.team)+' 공격 · 내 '+fmtN(r.myPower)+(r.oppPower?' / 상대 '+fmtN(r.oppPower):'')+'</span></div><div class="bt-c">'+(r.win?ATK_OK:ATK_NG)+'</div>'+chipHtml(r.win,'공격 성공','공격 실패',r.video)+'</div>';
    } else if(i < (A.used||0)){
      h += '<div class="bt-card empty"><div class="bt-l"><small>'+(i+1)+'회</small><b>사용함 · 기록 미확인</b></div><div class="bt-c">로봇 거점 등 아직 수집되지 않은 기록</div></div>';
    } else {
      h += '<div class="bt-card empty"><div class="bt-l"><small>'+(i+1)+'회</small><b>아직 사용 안 함</b></div></div>';
    }
  }
  h += '</div>';
  h += '<div class="bt-sec"><h4>내 탑이 받은 공격</h4><div class="bt-sum"><span class="'+((D.loss||0)>(D.win||0)?'l':((D.win||0)>0?'w':''))+'">방어 '+(D.win==null?'-':D.win)+'승 '+(D.loss==null?'-':D.loss)+'패</span></div>';
  (D.rows||[]).forEach(function(r, i){
    h += '<div class="bt-card '+(r.win?'win':'loss')+'"><div class="bt-l"><small>'+(i+1)+'번째 · '+esc(r.when||'')+'</small><b>'+esc(r.base||'')+' ← '+esc(r.by)+'</b><span>내 '+esc(r.team)+' 방어 · 공격 '+fmtN(r.power)+' / 내 팀 '+fmtN(r.myPower)+'</span></div><div class="bt-c">'+(r.win?DEF_OK:DEF_NG)+'</div>'+chipHtml(r.win,'방어 성공','방어 실패',r.video)+'</div>';
  });
  if(!(D.rows||[]).length) h += '<p class="gnote">확인된 방어 기록이 없습니다.</p>';
  h += '</div>';
  h += '<div class="bt-foot"><b>이번 라운드 기여도 '+esc(c.value)+'</b> · 길드 '+esc(c.rank)+'위<br><small>시즌 누적 공격 '+s.attWin+'승 '+s.attLoss+'패 · 방어 '+s.defWin+'승 '+s.defLoss+'패 · 시즌 기여도 '+esc(s.contrib)+' (길드 '+esc(s.rank)+'위) · '+esc(b.asOf||'')+'</small></div>';
  return h;
}
function warCardHtml(recs, mid){
  var by = {}, order = [];
  recs.forEach(function(r){ var o = (r.battle && r.battle.opponent) || '상대'; if(!by[o]){ by[o] = []; order.push(o); } by[o].push(r); });
  order.forEach(function(o){ by[o].sort(function(x,y){ return String(y.date).localeCompare(String(x.date)) || String(y.round).localeCompare(String(x.round)); }); });
  order.sort(function(x,y){ return String(by[y][0].date).localeCompare(String(by[x][0].date)); });
  var key = 'w'+(WARN++); WARS[key] = { by: by, order: order, sel: { opp: order[0], idx: 0 } };
  var h = '<div class="war" id="'+key+'">'; h += warInner(key); h += '</div>';
  return h;
}
function warInner(key){
  var W = WARS[key], h = '<div class="war-opps">';
  W.order.forEach(function(o){ var on = (o === W.sel.opp); h += '<button type="button" class="war-opp'+(on?' on':'')+'" data-wk="'+key+'" data-wopp="'+esc(o)+'">'+esc(o)+'전 <em>'+W.by[o].length+'</em><span>'+(W.open===o?'▲':'▼')+'</span></button>'; });
  h += '</div>';
  if(W.open){ h += '<div class="war-dates">'; W.by[W.open].forEach(function(r, i){ var on = (W.open === W.sel.opp && i === W.sel.idx); h += '<button type="button" class="war-date'+(on?' on':'')+'" data-wk="'+key+'" data-widx="'+i+'" data-wopp="'+esc(W.open)+'">'+esc(r.round)+' '+esc(r.date)+'</button>'; }); h += '</div>'; }
  var cur = W.by[W.sel.opp][W.sel.idx];
  h += '<div class="bt"><div class="bt-head"><b>'+esc(W.sel.opp)+'전</b><small>'+esc(cur.round)+' '+esc(cur.date)+(W.sel.idx===0?' · 최근전':'')+'</small></div>'+battleHtml(cur.battle)+'</div>';
  return h;
}
function growthHtml(gr){
  var h = '<section class="grow"><div class="sechead"><h3>마법병사 육성</h3></div>';
  var top = gr.top || [];
  h += '<h4 class="stg">먼저 올릴 유닛 TOP '+(top.length||5)+'</h4>';
  if(!top.length) h += '<p class="next">지금 기준에 모자란 유닛이 없습니다. 확인 필요 유닛은 마법병사 탭 사진을 주면 채워집니다.</p>';
  top.forEach(function(u){
    var mx = Math.max(u.base, u.lv, 10);
    h += '<div class="grow-row"><button type="button" class="gimgbtn" data-uid="'+esc(u.id)+'" aria-label="'+esc(u.name)+' 설명"><img class="gimg" src="'+esc(u.img)+'" alt=""></button><div class="gmain"><div class="gname">'+esc(u.name)+(u.est?' <small>(이름 추정)</small>':'')+'<span class="gchip '+u.color+'">-'+u.gap+'</span></div>'
       + '<div class="gsm">내 Lv '+u.lv+' / 기준 Lv '+u.base+'</div><div class="gbar"><i class="'+u.color+'" style="width:'+Math.max(3,Math.round(100*u.lv/mx))+'%"></i><b style="left:'+Math.round(100*u.base/mx)+'%"></b></div></div></div>';
  });
  h += '<details class="gall"><summary>전체 유닛 '+(gr.list||[]).length+'종 보기</summary>';
  (gr.list||[]).forEach(function(u){
    h += '<div class="gl"><span class="gdot '+u.color+'"></span><span class="gln" data-uid="'+esc(u.id)+'">'+esc(u.name)+(u.est?'<small>(추정)</small>':'')+'</span><span class="glv">'+(u.lv!=null?('Lv '+u.lv+' / 기준 '+u.base):'확인 필요')+'</span></div>';
  });
  h += '</details>';
  var s = gr.source || {};
  h += '<p class="gnote">값 출처: '+(s.tabPhoto?('마법병사 탭 사진 ('+esc(s.tabPhoto)+')'):'공격 편성 화면에서 읽은 값')+(s.tabPhoto&&s.fromBattle?' + 공격 편성 화면':'')+'. '+(s.tabPhoto?'':'탭 사진을 주면 쓰지 않은 유닛도 채워집니다.')+'</p></section>';
  return h;
}function memberPage(id, qs){
  var hero = null; if(qs){ var mq = qs.match(/hero=([^&]+)/); if(mq) hero = decodeURIComponent(mq[1]); }
  var m = S.members.filter(function(x){return x.id===id;})[0];
  if(!m){ location.hash='#/members'; return; }
  titleEl.textContent = '길드원'; backEl.hidden = false; backEl.href = '#/members';
  var gi = gradeIdx(m), g = S.schema.grades[gi] || {name:'',color:'#888'}, nxt = S.schema.grades[gi+1];
  var c = checkCount(m), b = (m.badges||[]).length;
  var gm = mainOf(m), cm = checkCount(gm), bm = (gm.badges||[]).length, person = PBY[m.id];
  var data = m.priv || m;               // 인증 길드원이면 비공개 자료까지, 아니면 공개 자료만
  var locked = !!(m.enc && !m.priv);
  var owned = {}; (data.heroes||[]).forEach(function(x){ owned[x]=1; });
  var h = lockBar();
  if(person){ h += '<div class="atabs">'; person.accounts.forEach(function(a){ var am = MBY[a]; if(!am) return; h += '<a class="atab'+(a===m.id?' on':'')+'" href="#/m/'+esc(a)+'">'+(a===person.main?'★ ':'')+esc(am.name)+'</a>'; }); h += '</div>'; }
  h += '<div class="pcard"><div class="pic">'+iconHtml(memberIcon(m))+'</div><div>'+nameHtml(m)+'<div class="pmeta"><span class="gbadge" style="background:'+esc(g.color)+'">'+esc(g.name)+'</span> '+esc(LEAD[m.role]?m.role:'길드원')+(m.joined?' · 가입 '+esc(m.joined):'')+(person&&gm!==m?' · 등급은 대표 계정 <b>'+esc(gm.name)+'</b> 기준':'')+'</div></div></div>';

  if(!locked && data.cardsFile) h += '<section><div class="sechead"><h3>귀속 병사 순위</h3>'+(S.rank?'<a class="rkbtn" href="#/rank">순위 보기 ▶</a>':'')+'</div><div id="profbox"></div><div class="cardgrid" id="cardgrid"><p class="next">카드를 불러오는 중…</p></div></section>';

  var gmi = 1; if(S.schema.growth && S.schema.growth.minGrade){ for(var gk=0; gk<S.schema.grades.length; gk++){ if(S.schema.grades[gk].id===S.schema.growth.minGrade){ gmi = gk; break; } } }
  /* 개인 비공개 화면(육성 가이드, 길드전 정보): 본인 + 더 높은 등급만(openPriv가 푸는 것). 등급 조건은 이 화면이 열리는 최소 등급(일반)을 넘어야 한다 */
  var data2 = (!locked && m.priv2) ? m.priv2 : null, admAll = !!(S.me && S.me.admin && !admOff());
  var PSC = S.schema.privateScreens || {}, PSCC = PSC.contents || {};
  var selfView = !!(S.me && mainOf(m).id === S.me.id);   // 본인 화면은 본인 등급이 열리는 최소 등급 이상일 때만, 남의 화면은 열쇠(더 높은 등급)가 정한다
  function psOpen(gid){ return !selfView || gi >= gradeIdOf(gid || (S.schema.grades[1]||{}).id); }
  var defOpen = !!(data2 && data2.defenseFile && (psOpen(PSC.defense || PSCC.guildwar) || admAll));
  if(defOpen) h += '<section><div class="sechead"><h3>방어 카드</h3></div><div id="defbox"><p class="next">카드를 불러오는 중…</p></div></section>';
  var growOpen = !!(data2 && data2.growth && (psOpen(PSC.growth) || admAll));
  if(growOpen){ if(!psOpen(PSC.growth)) h += '<p class="next"><small>제작자 권한으로 열람 중이에요. 이 길드원은 아직 일반 미만이라 본인에게는 열리지 않아요.</small></p>'; h += growthHtml(data2.growth); }
  var privNote = '';
  if(m.enc2 && !m.priv2 && UNLOCKED) privNote = '<section class="locked"><h3>🔒 육성 가이드·길드전 정보</h3><p class="next">이 화면은 본인과 더 높은 등급만 볼 수 있어요.</p></section>';
  else if(S.me && S.me.id === m.id && !admAll && gi < gradeIdOf(PSC.growth || (S.schema.grades[1]||{}).id)) privNote = '<section class="locked"><h3>🔒 육성 가이드·길드전 정보</h3><p class="next">일반 등급부터 열려요. '+nextHint(m)+'</p></section>';
  h += privNote;
  h += '<section><h3>인증 현황</h3>';
  for(var si=1; si<S.schema.grades.length; si++){        // 계단식: 지금 도전 중인 단계까지만 보여 준다
    var sg = S.schema.grades[si]; if(!sg.requires) break;
    var done = 0, lis = '';
    sg.requires.forEach(function(rid){
      var ck = S.schema.checks.filter(function(x){return x.id===rid;})[0] || {name:rid};
      var okc = !!(gm.checks && gm.checks[rid]); if(okc) done++;
      lis += '<li class="'+(okc?'ok':'no')+'">'+(okc?'✔':'○')+' '+esc(ck.name)+(ck.desc?' <small class="cdesc">'+esc(ck.desc)+'</small>':'')+'</li>';
    });
    var passed = gi >= si;
    h += '<h4 class="stg">'+esc(sg.name)+' 승급 조건 <small>'+done+' / '+sg.requires.length+(passed?' · 완료':'')+'</small></h4><ul class="chk">'+lis+'</ul>';
    if(!passed) break;
  }
  if(nxt){
    var parts = [];
    if(!nxt.requires) parts.push('조건 준비 중');
    else { nxt.requires.forEach(function(id){ if(!(gm.checks && gm.checks[id])){ var ck = S.schema.checks.filter(function(x){return x.id===id;})[0]; parts.push(ck?ck.name:id); } });
      if(nxt.minBadges && bm < nxt.minBadges) parts.push('배지 '+(nxt.minBadges-bm)+'개'); }
    h += '<p class="next">다음 등급 <b style="color:'+esc(nxt.color)+'">'+esc(nxt.name)+'</b>까지: '+(parts.join(', ')||'조건 달성')+'</p>';
  } else h += '<p class="next">최고 등급입니다.</p>';
  h += '</section>';

  h += '<section><h3>아이콘 수집</h3><div class="icons">';
  var cur = memberIcon(m);
  S.schema.grades.forEach(function(gr,i){ (gr.icons||[]).forEach(function(ic){
    var on = i<=gi; h += '<span class="ico '+(on?'on':'off')+(ic===cur?' cur':'')+'" title="'+esc(gr.name)+'">'+(on?esc(ic):'🔒')+'</span>';
  }); });
  h += '</div></section>';

  if(S.schema.badges.length){
    h += '<section><h3>배지 <small>'+b+' / '+S.schema.badges.length+'</small></h3><div class="bgs">';
    S.schema.badges.forEach(function(bd){ var on = (m.badges||[]).indexOf(bd.id)>=0;
      h += '<div class="bg '+(on?'on':'off')+'"><span>'+iconHtml(bd.icon)+'</span><b>'+esc(bd.name)+'</b><small>'+esc(bd.desc||'')+'</small></div>'; });
    h += '</div></section>';
  }

  var fields = {}; Object.keys(m.fields||{}).forEach(function(k){ fields[k]=m.fields[k]; });
  Object.keys(data.privateFields||{}).forEach(function(k){ fields[k]=data.privateFields[k]; });
  var fk = Object.keys(fields);
  if(fk.length){ h += '<section><h3>기본 정보</h3><table class="kv">'; fk.forEach(function(k){ h += '<tr><th>'+esc(k)+'</th><td>'+esc(fields[k])+'</td></tr>'; }); h += '</table></section>'; }

  if(locked){
    h += '<section class="locked"><h3>🔒 인증 길드원 전용</h3><p class="next">보유 영웅과 귀속 병사 순위, 콘텐츠별 영웅표, 점수와 진행도는 인증된 길드원만 볼 수 있습니다. 위에서 길드원 암호를 입력하세요.</p></section>';
  } else {
    S.contents.forEach(function(ct){
      var req = ct.required||[], rec = ct.recommended||[];
      var have = req.filter(function(x){return owned[x];}).length;
      var recAll = (data.records||[]); if(data2 && data2.records && (psOpen(PSCC[ct.id]) || admAll)) recAll = recAll.concat(data2.records);
      var recs = recAll.filter(function(r){return r.content===ct.id;});
      if(!req.length && !rec.length && !recs.length) return;
      h += '<section><h3>'+iconHtml(ct.icon||'')+' '+esc(ct.name)+(req.length?' <small>필수 영웅 '+have+' / '+req.length+'</small>':'')+'</h3>';
      if(req.length){ h += '<div class="lbl">필수</div><div class="hgrid">'; req.forEach(function(x){ h += heroTile(x, !!owned[x]); }); h += '</div>'; }
      if(rec.length){ h += '<div class="lbl">권장</div><div class="hgrid">'; rec.forEach(function(x){ h += heroTile(x, !!owned[x]); }); h += '</div>'; }
      var wrecs = recs.filter(function(r){ return r.battle; }); recs = recs.filter(function(r){ return !r.battle; }); if(wrecs.length) h += warCardHtml(wrecs, m.id);
      recs.forEach(function(r){
        h += '<div class="rec"><b>'+esc(r.title||'')+'</b> <small>'+esc(r.date||'')+'</small><div class="rv">'+(r.score?'점수 <b>'+esc(r.score)+'</b>':'')+(r.progress?' · 진행 <b>'+esc(r.progress)+'</b>':'')+'</div>';
        if(r.battle){ h += battleHtml(r.battle); }
        if((r.stats||[]).length){ h += '<div class="wstats">'; r.stats.forEach(function(s){ h += '<div class="wst"><small>'+esc(s.label)+'</small><b>'+esc(s.value)+'</b>'+(s.sub?'<em>'+esc(s.sub)+'</em>':'')+'</div>'; }); h += '</div>'; }
        if((r.heroes||[]).length){ h += '<div class="hgrid">'; r.heroes.forEach(function(x){ h += heroTile(x, true); }); h += '</div>'; }
        if(r.note) h += '<div class="note">'+esc(r.note)+'</div>';
        h += '</div>';
      });
      h += '</section>';
    });
  }
  app.innerHTML = h;
  if(!locked && data.cardsFile) loadCards(data.cardsFile, hero);
  if(defOpen) loadDefense(data2.defenseFile, m.k2);
}

/* 귀속 병사 순위 카드 + 프로필 이미지(일반 등급 이상): 길드원별 암호화 파일을 열어 받는다(개인 페이지를 열 때만) */
async function loadCards(file, hero){
  var box = document.getElementById('cardgrid'); if(!box) return;
  try {
    if(!CARDS[file]){ var r = await fetch(file); if(!r.ok) throw new Error(r.status); CARDS[file] = await decryptWith(KEY, (await r.text()).trim()); }
    var medal = {1:'금메달',2:'은메달',3:'동메달'}, hh = '';
var cl = CARDS[file].cards.slice();
    if(hero){ var hi = -1; cl.forEach(function(c,i){ if(c.hero===hero) hi = i; }); if(hi > 0) cl.unshift(cl.splice(hi,1)[0]); }
    cl.forEach(function(c){
      var im = '<img class="hcard'+(hero&&c.hero===hero?' hlc':'')+'" loading="lazy" src="'+c.img+'" alt="'+esc(c.hero)+' 투력 '+esc(c.power)+(c.medal?' '+medal[c.medal]:'')+'">';
      hh += (hero&&c.hero===hero) ? '<div class="hlwrap"><div class="hltag">여기로 이동'+(c.medal?' · '+c.medal+'위':'')+'</div>'+im+'</div>' : im;
    });
    box = document.getElementById('cardgrid'); if(box) box.innerHTML = hh || '<p class="next">카드가 없습니다.</p>';
    if(hero) setTimeout(function(){ var el = document.querySelector('.hlwrap'); if(el) el.scrollIntoView({block:'center'}); }, 150);
    var pr = CARDS[file].profile, pb = document.getElementById('profbox');
    if(pr && pb) pb.innerHTML = '<div class="profbox"><img class="pimg" src="'+pr.img+'" alt="길드원 프로필 이미지"><div><b>길드원 프로필 이미지</b>'+(pr.diamonds?'<p class="dia">💎 다이아 '+esc(pr.diamonds)+'개'+(pr.updated?' · 최근 획득 '+esc(pr.updated):'')+'</p>':'')+'<p class="next">일반 등급부터 받을 수 있습니다. 톡방 멀티프로필에 사용하세요. 다이아를 새로 얻으면 이미지가 바뀌니, 바뀐 이미지를 다시 다운로드해서 멀티프로필을 바꿔 주세요.</p><a class="dlbtn" href="'+pr.img+'" download="'+esc(pr.file)+'">⬇ 프로필 이미지 다운로드</a></div></div>';
  } catch(e){ box = document.getElementById('cardgrid'); if(box) box.innerHTML = '<p class="next">카드를 불러오지 못했습니다.</p>'; }
}

/* 방어 카드(주둔 팀 2개): 길드원별 암호화 파일을 열어 받는다. 초상화를 누르면 영웅 카드·능력치·장비 팝업이 열린다 */
var DEFS = {};
async function loadDefense(file, k2){
  var box = document.getElementById('defbox'); if(!box) return;
  try {
    if(!DEFS[file]){ var r = await fetch(file); if(!r.ok) throw new Error(r.status); DEFS[file] = await decryptWith(k2, (await r.text()).trim()); }
    renderDefense(DEFS[file]);
  } catch(e){ box = document.getElementById('defbox'); if(box) box.innerHTML = '<p class="next">방어 카드를 불러오지 못했습니다.</p>'; }
}
function defNum(n){ return (typeof n==='number') ? n.toLocaleString('ko-KR') : esc(n); }
function renderDefense(d){
  var box = document.getElementById('defbox'); if(!box) return;
  var h = '<p class="defmeta">'+esc(d.base||'')+' · 수집 '+esc(d.collectedAt||'')+(d.source?' ('+esc(d.source)+')':'')+'</p>';
  (d.teams||[]).forEach(function(tm, ti){
    h += '<div class="deft"><div class="defth"><b>팀 '+esc(tm.no)+'</b><span>전투력 '+defNum(tm.power)+'</span></div><div class="defrow">';
    tm.heroes.forEach(function(x, hi){ h += '<button type="button" class="defp'+(x.card?'':' nodet')+'" data-t="'+ti+'" data-h="'+hi+'"><img src="'+x.portrait+'" alt="영웅 '+(hi+1)+'"></button>'; });
    h += '</div></div>';
  });
  h += '<div id="defpanel"></div>';
  if(d.maps && d.maps.length){ h += '<h4 class="defh4">배치도</h4><div class="defmaps">'; d.maps.forEach(function(m, i){ h += '<figure><figcaption>팀 '+(i+1)+'</figcaption><img src="'+m+'" alt="팀 '+(i+1)+' 배치도"></figure>'; }); h += '</div>'; }
  if(d.missing && d.missing.length) h += '<p class="next">재수집 필요: '+esc(d.missing.join(', '))+'</p>';
  h += renderOpponents(d.opponents || []);
  box.innerHTML = h;
  box.onclick = function(e){
    var z = e.target.closest ? e.target.closest('.defgear img') : null;
    if(z){ var big = document.getElementById('defbig'); if(!big){ big = document.createElement('div'); big.id = 'defbig'; big.onclick = function(){ big.style.display = 'none'; }; document.body.appendChild(big); } big.innerHTML = '<img src="'+z.src+'" alt="">'; big.style.display = 'flex'; return; }
    var oc = e.target.closest ? e.target.closest('[data-tg]') : null;
    if(oc){ var el = document.getElementById(oc.getAttribute('data-tg')); if(el) el.classList.toggle('show'); return; }
    var b = e.target.closest ? e.target.closest('.defp') : null; if(!b) return;
    var x = d.teams[+b.getAttribute('data-t')].heroes[+b.getAttribute('data-h')];
    [].forEach.call(box.querySelectorAll('.defp'), function(n){ n.classList.remove('on'); }); b.classList.add('on');
    var pn = document.getElementById('defpanel'); if(!x.card){ pn.innerHTML = '<div class="defpanel"><p class="next">이 영웅의 상세는 아직 수집되지 않았습니다.</p></div>'; return; }
    var ph = '<div class="defpanel"><img class="defcard" src="'+x.card+'" alt="영웅 카드"><table class="defstat">';
    (x.stats||[]).forEach(function(s){ var cc=''; if(s[0]==='치명타율'){ var cv=parseFloat(s[1]); cc = x.critSkip ? ' class="crit-n"' : (cv>=100 ? ' class="crit-b"' : (cv>=95 ? ' class="crit-y"' : ' class="crit-r"')); } ph += '<tr><td>'+esc(s[0])+'</td><td'+cc+'>'+esc(s[1])+'</td></tr>'; });
    ph += '</table><h4 class="defh4">장비 (누르면 확대)</h4><div class="defgear">';
    (x.gear||[]).forEach(function(g){ ph += '<figure><figcaption>'+esc(g.part)+'</figcaption><img src="'+g.file+'" alt="'+esc(g.part)+'"></figure>'; });
    ph += '</div></div>'; pn.innerHTML = ph;
  };
}
/* 상대 길드 기록: 길드마다 카드 1장, 횟수 버튼을 누르면 회차(시즌·날짜)가 쌓여 있고, 회차를 누르면 공격 칸(상대 닉네임·영웅·결과)이 열린다. 기록이 없으면 안내만 보인다 */
function renderOpponents(list){
  var h = '<h4 class="defh4">상대 길드</h4>';
  if(!list.length) return h + '<p class="next">아직 기록이 없습니다.</p>';
  list.forEach(function(g, gi){
    var ms = g.meetings || [];
    h += '<div class="oppc"><div class="opph"><b>'+esc(g.name)+'</b><button type="button" class="oppcnt" data-tg="opm'+gi+'">'+ms.length+'회 ▾</button></div><div class="oppms" id="opm'+gi+'">';
    ms.forEach(function(m, mi){
      var at = m.attacks || [], used = 0, w = 0, l = 0;
      at.forEach(function(a){ if(a.result==='승'){ used++; w++; } else if(a.result==='패'){ used++; l++; } });
      var cap = m.total || 5;
      h += '<div class="oppm" data-tg="opb'+gi+'_'+mi+'"><span><b>'+(mi+1)+'회</b> '+esc(m.season||'')+' · '+esc(m.date||'')+'</span><span class="opps">공격 '+used+'/'+cap+' · 승 '+w+' · 패 '+l+'</span></div>';
      h += '<div class="oppb" id="opb'+gi+'_'+mi+'"><div class="oppsum">공격 횟수 <b>'+used+' / '+cap+'</b> · 승 <b>'+w+'</b> · 패 <b>'+l+'</b> · 승률 <b>'+(used?Math.round(w*100/used)+'%':'-')+'</b></div><div class="oppat">';
      for(var i=0; i<cap; i++){ var a = at[i] || {}; h += '<span class="no">'+(i+1)+'</span><span>'+esc(a.target||'')+'</span><span>'+esc((a.heroes||[]).join(', '))+'</span><span class="res '+(a.result==='승'?'win':a.result==='패'?'lose':'')+'">'+esc(a.result||'미사용')+'</span>'; }
      h += '</div></div>';
    });
    h += '</div></div>';
  });
  return h;
}

var NAV = [], UI = {}, CUR = null;   // 방문한 화면 기록, 화면별 펼침/스크롤 상태
function saveUI(){
  if(CUR==null) return;
  UI[CUR] = { y: window.scrollY, d: [].map.call(document.querySelectorAll('details.grp'), function(x){ return x.open; }) };
}
function route(){
  var h = location.hash, m, wasBack = false, same = (h === CUR);
  saveUI();
  if(!same){
    if(NAV.length >= 2 && NAV[NAV.length-2] === h){ NAV.pop(); wasBack = true; }
    else NAV.push(h);
  }
  CUR = h;
  window.scrollTo(0,0);
  if(h === '#/members') membersPage();
  else if(h === '#/rank') rankPage();
  else if(h === '#/scout') scoutListPage();
  else if((m=h.match(/^#\/scout\/(.+)$/))) scoutPage(decodeURIComponent(m[1]));
  else if((m=h.match(/^#\/m\/(.+)$/))){ var mq2 = m[1].split('?'); memberPage(decodeURIComponent(mq2[0]), mq2[1]); }
  else if((m=h.match(/^#\/c\/(.+)$/))) catPage(decodeURIComponent(m[1]));
  else if((m=h.match(/^#\/p\/(.+)$/))) postPage(decodeURIComponent(m[1]));
  else home();
  homeEl.hidden = backEl.hidden;   // 이전 버튼이 보이는 화면에서는 홈 버튼도 보인다(홈 화면에서는 둘 다 숨김)
  var u = UI[h];                       // 뒤로 왔거나 같은 화면을 다시 그릴 때: 펼침/스크롤 복원
  if(u && (wasBack || same)){
    [].forEach.call(document.querySelectorAll('details.grp'), function(el,i){ if(u.d[i] !== undefined) el.open = u.d[i]; });
    window.scrollTo(0, u.y); setTimeout(function(){ window.scrollTo(0, u.y); }, 60);
  }
}
window.addEventListener('hashchange', route);

async function doUnlock(){
  var inp = document.getElementById('pw'), err = document.getElementById('pwerr');
  if(!inp) return;
  err.textContent = '확인 중...';
  try{
    var pass = inp.value.trim();
    /* 암호만으로 누구인지 찾는다: 암호 앞 3글자의 해시 태그(t)로 후보 항목을 좋히고, 풀리는 항목이 본인이다. 어느 개인 암호도 아니면 공용 암호(기존 방식)로 시도 */
    var norm = normPass(pass), found = null;
    if(norm.length >= 3 && S.auth.length){
      var dg = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tag|'+norm.slice(0,3))));
      var tag = ''; for(var di=0; di<4; di++){ tag += ('0'+dg[di].toString(16)).slice(-2); }
      var cands = S.auth.filter(function(a){ return a.t === tag; });
      for(var ci=0; ci<cands.length && !found; ci++){ if(await tryLogin(cands[ci].id, pass)) found = cands[ci].id; }
    }
    if(found){ try{ localStorage.setItem('gw_login', JSON.stringify({id:found, pass:pass})); localStorage.removeItem('gw_pass'); }catch(e){} route(); }
    else {
      var ok2 = await tryUnlock(pass);
      if(ok2){ try{ localStorage.setItem('gw_pass', pass); localStorage.removeItem('gw_login'); }catch(e){} route(); }
      else err.textContent = '암호가 맞지 않습니다. 받은 암호를 다시 확인해 주세요.';
    }
  }catch(e){ err.textContent = '이 브라우저에서는 암호 확인을 지원하지 않습니다. 다른 브라우저로 열어 주세요.'; }
}
var lb = document.getElementById('lightbox');
document.addEventListener('click', function(e){
  var t = e.target;
  var wb = t.closest ? t.closest('[data-wk]') : null;
  if(wb){ var W = WARS[wb.getAttribute('data-wk')], el2 = document.getElementById(wb.getAttribute('data-wk')); if(W && el2){
    var o = wb.getAttribute('data-wopp'), ix = wb.getAttribute('data-widx');
    if(ix == null){ W.open = (W.open === o) ? null : o; }
    else { W.sel = { opp: o, idx: +ix }; }
    el2.innerHTML = warInner(wb.getAttribute('data-wk')); e.preventDefault(); return; } }
  var bk = t.closest ? t.closest('#back') : null;
  if(bk && NAV.length >= 2){ e.preventDefault(); history.back(); return; }   // 사이트 안에서 이동해 왔으면 바로 이전 화면으로
  if(t.id === 'pwbtn'){ doUnlock(); return; }
  if(t.id === 'relock'){ e.preventDefault(); try{ localStorage.removeItem('gw_pass'); localStorage.removeItem('gw_login'); }catch(x){} UNLOCKED = false; KEY = null; KEYS = {}; S.me = null; CARDS = {}; S.scoutData = null; S.rankData = null; S.warRankData = null; S.tprivData = null; S.members.forEach(function(m){ delete m.priv; delete m.priv2; delete m.k2; }); route(); return; }
  if(t.tagName==='IMG' && (t.closest('article') || t.classList.contains('hcard') || t.classList.contains('gimg') || t.classList.contains('pimg'))){ lb.querySelector('img').src = t.src; lb.hidden = false; }
  else if(!lb.hidden){ lb.hidden = true; }
});
document.addEventListener('keydown', function(e){ if(e.key==='Enter' && e.target.id==='pw') doUnlock(); });

(async function init(){
  var saved = null, lg = null; try{ saved = localStorage.getItem('gw_pass'); lg = JSON.parse(localStorage.getItem('gw_login') || 'null'); }catch(e){}
  if(lg && S.crypto){ try{ await tryLogin(lg.id, lg.pass); }catch(e){} }
  else if(saved && S.crypto){ try{ await tryUnlock(saved); }catch(e){} }
  route();
})();
/* 마법병사 유닛 설명 팝업 (2026-11-19): 초상화/이름 클릭 -> 특성, 스킬, 훈련소 가이드 경로(가이드가 있는 유닛만) */
var UNITINFO = null;
function unitInfo(cb){ if(UNITINFO) return cb(UNITINFO); fetch('images/growth/unit_info.json').then(function(r){return r.json();}).then(function(j){ UNITINFO = j; cb(j); }).catch(function(){ cb({}); }); }
function closeUnit(){ var o = document.getElementById('unitov'); if(o) o.remove(); document.body.classList.remove('noscroll'); }
function openUnit(uid){
  unitInfo(function(all){
    var u = all[uid]; if(!u) return;
    var h = '<div class="uov-box"><button type="button" class="uov-x" id="unitclose">닫기 ✕</button>';
    h += '<div class="uov-top"><img class="uov-img" src="'+esc(u.portrait)+'" alt=""><div class="uov-meta"><h3>'+esc(u.name)+(u.confidence && u.confidence!=='높음' ? ' <small>(이름 추정)</small>' : '')+'</h3>';
    h += '<div class="uov-chips"><span>'+esc(u.rarity||'')+'</span><span>코스트 '+esc(u.cost)+'</span>'+(u.element?'<span>'+esc(u.element)+'</span>':'')+(u.defense?'<span>'+esc(u.defense)+'</span>':'')+(u.qty?'<span>수량 '+esc(u.qty)+'</span>':'')+(u.limit?'<span>횟수 제한 '+esc(u.limit)+'</span>':'')+'</div>';
    h += '</div></div>';
    if(u.grades){ h += '<table class="uov-gr"><tr>'; Object.keys(u.grades).forEach(function(k){ h += '<th>'+esc(k)+'</th>'; }); h += '</tr><tr>'; Object.keys(u.grades).forEach(function(k){ h += '<td>'+esc(u.grades[k])+'</td>'; }); h += '</tr></table>'; }
    if((u.guides||[]).length){ h += '<div class="uov-guide"><b>길드원 훈련소 가이드</b>'; u.guides.forEach(function(g){ h += '<a href="#/p/'+esc(g.post)+'" class="uov-go">'+esc(g.title)+' ▶</a>'; }); h += '</div>'; }
    if((u.skills||[]).length){ h += '<h4 class="stg">스킬과 특성</h4><div class="uov-sk">'; u.skills.forEach(function(s){ h += '<img loading="lazy" src="'+esc(s)+'" alt="스킬 설명">'; }); h += '</div><p class="gnote">레벨 1 화면 기준 설명입니다. 레벨이 오르면 잠금이 풀립니다.</p>'; }
    else h += '<p class="next">아직 이 유닛의 스킬 정보가 없습니다.</p>';
    h += '</div>';
    var ov = document.getElementById('unitov'); if(ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'unitov'; ov.className = 'uov'; ov.innerHTML = h; document.body.appendChild(ov); document.body.classList.add('noscroll');
  });
}
document.addEventListener('click', function(e){
  var t = e.target;
  if(t.closest && t.closest('#unitclose')){ closeUnit(); return; }
  if(t.id === 'unitov'){ closeUnit(); return; }
  if(t.closest && t.closest('.uov-go')){ closeUnit(); return; }
  var el = t.closest ? t.closest('[data-uid]') : null;
  if(el && el.getAttribute('data-uid')){ e.preventDefault(); openUnit(el.getAttribute('data-uid')); }
});
window.addEventListener('hashchange', closeUnit);
})();
