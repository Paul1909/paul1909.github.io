// Bridge rules, bidding and card-play logic (no DOM).
const SUIT=['♣','♦','♥','♠'];
const SUITNAME=['clubs','diamonds','hearts','spades'];
const SUITONE=['club','diamond','heart','spade'];
const SEAT=['North','East','South','West'];
const rk=r=>r===14?'A':r===13?'K':r===12?'Q':r===11?'J':String(r);
const cname=c=>SUIT[c.s]+rk(c.r);
function newDeck(){const d=[];for(let s=0;s<4;s++)for(let r=2;r<=14;r++)d.push({s,r});return d;}
function shuffle(a,rnd){rnd=rnd||Math.random;for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function sortHand(h){return h.sort((a,b)=>b.s-a.s||b.r-a.r);}
function dealHands(rnd){const d=shuffle(newDeck(),rnd);return [0,1,2,3].map(i=>sortHand(d.slice(i*13,i*13+13)));}
function randomHand(rnd){return sortHand(shuffle(newDeck(),rnd).slice(0,13));}
function hcp(h){return h.reduce((t,c)=>t+(c.r>10?c.r-10:0),0);}
function lens(h){const L=[0,0,0,0];h.forEach(c=>L[c.s]++);return L;}
function isBalanced(h){const L=lens(h);return L.every(n=>n>=2)&&L.filter(n=>n===2).length<=1;}
function shapeText(h){const L=lens(h);return `${L[3]}♠ ${L[2]}♥ ${L[1]}♦ ${L[0]}♣`;}

function openingBid(h){
  const p=hcp(h),L=lens(h),bal=isBalanced(h);
  const top2=[...L].sort((a,b)=>b-a),r20=p+top2[0]+top2[1];
  const facts=`${p} HCP · ${shapeText(h)} · ${bal?'balanced':'unbalanced'}`;
  if(p>=22) return {bid:'2C',why:'22 or more HCP: open 2♣, the strong artificial opening. Partner must keep the auction going.',facts};
  if(bal&&p>=20&&p<=21) return {bid:'2N',why:'20–21 HCP and balanced: open 2NT.',facts};
  if(bal&&p>=15&&p<=17) return {bid:'1N',why:'15–17 HCP and balanced: open 1NT'+(L.some(n=>n>=5)?', even with a five-card suit.':'.'),facts};
  let pre='';
  if(p<12){
    if(p>=10&&r20>=20) pre=`Only ${p} HCP, but the Rule of 20 says open: ${p} + ${top2[0]} + ${top2[1]} = ${r20}. `;
    else return {bid:'P',why:p>=10?`${p} HCP and the Rule of 20 comes up short (${p} + ${top2[0]} + ${top2[1]} = ${r20}), so pass.`:'Fewer than 12 HCP: pass.',facts};
  } else if(bal&&p>=18&&p<=19) pre='18–19 balanced is too strong for 1NT, so open a suit and plan to jump in notrump next turn. ';
  if(L[3]>=5||L[2]>=5){
    const s=L[3]>=L[2]?3:2;let w;
    if(L[3]>=5&&L[2]>=5) w=L[3]===L[2]?'Five-five in the majors: open the higher-ranking one, 1♠.':`Both majors are long: open the longer one, 1${SUIT[s]}.`;
    else w=`A five-card or longer major comes first: open 1${SUIT[s]}.`;
    return {bid:'1'+'CDHS'[s],why:pre+w,facts};
  }
  let s,w;
  if(L[1]>L[0]){s=1;w='No five-card major, so open your longer minor: 1♦.';}
  else if(L[0]>L[1]){s=0;w='No five-card major, so open your longer minor: 1♣.';}
  else if(L[0]===3){s=0;w='No five-card major and 3–3 in the minors: open 1♣.';}
  else {s=1;w=`No five-card major and ${L[0]}–${L[1]} in the minors: open 1♦.`;}
  return {bid:'1'+'CDHS'[s],why:pre+w,facts};
}

function cardBeats(c,w,trump){if(c.s===w.s)return c.r>w.r;return c.s===trump;}
function trickWinner(trick,trump){let b=trick[0];for(let i=1;i<trick.length;i++)if(cardBeats(trick[i].card,b.card,trump))b=trick[i];return b;}
function legalCards(hand,trick){if(!trick.length)return hand.slice();const led=trick[0].card.s;const f=hand.filter(c=>c.s===led);return f.length?f:hand.slice();}
const lowest=a=>a.reduce((m,c)=>c.r<m.r?c:m);
const highest=a=>a.reduce((m,c)=>c.r>m.r?c:m);
function isMaster(card,g){for(const h of g.hands)for(const c of h)if(c.s===card.s&&c.r>card.r)return false;return true;}

function openingLead(g,seat){
  const trump=g.trump,hand=g.hands[seat];
  const by=[0,1,2,3].map(s=>hand.filter(c=>c.s===s).sort((a,b)=>b.r-a.r));
  const cand=[0,1,2,3].filter(s=>s!==trump&&by[s].length);
  if(!cand.length)return {card:lowest(hand),why:''};
  const seq=cand.filter(s=>by[s].length>=2&&by[s][0].r>=12&&by[s][1].r===by[s][0].r-1);
  if(seq.length){seq.sort((x,y)=>by[y][0].r-by[x][0].r||by[y].length-by[x].length);return {card:by[seq[0]][0],why:'top of a sequence'};}
  let pool=cand;
  if(trump>=0){const safe=cand.filter(s=>by[s][0].r!==14);if(safe.length)pool=safe;}
  pool=pool.slice().sort((x,y)=>by[y].length-by[x].length||hcp(by[y])-hcp(by[x]));
  const a=by[pool[0]];
  let card;
  if(a.length>=4&&a[0].r>=11)card=a[3];else if(a.length>=3&&a[0].r>=11)card=a[a.length-1];else card=a[0];
  return {card,why:'longest suit'};
}

function leadPlay(g,seat){
  const trump=g.trump,hand=g.hands[seat],ns=seat%2===0,partner=(seat+2)%4;
  if(!ns&&g.history.length===0)return openingLead(g,seat);
  const opp=[(seat+1)%4,(seat+3)%4];
  if(trump>=0&&ns){
    const oppTr=opp.reduce((t,o)=>t+g.hands[o].filter(c=>c.s===trump).length,0);
    const myTr=hand.filter(c=>c.s===trump);
    if(oppTr>0&&myTr.length){
      const top=highest(myTr);
      if(isMaster(top,g))return {card:top,why:`Draw trumps. The defenders still hold ${oppTr} trump${oppTr>1?'s':''} and your ${cname(top)} is the highest one left, so pull them before they can ruff your winners.`};
      const ptr=g.hands[partner].filter(c=>c.s===trump);
      if(ptr.length&&isMaster(highest(ptr),g))return {card:lowest(myTr),why:`Draw trumps. Lead a small trump over to partner's ${cname(highest(ptr))}, the top trump.`};
    }
  }
  const nonTr=hand.filter(c=>c.s!==trump);
  const masters=nonTr.filter(c=>isMaster(c,g));
  if(masters.length){const c=masters[0];return {card:c,why:`Cash a sure winner: the ${cname(c)} is the highest ${SUITONE[c.s]} still out.`};}
  if(ns){
    for(const s of [3,2,1,0]){
      if(s===trump)continue;
      const mine=hand.filter(c=>c.s===s),theirs=g.hands[partner].filter(c=>c.s===s);
      if(mine.length&&theirs.length&&isMaster(highest(theirs),g)){
        return {card:lowest(mine),why:`Lead toward partner's winner: play a low ${SUITONE[s]} so the ${cname(highest(theirs))} can take the trick.`};
      }
    }
  }
  const pool=nonTr.length?nonTr:hand,L=lens(hand);
  const s=[0,1,2,3].filter(x=>pool.some(c=>c.s===x)).sort((a,b)=>L[b]-L[a])[0];
  const card=lowest(pool.filter(c=>c.s===s));
  return {card,why:`No sure winner to cash. Lead low from your longest suit (${SUITNAME[s]}): once the high cards are gone, its small cards become winners.`};
}

function followPlay(g,seat){
  const trump=g.trump,trick=g.trick,leg=legalCards(g.hands[seat],trick);
  const led=trick[0].card.s,pos=trick.length,cur=trickWinner(trick,trump),partner=(seat+2)%4;
  const beats=c=>cardBeats(c,cur.card,trump);
  if(leg[0].s===led){
    if(cur.seat===partner)return {card:lowest(leg),why:`Partner's ${cname(cur.card)} is already winning this trick, so play low.`};
    const w=leg.filter(beats);
    if(!w.length)return {card:lowest(leg),why:`You can't beat the ${cname(cur.card)}, so play your lowest ${SUITONE[led]}.`};
    if(pos===1)return {card:lowest(leg),why:'Second hand low: keep your high cards, because partner plays last to this trick and can still win it.'};
    const c=lowest(w);
    return {card:c,why:`Win as cheaply as you can: the ${cname(c)} is enough.`};
  }
  const trumps=trump>=0?leg.filter(c=>c.s===trump):[];
  if(cur.seat!==partner&&trumps.length){
    const w=trumps.filter(beats);
    if(w.length){const c=lowest(w);return {card:c,why:`You're out of ${SUITNAME[led]}, so ruff with a small trump: the ${cname(c)}.`};}
  }
  const nonTr=leg.filter(c=>c.s!==trump),p=nonTr.length?nonTr:leg,L=lens(g.hands[seat]);
  const card=p.reduce((m,c)=>(c.r<m.r||(c.r===m.r&&L[c.s]>L[m.s]))?c:m);
  return {card,why:cur.seat===partner?`You're out of ${SUITNAME[led]} and partner is winning, so throw away a low card.`:`You're out of ${SUITNAME[led]} and can't win the trick, so discard your least useful card.`};
}

function choosePlay(g,seat){return g.trick.length?followPlay(g,seat):leadPlay(g,seat);}

function pickContract(N,S){
  const hc=hcp(N)+hcp(S),LN=lens(N),LS=lens(S),fit=[0,1,2,3].map(s=>LN[s]+LS[s]);
  const noShort=h=>lens(h).every(n=>n>=2);
  const lvl=(e,t)=>{for(const [m,l] of t)if(e>=m)return l;return t[t.length-1][1];};
  let strain,level;
  const majors=[3,2].filter(s=>fit[s]>=8).sort((a,b)=>fit[b]-fit[a]);
  if(majors.length){strain=majors[0];level=lvl(hc+fit[strain]-8,[[37,7],[33,6],[25,4],[23,3],[0,2]]);}
  else{
    const minors=[1,0].filter(s=>fit[s]>=8).sort((a,b)=>fit[b]-fit[a]);
    if(minors.length&&!(noShort(N)&&noShort(S))){
      strain=minors[0];const e=hc+fit[strain]-8;
      if(e>=29)level=lvl(e,[[37,7],[33,6],[29,5]]);
      else if(hc>=25){strain=4;level=3;}
      else level=e>=23?3:2;
    } else {strain=4;level=lvl(hc,[[37,7],[33,6],[25,3],[23,2],[0,1]]);}
  }
  return {level,strain,hc,fit:strain<4?fit[strain]:null};
}

function newGame(rnd){
  let h=dealHands(rnd);
  if(hcp(h[1])+hcp(h[3])>hcp(h[0])+hcp(h[2]))h=[h[1],h[2],h[3],h[0]];
  return startGame(h);
}
function startGame(h){
  const contract=pickContract(h[0],h[2]);
  return {hands:h.map(x=>x.slice()),orig:h.map(x=>x.slice()),contract,trump:contract.strain<4?contract.strain:-1,
    trick:[],turn:3,leader:3,ns:0,ew:0,history:[],over:false,note:''};
}
function applyPlay(g,seat,card){const h=g.hands[seat];const i=h.findIndex(c=>c.s===card.s&&c.r===card.r);if(i<0)throw new Error('card not in hand');h.splice(i,1);g.trick.push({seat,card});g.turn=(seat+1)%4;}
function resolveTrick(g){const w=trickWinner(g.trick,g.trump);if(w.seat%2===0)g.ns++;else g.ew++;g.history.push({trick:g.trick,winner:w.seat});g.trick=[];g.turn=g.leader=w.seat;if(g.hands.every(h=>!h.length))g.over=true;return w;}
function scoreDeal(level,strain,tricks){
  const need=level+6;
  if(tricks>=need){
    const tv=strain<=1?20:30;
    const trickPts=strain===4?40+30*(level-1):tv*level;
    let total=trickPts+(trickPts>=100?300:50);
    if(level===6)total+=500;if(level===7)total+=1000;
    const over=tricks-need;total+=over*tv;
    return {made:true,over,total,game:trickPts>=100};
  }
  return {made:false,down:need-tricks,total:-50*(need-tricks)};
}
