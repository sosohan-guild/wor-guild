(function(){
var S = window.SITE || {};
S.categories = S.categories || []; S.posts = S.posts || []; S.settings = S.settings || {};
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
  function flushP(){ if(para.length){ out.push('<p>'+inline(para.join('<br>'))+'</p>'); para=[]; } }
  function closeL(){ if(list){ out.push('</ul>'); list=false; } }
  lines.forEach(function(l){
    var m;
    if(!l.trim()){ flushP(); closeL(); return; }
    if((m=l.match(/^@youtube\(([\w-]+)\)/))){ flushP(); closeL(); out.push('<div class="video"><iframe src="https://www.youtube.com/embed/'+m[1]+'" allowfullscreen loading="lazy"></iframe></div>'); return; }
    if((m=l.match(/^@video\(([^)]+)\)/))){ flushP(); closeL(); out.push('<video controls playsinline preload="metadata" src="'+esc(m[1])+'"></video>'); return; }
    if((m=l.match(/^!\[([^\]]*)\]\(([^)]+)\)/))){ flushP(); closeL(); out.push('<img src="'+esc(m[2])+'" alt="'+esc(m[1])+'" loading="lazy">'); return; }
    if((m=l.match(/^(#{1,3})\s+(.*)/))){ flushP(); closeL(); var n=m[1].length+1; out.push('<h'+n+'>'+inline(m[2])+'</h'+n+'>'); return; }
    if((m=l.match(/^[-*]\s+(.*)/))){ flushP(); if(!list){ out.push('<ul>'); list=true; } out.push('<li>'+inline(m[1])+'</li>'); return; }
    closeL(); para.push(l);
  });
  flushP(); closeL();
  return out.join('\n');
}
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
async function tryUnlock(pass){
  if(!S.crypto) return false;
  if(!(window.crypto && crypto.subtle)) throw new Error('nosubtle');
  var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  var key = await crypto.subtle.deriveKey({name:'PBKDF2', salt: fromB64(S.crypto.salt), iterations: S.crypto.iterations, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['decrypt']);
  try { await decryptWith(key, S.crypto.check); } catch(e){ return false; }
  for(var i=0;i<S.members.length;i++){ var m = S.members[i]; if(m.enc) m.priv = await decryptWith(key, m.enc); }
  if(S.scout) S.scoutData = await decryptWith(key, S.scout);
  if(S.rank) S.rankData = await decryptWith(key, S.rank);
  KEY = key; UNLOCKED = true; return true;
}
function lockBar(){
  if(!S.crypto) return '';
  if(UNLOCKED) return '<div class="lockbar ok">🔓 인증 길드원 정보 열람 중 <a href="#" id="relock">잠그기</a></div>';
  return '<div class="lockbar"><b>🔒 인증 길드원 전용 정보가 있습니다</b><div class="lrow"><input id="pw" type="password" placeholder="길드원 암호" autocomplete="off"><button id="pwbtn">확인</button></div><div class="err" id="pwerr"></div></div>';
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
    h += '<article class="vcard"><h2>'+esc(g.title||'')+'</h2>'+(g.note?'<p class="next">'+esc(g.note)+'</p>':'')+'<img class="gimg" loading="lazy" src="'+esc(g.image)+'" alt="'+esc(g.title||'')+'"></article>';
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
  if(kids.length){ h += '<div class="grid">'; kids.forEach(function(k){ h += tileHtml(k); }); h += '</div>'; }
  if(c.layout==='cards'){
    // 카드형: 새 카드가 맨 위, 기존 카드는 아래로 내려간다(글은 날짜 내림차순)
    if(!posts.length) h += '<div class="empty">아직 올라온 카드가 없습니다.</div>';
    posts.forEach(function(p){ h += '<article class="vcard"><h2>'+esc(p.title)+'</h2><div class="meta">'+esc(p.date)+'</div>'+md(p.body)+'</article>'; });
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
  var p = S.posts.filter(function(x){return x.id===id;})[0];
  if(!p){ location.hash='#/'; return; }
  var c = S.categories.filter(function(x){return x.id===p.cat;})[0];
  titleEl.textContent = c ? c.name : ''; backEl.hidden = false; backEl.href = '#/c/'+p.cat;
  app.innerHTML = '<article><h1>'+esc(p.title)+'</h1><div class="meta">'+esc(p.date)+'</div>'+md(p.body)+'</article>';
}

function membersPage(){
  titleEl.textContent = '길드원'; backEl.hidden = false; backEl.href = '#/';
  var max = S.schema.maxMembers || 30, collapseBelow = S.schema.collapseGradesBelow || 0;
  var groups = {};
  var shown = 0;
  S.members.forEach(function(m){ if(mainOf(m) !== m) return; shown++; var gi = gradeIdx(m); (groups[gi] = groups[gi] || []).push(m); });
  var h = '<p class="sub">길드원 '+shown+'명'+(shown!==S.members.length?' · 계정 '+S.members.length+'개':'')+' (정원 '+S.members.length+' / '+max+') · 등급 높은 순</p>'+lockBar();
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
function battleHtml(b){
  function fmt(n){ return n==null ? '-' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var h = '<div class="bt"><div class="bt-head"><b>vs '+esc(b.opponent||'')+'</b></div>';
  var A = b.attack||{}, D = b.defense||{};
  h += '<div class="bt-sec"><h4>내가 한 공격</h4><div class="bt-sum"><span class="'+(A.win>=A.loss&&A.win>0?'w':(A.win===0&&A.loss===0?'':'l'))+'">확인된 공격 '+(A.win||0)+'승 '+(A.loss||0)+'패</span><small>사용 '+(A.used||0)+' / '+(A.total||0)+'회'+((A.used||0)>(A.confirmed||0)?' · 나머지 '+((A.used||0)-(A.confirmed||0))+'회는 기록 미확인':'')+'</small></div>';
  (A.rows||[]).forEach(function(r){
    h += '<div class="bt-card '+(r.win?'win':'loss')+'"><div class="bt-l"><b>'+esc(r.opp)+'</b><span>→ 내 '+esc(r.team)+'</span><small>내 전투력 '+fmt(r.myPower)+' · 상대 '+fmt(r.oppPower)+(r.when?' · '+esc(r.when):'')+'</small></div><i>'+(r.win?'공격 성공':'공격 실패')+'</i></div>';
  });
  if(!(A.rows||[]).length) h += '<p class="gnote">확인된 공격 기록이 없습니다.</p>';
  h += '</div>';
  h += '<div class="bt-sec"><h4>내 탑이 받은 공격</h4><div class="bt-sum"><span class="'+((D.loss||0)>(D.win||0)?'l':((D.win||0)>0?'w':''))+'">방어 '+(D.win==null?'-':D.win)+'승 '+(D.loss==null?'-':D.loss)+'패</span></div>';
  (D.rows||[]).forEach(function(r){
    h += '<div class="bt-card '+(r.win?'win':'loss')+'"><div class="bt-l"><b>'+esc(r.by)+'</b><span>→ 내 '+esc(r.team)+'</span><small>공격 전투력 '+fmt(r.power)+' · 내 팀 '+fmt(r.myPower)+(r.when?' · '+esc(r.when):'')+'</small></div><i>'+(r.win?'방어 성공':'방어 실패')+'</i></div>';
  });
  if(!(D.rows||[]).length) h += '<p class="gnote">확인된 방어 기록이 없습니다.</p>';
  h += '</div>';
  var c = b.contrib||{}, s = b.season||{};
  h += '<div class="bt-foot"><b>이번 라운드 기여도 '+esc(c.value)+'</b> · 길드 '+esc(c.rank)+'위<br><small>시즌 누적 공격 '+s.attWin+'승 '+s.attLoss+'패 · 방어 '+s.defWin+'승 '+s.defLoss+'패 · 시즌 기여도 '+esc(s.contrib)+' (길드 '+esc(s.rank)+'위)</small></div></div>';
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
  if(!locked && data.defenseFile) h += '<section><div class="sechead"><h3>방어 카드</h3></div><div id="defbox"><p class="next">카드를 불러오는 중…</p></div></section>';
  var gmi = 1; if(S.schema.growth && S.schema.growth.minGrade){ for(var gk=0; gk<S.schema.grades.length; gk++){ if(S.schema.grades[gk].id===S.schema.growth.minGrade){ gmi = gk; break; } } }
  if(!locked && data.growth && gi >= gmi) h += growthHtml(data.growth);
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
      var recs = (data.records||[]).filter(function(r){return r.content===ct.id;});
      if(!req.length && !rec.length && !recs.length) return;
      h += '<section><h3>'+iconHtml(ct.icon||'')+' '+esc(ct.name)+(req.length?' <small>필수 영웅 '+have+' / '+req.length+'</small>':'')+'</h3>';
      if(req.length){ h += '<div class="lbl">필수</div><div class="hgrid">'; req.forEach(function(x){ h += heroTile(x, !!owned[x]); }); h += '</div>'; }
      if(rec.length){ h += '<div class="lbl">권장</div><div class="hgrid">'; rec.forEach(function(x){ h += heroTile(x, !!owned[x]); }); h += '</div>'; }
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
  if(!locked && data.defenseFile) loadDefense(data.defenseFile);
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
async function loadDefense(file){
  var box = document.getElementById('defbox'); if(!box) return;
  try {
    if(!DEFS[file]){ var r = await fetch(file); if(!r.ok) throw new Error(r.status); DEFS[file] = await decryptWith(KEY, (await r.text()).trim()); }
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
    var ok = await tryUnlock(inp.value.trim());
    if(ok){ try{ localStorage.setItem('gw_pass', inp.value.trim()); }catch(e){} route(); }
    else err.textContent = '암호가 맞지 않습니다.';
  }catch(e){ err.textContent = '이 브라우저에서는 암호 확인을 지원하지 않습니다. 다른 브라우저로 열어 주세요.'; }
}
var lb = document.getElementById('lightbox');
document.addEventListener('click', function(e){
  var t = e.target;
  var bk = t.closest ? t.closest('#back') : null;
  if(bk && NAV.length >= 2){ e.preventDefault(); history.back(); return; }   // 사이트 안에서 이동해 왔으면 바로 이전 화면으로
  if(t.id === 'pwbtn'){ doUnlock(); return; }
  if(t.id === 'relock'){ e.preventDefault(); try{ localStorage.removeItem('gw_pass'); }catch(x){} UNLOCKED = false; KEY = null; CARDS = {}; S.scoutData = null; S.rankData = null; S.members.forEach(function(m){ delete m.priv; }); route(); return; }
  if(t.tagName==='IMG' && (t.closest('article') || t.classList.contains('hcard') || t.classList.contains('gimg') || t.classList.contains('pimg'))){ lb.querySelector('img').src = t.src; lb.hidden = false; }
  else if(!lb.hidden){ lb.hidden = true; }
});
document.addEventListener('keydown', function(e){ if(e.key==='Enter' && e.target.id==='pw') doUnlock(); });

(async function init(){
  var saved = null; try{ saved = localStorage.getItem('gw_pass'); }catch(e){}
  if(saved && S.crypto){ try{ await tryUnlock(saved); }catch(e){} }
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
