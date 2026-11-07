if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));}
/* ---------- UI ---------- */
const $=s=>document.querySelector(s);
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// All games on this site share one localStorage, so every key gets this app's prefix.
const APP='bridge-school';
const store={get(k,d){try{const v=localStorage.getItem(APP+':'+k);return v===null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem(APP+':'+k,JSON.stringify(v));}catch(e){}}};
const installed=matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches||navigator.standalone===true;
if(installed){const a=document.getElementById('backHome');if(a)a.remove();}
const colorize=s=>String(s).replace(/[♣♦♥♠]/g,m=>`<span class="t${SUIT.indexOf(m)}">${m}</span>`);
const fmtBid=b=>b==='P'?'Pass':b[0]+(b[1]==='N'?'NT':SUIT['CDHS'.indexOf(b[1])]);
const strainText=s=>s===4?'NT':SUIT[s];
const P=str=>({s:'CDHS'.indexOf(str[0]),r:'23456789TJQKA'.indexOf(str.slice(1).replace('10','T'))+2});

function cardHTML(c,o={}){
  const tag=o.button?'button':'div';
  const cls=['pc','s'+c.s];if(o.cls)cls.push(o.cls);
  const attrs=o.button?` type="button" data-s="${c.s}" data-r="${c.r}"${o.disabled?' disabled':''} aria-label="${rk(c.r)} of ${SUITNAME[c.s]}"`:` role="img" aria-label="${rk(c.r)} of ${SUITNAME[c.s]}"`;
  return `<${tag} class="${cls.join(' ')}"${attrs}${o.style?` style="${o.style}"`:''}><span class="ix"><b>${rk(c.r)}</b><i>${SUIT[c.s]}</i></span><span class="pip">${SUIT[c.s]}</span></${tag}>`;
}
function fanHTML(hand,o={}){
  let prev=null;
  return hand.map(c=>{const brk=prev!==null&&c.s!==prev;prev=c.s;
    const extra=[];if(brk)extra.push('brk');if(o.dim&&o.dim(c))extra.push('dim');if(o.hint&&o.hint(c))extra.push('hint');
    return cardHTML(c,{button:o.button,disabled:o.disabled&&o.disabled(c),cls:extra.join(' ')});}).join('');
}
function fitFan(el){
  const n=el.children.length;if(n<2)return;
  const cw=parseFloat(getComputedStyle(el).getPropertyValue('--fw'))||52;
  const breaks=el.querySelectorAll('.brk').length;
  const W=el.clientWidth;
  const step=Math.min(cw+4,(W-cw-breaks*7)/(n-1));
  el.style.setProperty('--ov',(step-cw).toFixed(1)+'px');
}
function fitAll(){document.querySelectorAll('.fan').forEach(fitFan);}
addEventListener('resize',fitAll);

/* ---------- tabs ---------- */
const VIEWS=['learn','points','openings','play'];
function show(v){
  if(!VIEWS.includes(v))v='learn';
  VIEWS.forEach(x=>{$('#v-'+x).classList.toggle('on',x===v);$('#tab-'+x).setAttribute('aria-selected',x===v);});
  if(location.hash!=='#'+v)history.replaceState(null,'','#'+v);
  if(v==='play'&&!G)newDeal();
  requestAnimationFrame(fitAll);
}
document.querySelectorAll('nav.tabs button').forEach(b=>b.addEventListener('click',()=>{show(b.dataset.v);scrollTo({top:0});}));
addEventListener('hashchange',()=>show(location.hash.slice(1)));

/* ---------- lessons ---------- */
function trickFig(plays,win,trumpNote){
  const pos={0:'grid-column:2;grid-row:1',3:'grid-column:1;grid-row:2',1:'grid-column:3;grid-row:2',2:'grid-column:2;grid-row:3'};
  const ord=['1st','2nd','3rd','4th'];
  let h=plays.map((p,i)=>`<div class="slot" style="${pos[p.seat]}">${cardHTML(P(p.c),{cls:p.seat===win?'win':''})}<span>${SEAT[p.seat]} · ${ord[i]}</span></div>`).join('');
  h+=`<div style="grid-column:2;grid-row:2;font-size:12px;color:var(--muted);text-align:center;padding:4px">${trumpNote||''}</div>`;
  return `<div class="trickfig">${h}</div>`;
}
const LESSONS=[
 {t:'Four players, two teams',h:()=>`
  <p>Bridge is a card game for four players in two fixed partnerships. Partners sit opposite each other, so <b>North–South</b> play against <b>East–West</b>.</p>
  <figure class="fig"><div class="compass">
    <div></div><div class="seat ns">North<small>your partner</small></div><div></div>
    <div class="seat">West<small>opponent</small></div><div class="tbl">N–S<br>vs<br>E–W</div><div class="seat">East<small>opponent</small></div>
    <div></div><div class="seat ns">South<small>you</small></div><div></div>
  </div></figure>
  <p>A standard 52-card deck is dealt out, 13 cards each. Every deal then has two phases:</p>
  <ol class="steps"><li><b>The auction.</b> Players bid to decide how many tricks their side promises to win, and which suit, if any, will be trumps.</li>
  <li><b>The play.</b> All 13 cards are played out, one trick at a time, to see whether the promise was kept.</li></ol>
  <p>The score depends on that promise. Bid too low and you leave points on the table; bid too high and you pay a penalty. That tension is the whole game.</p>`},
 {t:'Winning a trick',h:()=>`
  <p>A trick is one card from each player, played clockwise. The first player can lead any card.</p>
  <ul class="rules"><li>Everyone else <b>must follow suit</b> if they can.</li><li>The highest card of the suit led wins. Aces are high, twos are low.</li><li>The winner of the trick leads to the next one.</li></ul>
  <figure class="fig">${trickFig([{seat:3,c:'HQ'},{seat:0,c:'H3'},{seat:1,c:'HK'},{seat:2,c:'HA'}],2)}
  <figcaption>${colorize('West leads the ♥Q. Everyone follows suit, and South’s ♥A is the highest heart, so South wins and leads next.')}</figcaption></figure>
  <p>If you can't follow suit you may play any card, but it can't win the trick. Unless it's a trump.</p>`},
 {t:'Trumps and notrump',h:()=>`
  <p>Most contracts name a <b>trump suit</b>. When you have no cards left in the suit led, you may play a trump instead. That's called <b>ruffing</b>. Any trump beats every card of the other suits, and if two players ruff, the higher trump wins.</p>
  <figure class="fig">${trickFig([{seat:3,c:'DA'},{seat:0,c:'D5'},{seat:1,c:'D9'},{seat:2,c:'S2'}],2,colorize('Trumps: ♠'))}
  <figcaption>${colorize('Spades are trumps. South has no diamonds and ruffs with the ♠2, which beats West’s ace.')}</figcaption></figure>
  <p>You still have to follow suit when you can: you may only ruff when you're out of the suit led.</p>
  <p>In a <b>notrump</b> contract there are no trumps at all, and the highest card of the suit led always wins.</p>`},
 {t:'The auction',h:()=>{
  let lad='';for(let l=1;l<=7;l++)for(let s=0;s<5;s++){const game=(s===4&&l===3)||(s>=2&&s<=3&&l===4)||(s<=1&&l===5);lad+=`<button type="button" data-l="${l}" data-s="${s}" class="${game?'game':''}${l>=6?' slam':''}" aria-pressed="false">${l}${s===4?'NT':`<span class="t${s}">${SUIT[s]}</span>`}</button>`;}
  return `
  <p>The dealer speaks first, then the auction moves clockwise. On your turn you can make a bid, pass, or double an opponent's bid.</p>
  <p>A bid is a <b>level</b> from 1 to 7 plus a <b>strain</b>: a trump suit, or notrump. The level counts tricks above six. The first six tricks are called the <i>book</i> and come free. So ${colorize('1♥')} promises 7 tricks with hearts as trumps, ${colorize('4♠')} promises 10, and 7NT promises all 13.</p>
  <p>Each bid must outrank the one before it: a higher level, or the same level in a higher strain. Strains rank ${colorize('♣ ♦ ♥ ♠')} NT, lowest to highest.</p>
  <figure class="fig"><div class="ladder" id="ladder">${lad}</div><div class="ladderinfo" id="ladderInfo">All 35 bids, lowest first. Tap one.</div>
  <figcaption>Gold outline: game contracts. Shaded rows: slams.</figcaption></figure>
  <p>The auction ends when three players pass in a row. Here North and South find a heart game:</p>
  <figure class="fig"><table class="t auction"><thead><tr><th>North</th><th>East</th><th>South</th><th>West</th></tr></thead><tbody>
  <tr><td>${colorize('1♥')}</td><td class="p">Pass</td><td>${colorize('2♥')}</td><td class="p">Pass</td></tr>
  <tr><td>${colorize('4♥')}</td><td class="p">Pass</td><td class="p">Pass</td><td class="p">Pass</td></tr></tbody></table>
  <figcaption>${colorize('North opens 1♥, South supports hearts, North jumps to game. The contract is 4♥.')}</figcaption></figure>
  <p class="aside">A double says "I think you'll fail". It raises the stakes either way: bigger penalties if the contract goes down, extra points if it makes.</p>`;}},
 {t:'Declarer, dummy, defenders',h:()=>`
  <p>The last bid becomes the <b>contract</b>. On the side that won the auction, the player who first named the contract's strain becomes <b>declarer</b>.</p>
  <ul class="rules"><li>The player on declarer's left makes the <b>opening lead</b>.</li>
  <li>Declarer's partner then lays their cards face up on the table. This hand is the <b>dummy</b>, and declarer plays it as well as their own.</li>
  <li>The other two players are the <b>defenders</b>. They win by taking enough tricks to <i>set</i> (defeat) the contract.</li></ul>
  <p>${colorize('In the 4♥ auction from the last lesson, North bid hearts first, so North is declarer, East leads, and South is dummy.')}</p>
  <p>In the Play tab you're always declarer, sitting South, with dummy across from you at North. Seeing both hands lets you plan.</p>`},
 {t:'Counting your points',h:()=>`
  <p>Before bidding, players value their hand with <b>high-card points</b> (HCP):</p>
  <figure class="fig"><div class="hcpfig">${['SA','HK','DQ','CJ'].map((c,i)=>`<div>${cardHTML(P(c))}${4-i}</div>`).join('')}</div></figure>
  <p>The deck holds 40 HCP, so an average hand has 10. Points steer the auction:</p>
  <figure class="fig"><table class="t"><tbody>
   <tr><td>12+ in your hand</td><td>Open the bidding</td></tr>
   <tr><td>25–26 between partners</td><td>Enough for game</td></tr>
   <tr><td>33 between partners</td><td>Small slam: 12 tricks</td></tr>
   <tr><td>37 between partners</td><td>Grand slam: all 13</td></tr></tbody></table></figure>
  <p><b>Shape</b> matters too. A hand is <b>balanced</b> when it has no void, no singleton and at most one doubleton: 4-3-3-3, 4-4-3-2 or 5-3-3-2. Long and short suits make a hand play better than its points suggest.</p>
  <div class="cta"><button class="btn primary" data-go="points">Practice counting points</button></div>`},
 {t:'Opening the bidding',h:()=>`
  <p>The first bid of the auction is the <b>opening</b>. This is a beginner version of Standard American. Check these in order and stop at the first that fits:</p>
  <ol class="steps">
   <li><b>22+ HCP:</b> open ${colorize('2♣')}. It's artificial: it says nothing about clubs, only that you're very strong.</li>
   <li><b>20–21, balanced:</b> open 2NT.</li>
   <li><b>15–17, balanced:</b> open 1NT.</li>
   <li><b>Under 12 HCP:</b> pass, unless the <b>Rule of 20</b> says open: your HCP plus the lengths of your two longest suits add up to 20 or more.</li>
   <li><b>Five or more cards in a major</b> (${colorize('♥ or ♠')}): open it at the one level. With two, open the longer; with 5-5 open ${colorize('1♠')}.</li>
   <li><b>Otherwise</b> open your longer minor. With 3-3 open ${colorize('1♣')}; with 4-4 open ${colorize('1♦')}.</li>
  </ol>
  <p class="aside">Real players also open weak hands with a long suit at the two or three level, called preempts. Learn those once these feel automatic.</p>
  <div class="cta"><button class="btn primary" data-go="openings">Practice opening bids</button></div>`},
 {t:'Answering partner',h:()=>`
  <p>When partner opens, you're the <b>responder</b>. Your first job is to show whether the partnership has enough for game, about 25 points.</p>
  <ul class="rules">
   <li><b>0–5 points:</b> usually pass.</li>
   <li><b>3+ cards in partner's major:</b> support it. With 6–10, raise to the two level; with 10–12 and four trumps, jump to three to invite game; with 13+, make sure you reach game.</li>
   <li><b>6+ with a four-card suit of your own:</b> bid it, at the one level if you can. A new suit forces partner to bid again.</li>
   <li><b>6–10 with no fit and nothing to bid at the one level:</b> 1NT.</li>
  </ul>
  <p>Over partner's 1NT (15–17) you can simply add your points: 0–7 pass, 8–9 bid 2NT to invite, 10–15 bid 3NT. Conventions called Stayman and transfers improve on this later.</p>`},
 {t:'Scoring in a nutshell',h:()=>`
  <p>When you make your contract you score <b>trick points</b> for each trick you bid beyond the book of six:</p>
  <figure class="fig"><table class="t"><thead><tr><th>Strain</th><th class="n">Per trick</th></tr></thead><tbody>
   <tr><td>${colorize('♣ ♦')} minors</td><td class="n">20</td></tr><tr><td>${colorize('♥ ♠')} majors</td><td class="n">30</td></tr><tr><td>Notrump</td><td class="n">40 first, then 30</td></tr></tbody></table></figure>
  <p>Reach 100 trick points in one contract and you've bid a <b>game</b>, which earns a big bonus. Less than that is a <b>part-score</b>. The cheapest games:</p>
  <figure class="fig"><table class="t"><thead><tr><th>Game</th><th class="n">Tricks</th><th class="n">Trick points</th></tr></thead><tbody>
   <tr><td>3NT</td><td class="n">9</td><td class="n">100</td></tr><tr><td>${colorize('4♥ / 4♠')}</td><td class="n">10</td><td class="n">120</td></tr><tr><td>${colorize('5♣ / 5♦')}</td><td class="n">11</td><td class="n">100</td></tr></tbody></table></figure>
  <figure class="fig"><table class="t"><thead><tr><th>Bonus</th><th class="n">Not vul.</th><th class="n">Vulnerable</th></tr></thead><tbody>
   <tr><td>Part-score</td><td class="n">50</td><td class="n">50</td></tr><tr><td>Game</td><td class="n">300</td><td class="n">500</td></tr>
   <tr><td>Small slam, extra</td><td class="n">500</td><td class="n">750</td></tr><tr><td>Grand slam, extra</td><td class="n">1000</td><td class="n">1500</td></tr>
   <tr><td>Each trick you go down</td><td class="n">−50</td><td class="n">−100</td></tr></tbody></table></figure>
  <p>Being <b>vulnerable</b> raises both the rewards and the penalties. The Play tab scores every deal as not vulnerable and undoubled.</p>`},
 {t:'Playing the hand',h:()=>`
  <p>As declarer, plan before you play to the first trick. A few principles carry beginners a long way:</p>
  <ul class="rules">
   <li><b>Count your sure winners</b> (aces, and kings backed by the ace) and compare them with the tricks you need.</li>
   <li><b>Draw trumps</b> early in a suit contract, so the defenders can't ruff your winners.</li>
   <li><b>Ruff in the short hand.</b> Trumping a loser in dummy makes an extra trick.</li>
   <li><b>Set up long suits.</b> Once the high cards in a suit are gone, the small ones left are winners too.</li>
   <li><b>Lead toward your honors.</b> This is the finesse:</li>
  </ul>
  <figure class="fig"><div class="finesse">
   <span class="lbl">North · dummy</span><div class="cards">${cardHTML(P('SA'))}${cardHTML(P('SQ'))}</div>
   <span class="lbl" style="margin-top:6px">South · you</span><div class="cards">${cardHTML(P('S5'))}${cardHTML(P('S4'))}</div></div>
  <figcaption>${colorize('Lead the ♠4 toward dummy. If West plays low, put in the ♠Q. Whenever West holds the ♠K, the queen wins and you take two tricks instead of one.')}</figcaption></figure>
  <p>The Play tab's Hint button explains a sensible card at every turn. Use it, then try to beat it.</p>
  <div class="cta"><button class="btn primary" data-go="play">Play a hand</button></div>`},
];
let lessonIx=Math.min(store.get('lesson',0),LESSONS.length-1);
let seen=new Set(store.get('seen',[0]));
function renderLesson(){
  seen.add(lessonIx);store.set('lesson',lessonIx);store.set('seen',[...seen]);
  $('#lnav').innerHTML=LESSONS.map((l,i)=>`<button type="button" data-i="${i}" class="${seen.has(i)?'seen':''}" aria-current="${i===lessonIx}" aria-label="Lesson ${i+1}: ${l.t}">${i+1}</button>`).join('');
  const L=LESSONS[lessonIx];
  $('#lesson').innerHTML=`<div class="eyebrow">Lesson ${lessonIx+1} of ${LESSONS.length}</div><h2>${L.t}</h2>${L.h()}
   <div class="lfoot"><button class="btn" id="lPrev" ${lessonIx===0?'disabled':''}>← Previous</button>
   ${lessonIx<LESSONS.length-1?`<button class="btn primary" id="lNext">Next: ${LESSONS[lessonIx+1].t} →</button>`:''}</div>`;
  const pv=$('#lPrev'),nx=$('#lNext');
  pv&&pv.addEventListener('click',()=>{lessonIx--;renderLesson();scrollTo({top:0});});
  nx&&nx.addEventListener('click',()=>{lessonIx++;renderLesson();scrollTo({top:0});});
  const lad=$('#ladder');
  if(lad)lad.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    lad.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));
    const l=+b.dataset.l,s=+b.dataset.s,t=l+6;
    const kind=l===7?'a grand slam':l===6?'a small slam':b.classList.contains('game')?'a game':'a part-score';
    $('#ladderInfo').innerHTML=colorize(`${l}${strainText(s)}: take ${t} tricks${s===4?' with no trumps':` with ${SUITNAME[s]} as trumps`}. That's ${kind}.`);
  });
}
$('#lnav').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;lessonIx=+b.dataset.i;renderLesson();});
$('#lesson').addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b){show(b.dataset.go);scrollTo({top:0});}});

/* ---------- points drill ---------- */
let pt={hand:null,answered:false,opts:[]},ptStats=store.get('pt',{right:0,total:0,streak:0});
function drillHand(){
  for(let i=0;i<2000;i++){const h=randomHand();const p=hcp(h);if(p>=6||Math.random()<.2)return h;}
  return randomHand();
}
function newPoints(){
  pt.hand=drillHand();pt.answered=false;
  const p=hcp(pt.hand),set=new Set([p]);
  while(set.size<4){const d=p+Math.floor(Math.random()*9)-4;if(d>=0)set.add(d);}
  pt.opts=[...set].sort((a,b)=>a-b);
  renderPoints();
}
function statText(s){return `<b>${s.right}</b> / ${s.total} right · streak <b>${s.streak}</b>`;}
function renderPoints(){
  $('#ptStat').innerHTML=statText(ptStats);
  $('#ptFan').innerHTML=fanHTML(pt.hand);fitFan($('#ptFan'));
  const p=hcp(pt.hand);
  $('#ptOpts').innerHTML=pt.opts.map(o=>`<button type="button" data-v="${o}" ${pt.answered?'disabled':''} class="${pt.answered&&o===p?'right':pt.answered&&o===pt.pick?'wrong':''}">${o}</button>`).join('');
  if(!pt.answered){$('#ptFb').innerHTML='';$('#ptNext').textContent='Skip';return;}
  $('#ptNext').textContent='Next hand';
  const n=r=>pt.hand.filter(c=>c.r===r).length;
  const parts=[[14,'Aces',4],[13,'Kings',3],[12,'Queens',2],[11,'Jacks',1]].filter(x=>n(x[0])).map(x=>`${x[1]} ${n(x[0])} × ${x[2]} = ${n(x[0])*x[2]}`);
  const ok=pt.pick===p;
  $('#ptFb').innerHTML=`<div class="feedback ${ok?'ok':'no'}"><span class="v">${ok?'Right, '+p+' HCP.':'It’s '+p+' HCP.'}</span>${parts.length?parts.join(' · '):'No honors at all: a Yarborough.'}
   <div class="facts">${colorize(shapeText(pt.hand))} · ${isBalanced(pt.hand)?'balanced':'unbalanced'}${p>=12?' · enough to open':''}</div></div>`;
}
$('#ptOpts').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||pt.answered)return;
  pt.pick=+b.dataset.v;pt.answered=true;const ok=pt.pick===hcp(pt.hand);
  ptStats.total++;if(ok){ptStats.right++;ptStats.streak++;}else ptStats.streak=0;store.set('pt',ptStats);renderPoints();});
$('#ptNext').addEventListener('click',newPoints);

/* ---------- openings drill ---------- */
const BIDS=['P','1C','1D','1H','1S','1N','2C','2N'];
let op={hand:null,answered:false},opStats=store.get('op',{right:0,total:0,streak:0});
function openingHand(){
  const r=Math.random();
  for(let i=0;i<5000;i++){const h=randomHand(),p=hcp(h);
    if(r<.06){if(p>=20)return h;continue;}
    if(r<.2){if(isBalanced(h)&&p>=15&&p<=17)return h;continue;}
    if(p>=9||Math.random()<.12)return h;}
  return randomHand();
}
function newOpening(){op.hand=openingHand();op.answered=false;op.pick=null;renderOpening();}
function renderOpening(){
  $('#opStat').innerHTML=statText(opStats);
  $('#opFan').innerHTML=fanHTML(op.hand);fitFan($('#opFan'));
  const ans=openingBid(op.hand);
  $('#bidbox').innerHTML=BIDS.map(b=>`<button type="button" data-b="${b}" class="${b==='P'?'pass ':''}${op.answered&&b===ans.bid?'right':op.answered&&b===op.pick?'wrong':''}" ${op.answered?'disabled':''}>${b==='P'?'Pass':b[0]+(b[1]==='N'?'NT':`<span class="s${'CDHS'.indexOf(b[1])}">${SUIT['CDHS'.indexOf(b[1])]}</span>`)}</button>`).join('');
  if(!op.answered){$('#opFb').innerHTML='';$('#opNext').textContent='Skip';return;}
  $('#opNext').textContent='Next hand';
  const ok=op.pick===ans.bid;
  $('#opFb').innerHTML=`<div class="feedback ${ok?'ok':'no'}"><span class="v">${colorize(ok?'Right: '+fmtBid(ans.bid)+'.':'The book bid is '+fmtBid(ans.bid)+'.')}</span>${colorize(ans.why)}<div class="facts">${colorize(ans.facts)}</div></div>`;
}
$('#bidbox').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||op.answered)return;
  op.pick=b.dataset.b;op.answered=true;const ok=op.pick===openingBid(op.hand).bid;
  opStats.total++;if(ok){opStats.right++;opStats.streak++;}else opStats.streak=0;store.set('op',opStats);renderOpening();});
$('#opNext').addEventListener('click',newOpening);

/* ---------- play ---------- */
let G=null,gen=0,busy=false,peek=false,hint=null;
function contractWhy(c){
  const sz=c.level===7?'a grand slam':c.level===6?'a small slam':(c.strain===4&&c.level>=3)||(c.strain>=2&&c.strain<=3&&c.level>=4)||(c.strain<=1&&c.level>=5)?'game':'a part-score';
  if(c.strain===4)return `You and dummy hold ${c.hc} HCP with no eight-card major fit: ${sz} in notrump.`;
  return colorize(`You and dummy hold ${c.hc} HCP and ${c.fit} ${SUITNAME[c.strain]} between you: ${sz} with ${SUIT[c.strain]} as trumps.`);
}
function oppHTML(seat){
  const h=G.hands[seat],act=!G.over&&G.turn===seat;
  let body;
  if(peek){const rows=[3,2,1,0].map(s=>`<div><span class="t${s}">${SUIT[s]}</span> ${h.filter(c=>c.s===s).map(c=>rk(c.r)).join(' ')||'–'}</div>`).join('');body=`<div class="peek">${rows}</div>`;}
  else body=h.length?`<div class="back" aria-hidden="true"></div>`:'';
  return {cls:act,html:`<span class="nm">${SEAT[seat]}</span>${body}${h.length} card${h.length===1?'':'s'}`};
}
function renderPlay(){
  if(!G)return;
  const c=G.contract,need=c.level+6;
  $('#pContract').innerHTML=`${c.level}${c.strain===4?'NT':`<span class="t${c.strain}">${SUIT[c.strain]}</span>`}<small>by South</small>`;
  $('#pNeed').innerHTML=`Take <b>${need}</b> of 13 tricks.<br>Defenders need <b>${14-need}</b> to beat you.`;
  $('#pTally').innerHTML=`You <b>${G.ns}</b> · Them <b>${G.ew}</b>`;
  $('#pWhy').innerHTML=contractWhy(c);
  const myTurn=s=>!busy&&!G.over&&G.turn===s;
  for(const [seat,id,hid,cid] of [[0,'#fanN','#hN','#cN'],[2,'#fanS','#hS','#cS']]){
    const legal=myTurn(seat)?legalCards(G.hands[seat],G.trick):[];
    const isLegal=x=>legal.some(l=>l.s===x.s&&l.r===x.r);
    $(id).innerHTML=fanHTML(G.hands[seat],{button:true,disabled:x=>!isLegal(x),dim:x=>myTurn(seat)&&!isLegal(x),hint:x=>hint&&hint.seat===seat&&hint.card.s===x.s&&hint.card.r===x.r});
    $(hid).classList.toggle('active',myTurn(seat));
    $(cid).textContent=`${G.hands[seat].length} cards · ${hcp(G.orig[seat])} HCP`;
    fitFan($(id));
  }
  for(const [seat,id] of [[3,'#oW'],[1,'#oE']]){const o=oppHTML(seat);$(id).innerHTML=o.html;$(id).classList.toggle('active',o.cls);}
  const pos={0:'grid-column:2;grid-row:1',3:'grid-column:1;grid-row:2',1:'grid-column:3;grid-row:2',2:'grid-column:2;grid-row:3'};
  const w=G.trick.length===4?trickWinner(G.trick,G.trump).seat:-1;
  $('#trick').innerHTML=G.trick.map(t=>`<div style="${pos[t.seat]}">${cardHTML(t.card,{cls:t.seat===w?'win':''})}</div>`).join('')+
    `<div class="c" style="grid-column:2;grid-row:2">Trick ${Math.min(G.history.length+1,13)}<br>of 13</div>`;
  let msg=G.note?colorize(G.note)+' ':'';
  if(G.over){
    const r=scoreDeal(c.level,c.strain,G.ns);
    const cn=`${c.level}${strainText(c.strain)}`;
    const head=r.made?(r.over?`Made ${cn} with ${r.over} overtrick${r.over>1?'s':''}`:`Made ${cn} exactly`):`Down ${r.down} in ${cn}`;
    msg=`<span class="result ${r.made?'ok':'no'}">${colorize(head)}: ${r.total>0?'+':'−'}${Math.abs(r.total)}</span>You took ${G.ns} trick${G.ns===1?'':'s'}, the defenders ${G.ew}.${r.made?(r.game?' A game bonus is in that score.':''):' Replay the deal and try another line, or ask for hints.'}`;
  } else if(myTurn(G.turn)){
    const from=G.turn===0?'dummy (North)':'your hand (South)';
    msg+=`<b>Your turn:</b> ${G.trick.length?'play':'lead'} from ${from}.`;
    if(hint)msg+=`<br><span class="muted">Hint: ${colorize(hint.why)}</span>`;
  }
  $('#pMsg').innerHTML=msg;
  $('#hintBtn').disabled=!myTurn(G.turn)||G.over;
  $('#peekBtn').setAttribute('aria-pressed',peek);
  $('#peekBtn').textContent=peek?"Hide defenders' cards":"Show defenders' cards";
}
async function run(){
  const my=gen;
  while(G&&!G.over&&my===gen){
    const seat=G.turn;
    if(seat===0||seat===2){busy=false;renderPlay();return;}
    busy=true;renderPlay();
    await sleep(reduceMotion?200:650);if(my!==gen)return;
    const {card}=choosePlay(G,seat);
    G.note=`${SEAT[seat]} ${G.trick.length?'plays':'leads'} ${cname(card)}.`;
    applyPlay(G,seat,card);
    if(!(await settle(my)))return;
  }
  busy=false;renderPlay();
}
async function settle(my){
  if(G.trick.length<4)return true;
  busy=true;renderPlay();
  await sleep(reduceMotion?500:1150);if(my!==gen)return false;
  const w=resolveTrick(G);
  G.note=`${w.seat===2?'You win':w.seat===0?'Dummy wins':SEAT[w.seat]+' wins'} the trick with the ${cname(w.card)}.`;
  return true;
}
async function userPlay(seat,card){
  if(busy||G.over||G.turn!==seat)return;
  if(!legalCards(G.hands[seat],G.trick).some(c=>c.s===card.s&&c.r===card.r))return;
  hint=null;
  G.note=`${seat===0?'Dummy plays':'You play'} the ${cname(card)}.`;
  applyPlay(G,seat,card);
  const my=gen;
  if(!(await settle(my)))return;
  run();
}
function onFan(e){const b=e.target.closest('button.pc');if(!b||b.disabled)return;userPlay(+e.currentTarget.dataset.seat,{s:+b.dataset.s,r:+b.dataset.r});}
$('#fanN').addEventListener('click',onFan);$('#fanS').addEventListener('click',onFan);
function newDeal(){gen++;hint=null;busy=false;G=newGame();G.note='West makes the opening lead.';run();}
function replay(){if(!G)return;gen++;hint=null;busy=false;G=startGame(G.orig);G.note='Same cards again. West makes the opening lead.';run();}
$('#newBtn').addEventListener('click',newDeal);
$('#replayBtn').addEventListener('click',replay);
$('#peekBtn').addEventListener('click',()=>{peek=!peek;renderPlay();});
$('#hintBtn').addEventListener('click',()=>{if(!G||busy||G.over)return;const s=G.turn;if(s!==0&&s!==2)return;const h=choosePlay(G,s);hint={seat:s,card:h.card,why:h.why};renderPlay();});

/* ---------- boot ---------- */
renderLesson();newPoints();newOpening();
show(location.hash.slice(1)||'learn');
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fitAll);
