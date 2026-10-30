import{a as B,b as ne,c as re,d as ie,e as se,f as le,g as ce,h as de,i as pe,m as $,o as w,p as T,q as A,r as G,s as q,u as e,v as ue,w as a,x as m}from"./chunk.js";function be({checked:t,onChange:o,label:l}){return e("button",{type:"button",class:"wa-switch",role:"switch","aria-checked":t?"true":"false","aria-label":l,onClick:()=>o(!t)})}function _({control:t,value:o,onChange:l,scope:s}){let n=`wa-sl-${s?s+"-":""}${t.key}`,c=t.format?t.format(o):`${o}${t.unit||""}`;return e("div",{class:"wa-ctl-row",children:[e("div",{class:"wa-ctl-head",children:[e("label",{class:"wa-ctl-label",for:n,children:t.label}),e("span",{class:"wa-ctl-val","aria-hidden":"true",children:c})]}),e("input",{id:n,class:"wa-slider",type:"range",min:t.min,max:t.max,step:t.step,value:o,"aria-valuetext":c,onInput:u=>l(Number(u.target.value))})]})}function ke({control:t,value:o,onChange:l}){return e("div",{class:"wa-ctl-row",children:[e("div",{class:"wa-ctl-head",children:e("span",{class:"wa-ctl-label",children:t.label})}),e("div",{class:"wa-seg",role:"group","aria-label":t.label,children:(t.options||[]).map(s=>e("button",{type:"button","aria-pressed":o===s.value?"true":"false",onClick:()=>l(s.value),children:s.label},String(s.value)))})]})}function Ee({control:t,value:o,onChange:l}){let s=o&&o!=="auto";return e("div",{class:"wa-ctl-row",children:e("div",{class:"wa-color-row",children:[e("span",{class:"wa-ctl-label",children:t.label}),e("div",{class:"wa-color-swatch",children:[e("input",{class:"wa-color-input",type:"color",value:s?o:"#1e40af","aria-label":s?a("ctl.colorSet",{label:t.label,value:o}):a("ctl.colorAuto",{label:t.label}),onInput:n=>l(n.target.value)}),s?e("button",{type:"button",class:"wa-color-clear","aria-label":a("ctl.colorClear",{label:t.label}),onClick:()=>l("auto"),children:"Clear"}):e("span",{class:"wa-color-clear",children:"Auto"})]})]})})}function z(t,o){return{"aria-disabled":t?"true":void 0,onClick:()=>{t||o()}}}function we({control:t,value:o,onChange:l,scope:s}){switch(t.type){case"slider":return e(_,{control:t,value:Number(o),onChange:n=>l(t.key,n),scope:s});case"segmented":case"select":return e(ke,{control:t,value:o,onChange:n=>l(t.key,n)});case"color":return e(Ee,{control:t,value:String(o),onChange:n=>l(t.key,n)});default:return null}}function ge({engine:t}){let[o,l]=w(t.tts.getState()),[s,n]=w(t.tts.voices());return T(()=>t.tts.subscribe(l),[t]),T(()=>{let c=()=>n(t.tts.voices());c();let u=setTimeout(c,250);return typeof speechSynthesis!="undefined"&&(speechSynthesis.onvoiceschanged=c),()=>clearTimeout(u)},[t]),o.supported?e("div",{class:"wa-panel-block",role:"group","aria-label":a("tts.group"),children:[e("div",{class:"wa-card-main",style:"padding:0",children:[e("div",{class:"wa-card-ic","data-on":o.speaking?"true":"false",children:e(m,{name:"volume",size:18})}),e("div",{class:"wa-card-tx",children:[e("div",{class:"wa-card-name",children:a("tts.title")}),e("div",{class:"wa-card-desc",children:a("tts.desc")})]})]}),e("div",{class:"wa-tts-controls",children:[o.speaking?o.paused?e("button",{class:"wa-btn wa-btn-primary",onClick:()=>t.tts.resume(),children:[e(m,{name:"play",size:15})," ",a("tts.resume")]}):e("button",{class:"wa-btn wa-btn-primary",onClick:()=>t.tts.pause(),children:[e(m,{name:"pause",size:15})," ",a("tts.pause")]}):e("button",{class:"wa-btn wa-btn-primary",onClick:()=>t.tts.speakAuto(document),children:[e(m,{name:"play",size:15})," ",a("tts.play")]}),e("button",{class:"wa-btn wa-btn-ghost",disabled:!o.speaking,onClick:()=>t.tts.stop(),children:[e(m,{name:"stop",size:14})," ",a("tts.stop")]})]}),e("div",{style:"margin-top:12px",children:e(_,{control:{key:"rate",type:"slider",label:a("tts.speed"),min:.6,max:1.8,step:.1,format:c=>`${c}\xD7`},value:o.rate,onChange:c=>t.tts.setRate(c),scope:"tts"})}),e("div",{style:"margin-top:10px",children:e(_,{control:{key:"pitch",type:"slider",label:a("tts.pitch"),min:.5,max:2,step:.1,format:c=>`${c}\xD7`},value:o.pitch,onChange:c=>t.tts.setPitch(c),scope:"tts"})}),s.length>1&&e("div",{class:"wa-ctl-row",style:"margin-top:10px",children:[e("label",{class:"wa-ctl-label",for:"wa-voice",children:a("tts.voice")}),e("div",{class:"wa-seg",style:"padding:0;background:none;border:0",children:e("select",{id:"wa-voice",class:"wa-input",value:o.voiceURI||"",onChange:c=>t.tts.setVoice(c.target.value||null),children:[e("option",{value:"",children:a("tts.voiceDefault")}),s.slice(0,24).map(c=>e("option",{value:c.voiceURI,children:c.name},c.voiceURI))]})})]})]}):null}function Se(t){return t.length<8?"\u2022\u2022\u2022\u2022":`${t.slice(0,4)}\u2022\u2022\u2022\u2022${t.slice(-4)}`}function xe({engine:t,announce:o}){let l=t.getState().apiKey,s=t.provider.isConfigured(),[n,c]=w(""),[u,S]=w(null),[k,R]=w(""),[x,J]=w(""),[I,P]=w(""),[X,N]=w("Spanish"),C=async(p,d)=>{S(p),J(""),R("");try{R(await d())}catch(g){J(g.message||a("ai.errGeneric"))}finally{S(null)}},M=()=>C("summary",async()=>{let d=(document.querySelector('main,[role="main"],article')||document.body).innerText||document.body.innerText||"";if(d.trim().length<40)throw new Error(a("ai.errNoSummary"));return t.provider.summarize(d,{title:document.title,url:location.href})}),H=()=>C("simplify",async()=>{var d;let p=(((d=getSelection==null?void 0:getSelection())==null?void 0:d.toString())||"").trim();if(!p)throw new Error(a("ai.errSelectText"));return t.provider.simplify(p,{level:"plain"})}),E=()=>C("explain",async()=>{var d;let p=(((d=getSelection==null?void 0:getSelection())==null?void 0:d.toString())||"").trim();if(!p)throw new Error(a("ai.errSelectPassage"));return t.provider.explain(p)}),D=()=>C("translate",async()=>{var d;let p=(((d=getSelection==null?void 0:getSelection())==null?void 0:d.toString())||"").trim();if(!p)throw new Error(a("ai.errSelectText"));return t.provider.translate(p,X)}),v=()=>C("ask",async()=>{if(!I.trim())throw new Error(a("ai.errTypeQuestion"));let d=(document.querySelector('main,[role="main"],article')||document.body).innerText||document.body.innerText||"";if(d.trim().length<40)throw new Error(a("ai.errNoAnswerText"));return t.provider.ask(I.trim(),d)}),i=()=>C("alt",async()=>{let p=Array.from(document.images).filter(g=>{var y;return!((y=g.alt)!=null&&y.trim())&&g.src}).slice(0,6);if(!p.length)return a("ai.altAllPresent");let d=0;for(let g of p)try{let y=g.src,F=await me(y),V=await t.provider.describeImage({dataUrl:F,context:document.title});if(!g.isConnected||g.src!==y)continue;g.alt=V,g.setAttribute("aria-label",V),d+=1}catch{}return d?a("ai.altDone",{n:d,s:d>1?"s":"",them:d>1?"them":"it"}):a("ai.altBlocked")}),f=()=>C("ocr",async()=>{let p=Array.from(document.images).filter(y=>y.src&&y.naturalWidth>120&&y.naturalHeight>60).slice(0,4);if(!p.length)return a("ai.ocrNoImages");let d=[],g=0;for(let y of p)try{let F=(await t.provider.ocr({dataUrl:await me(y.src)})).trim();F&&d.push(F)}catch{g+=1}return d.length?d.join(`

`):g?a("ai.altBlocked"):a("ai.ocrNoText")});return s?e("div",{class:"wa-panel-block",children:[e("div",{class:"wa-card-main",style:"padding:0",children:[e("div",{class:"wa-card-ic","data-on":"true",children:e(m,{name:"key",size:18})}),e("div",{class:"wa-card-tx",children:[e("div",{class:"wa-card-name",children:a("ai.title")}),l?e("div",{class:"wa-card-desc",children:a("ai.connected",{key:Se(l)})}):null]}),l?e("button",{class:"wa-card-gear","aria-label":a("ai.removeKey"),onClick:()=>t.setApiKey(""),children:e(m,{name:"close",size:15})}):null]}),e("div",{class:"wa-ai-key",style:"margin-top:12px",children:[e("input",{class:"wa-input",type:"text",placeholder:a("ai.askPlaceholder"),value:I,"aria-label":a("ai.askLabel"),onInput:p=>P(p.target.value),onKeyDown:p=>{p.key==="Enter"&&!u&&v()}}),e("button",{class:"wa-btn wa-btn-primary",...z(!!u,v),children:u==="ask"?"\u2026":a("ai.ask")})]}),e("div",{style:"display:flex;flex-direction:column;gap:8px;margin-top:8px",children:[e("button",{class:"wa-btn wa-btn-ghost wa-btn-block",...z(!!u,M),children:u==="summary"?a("ai.summarizing"):a("ai.summarize")}),e("div",{style:"display:flex;gap:8px",children:[e("button",{class:"wa-btn wa-btn-ghost",style:"flex:1",...z(!!u,H),children:u==="simplify"?"\u2026":a("ai.simplify")}),e("button",{class:"wa-btn wa-btn-ghost",style:"flex:1",...z(!!u,E),children:u==="explain"?"\u2026":a("ai.explain")})]}),e("div",{style:"display:flex;gap:8px",children:[e("select",{class:"wa-input",style:"flex:1",value:X,"aria-label":a("ai.translateLabel"),onChange:p=>N(p.target.value),children:Ce.map(p=>e("option",{value:p,children:p},p))}),e("button",{class:"wa-btn wa-btn-ghost",...z(!!u,D),children:u==="translate"?"\u2026":a("ai.translate")})]}),e("button",{class:"wa-btn wa-btn-ghost wa-btn-block",...z(!!u,i),children:u==="alt"?a("ai.describingImages"):a("ai.altText")}),e("button",{class:"wa-btn wa-btn-ghost wa-btn-block",...z(!!u,f),children:u==="ocr"?a("ai.extracting"):a("ai.extractText")})]}),e("div",{class:"wa-ai-out",role:"alert",style:x?"color:var(--danger)":"display:none",children:x}),e("div",{class:"wa-ai-out",role:"status","aria-live":"polite","aria-label":a("ai.resultLabel"),tabIndex:k?0:-1,style:k?void 0:"display:none",children:k}),e("p",{class:"wa-note",children:a("ai.footNote")})]}):e("div",{class:"wa-panel-block",children:[e("div",{class:"wa-card-main",style:"padding:0",children:[e("div",{class:"wa-card-ic",children:e(m,{name:"key",size:18})}),e("div",{class:"wa-card-tx",children:[e("div",{class:"wa-card-name",children:a("ai.titleOptional")}),e("div",{class:"wa-card-desc",children:a("ai.descKeyPrompt")})]})]}),e("div",{class:"wa-ai-key",children:[e("input",{class:"wa-input",type:"password",placeholder:a("ai.keyPlaceholder"),value:n,autocomplete:"off","aria-label":a("ai.keyPlaceholder"),onInput:p=>c(p.target.value)}),e("button",{class:"wa-btn wa-btn-primary",...z(!n.trim(),()=>{t.setApiKey(n.trim()),o==null||o(a("announce.keySaved"))}),children:a("ai.save")})]}),e("p",{class:"wa-note",children:a("ai.keyNote")})]})}var Ce=["Spanish","French","German","Italian","Portuguese","Chinese","Japanese","Korean","Hindi","Arabic","Russian","English"];async function me(t){let l=await(await fetch(t,{mode:"cors"})).blob();return new Promise((s,n)=>{let c=new FileReader;c.onload=()=>s(c.result),c.onerror=()=>n(new Error("read failed")),c.readAsDataURL(l)})}function W({icon:t,name:o,desc:l,on:s}){return e("div",{class:"wa-card-main",style:"padding:0",children:[e("span",{class:"wa-card-ic","data-on":s?"true":"false",children:e(m,{name:t,size:18})}),e("div",{class:"wa-card-tx",children:[e("div",{class:"wa-card-name",children:o}),e("div",{class:"wa-card-desc",children:l})]})]})}function fe({engine:t}){let[o,l]=w(""),s=c=>{l(c),setTimeout(()=>l(""),1700)},n=async(c,u)=>{let S=u();if(!S){s("Select something on the page first.");return}s(await ce(S)?`Copied ${c}.`:"Copy failed.")};return e("div",{class:"wa-panel-block",children:[e(W,{icon:"copy",name:"Clean copy",desc:"Copy the selection without the junk."}),e("div",{class:"wa-pt-grid",style:"margin-top:11px",children:[e("button",{class:"wa-btn wa-btn-ghost",onClick:()=>n("text",()=>re()),children:"Text"}),e("button",{class:"wa-btn wa-btn-ghost",onClick:()=>n("Markdown",()=>ie()),children:"Markdown"}),e("button",{class:"wa-btn wa-btn-ghost",onClick:()=>n("CSV",()=>se()),children:"Table CSV"}),e("button",{class:"wa-btn wa-btn-ghost",onClick:()=>n("clean URL",()=>ne(location.href)),children:"Clean URL"}),e("button",{class:"wa-btn wa-btn-ghost",style:"grid-column:1/-1",onClick:()=>n("quote",()=>le()),children:"Title + URL + quote"})]}),e("p",{class:"wa-note",role:"status","aria-live":"polite",children:o})]})}var K=typeof window!="undefined"?window.SpeechRecognition||window.webkitSpeechRecognition:null;function ve({engine:t,controller:o}){let l=A(null),s=t.provider.isConfigured(),[n,c]=w(t.guide.getState());T(()=>t.guide.subscribe(c),[t]);let[u,S]=w(""),[k,R]=w(!1),[x,J]=w(""),[I,P]=w(!1),X=A(null),N=A(""),C=A(null);T(()=>{if(!k||n.status!=="active")return;let i=n.steps[n.stepIndex];if(!i||!i.say)return;let f=`${n.messages.length}:${n.stepIndex}`;if(f!==N.current){N.current=f;try{t.tts.speak(i.say)}catch{}}},[n.steps,n.stepIndex,n.messages.length,n.status,k,t]),T(()=>{let i=C.current;i&&(i.scrollTop=i.scrollHeight)},[n.messages,n.status]);let M=()=>{try{t.tts.stop()}catch{}},H=i=>{let f=(i!=null?i:u).trim();!f||n.status==="thinking"||(S(""),M(),t.guide.ask(f))},E=()=>{M(),t.guide.clear()},D=()=>{var f;if(!K)return;if(I){try{(f=X.current)==null||f.stop()}catch{}return}let i=new K;X.current=i,i.lang=typeof navigator!="undefined"&&navigator.language||"en-US",i.interimResults=!1,i.maxAlternatives=1,i.onresult=p=>{var g,y,F;let d=((F=(y=(g=p.results)==null?void 0:g[0])==null?void 0:y[0])==null?void 0:F.transcript)||"";d.trim()&&H(d)},i.onend=()=>P(!1),i.onerror=()=>P(!1);try{i.start(),P(!0)}catch{P(!1)}};if(!s)return e("div",{class:"wa-panel-block",children:[e(W,{icon:"guide",name:a("guide.title"),desc:a("guide.descKey")}),e("div",{class:"wa-ai-key",style:"margin-top:11px",children:[e("input",{class:"wa-input",type:"password",placeholder:a("ai.keyPlaceholder"),value:x,autocomplete:"off","aria-label":a("ai.keyPlaceholder"),onInput:i=>J(i.target.value)}),e("button",{class:"wa-btn wa-btn-primary",disabled:!x.trim(),onClick:()=>t.setApiKey(x.trim()),children:a("ai.save")})]}),e("p",{class:"wa-note",children:a("ai.keyNote")})]});let v=n.status==="thinking";return e("div",{class:"wa-panel-block",ref:l,tabIndex:-1,children:[e(W,{icon:"guide",name:a("guide.title"),desc:a("guide.desc"),on:n.status==="active"||v}),e("div",{class:"wa-ai-key",style:"margin-top:11px",children:[e("input",{class:"wa-input",type:"text",placeholder:a("guide.placeholder"),value:u,"aria-label":a("guide.placeholder"),onInput:i=>S(i.target.value),onKeyDown:i=>{i.key==="Enter"&&!v&&H()}}),e("button",{class:`wa-iconbtn wa-guide-mic${I?" wa-on":""}`,"aria-label":K?a("guide.mic"):a("guide.micUnsupported"),"aria-pressed":I?"true":"false","aria-disabled":K?void 0:"true",disabled:!K,title:K?a("guide.mic"):a("guide.micUnsupported"),onClick:D,children:e(m,{name:"mic",size:16})}),e("button",{class:"wa-btn wa-btn-primary",...z(v,()=>H()),children:v?"\u2026":a("guide.ask")})]}),e("label",{class:"wa-pt-check",children:[e("input",{type:"checkbox",checked:k,onChange:i=>{let f=i.target.checked;R(f),f||M()}}),a("guide.readAloud")]}),n.error&&e("div",{class:"wa-ai-out",role:"alert",style:"color:var(--danger)",children:n.error}),n.messages.length>0||v?e("div",{class:"wa-guide-chat",ref:C,"aria-live":"polite","aria-busy":v?"true":"false",children:[n.messages.slice(-6).map((i,f)=>e("div",{class:`wa-guide-msg wa-guide-${i.role}`,children:i.text},n.messages.length-Math.min(6,n.messages.length)+f)),v&&e("div",{class:"wa-guide-msg wa-guide-assistant wa-guide-typing","aria-label":a("guide.thinking"),children:[e("span",{class:"wa-guide-dot"}),e("span",{class:"wa-guide-dot"}),e("span",{class:"wa-guide-dot"})]})]}):!n.error&&e("p",{class:"wa-guide-empty",children:a("guide.empty")}),n.pointing&&n.steps.length>1&&e("div",{class:"wa-guide-stepnav",children:[e("button",{class:"wa-btn wa-btn-ghost","aria-label":a("guide.back"),...z(n.stepIndex===0,()=>t.guide.prev()),children:a("guide.back")}),e("span",{class:"wa-guide-stepc","aria-live":"polite",children:a("guide.step",{n:n.stepIndex+1,m:n.steps.length})}),e("button",{class:"wa-btn wa-btn-primary","aria-label":a("guide.next"),...z(n.stepIndex>=n.steps.length-1,()=>t.guide.next()),children:a("guide.next")})]}),n.pointing&&e("button",{class:"wa-btn wa-btn-primary wa-btn-block",style:"margin-top:8px",onClick:()=>{o==null||o.close(),requestAnimationFrame(()=>t.guide.focusTarget())},children:a("guide.takeMeThere")}),(n.messages.length>0||n.pointing)&&e("button",{class:"wa-note wa-pt-clear",onClick:()=>{var i;(i=l.current)==null||i.focus(),E()},children:a("guide.clear")}),e("p",{class:"wa-note",children:a("guide.hint")})]})}function he(){return null}function ye(){return null}var Te=`@media (prefers-reduced-motion: reduce) {
.wa-panel, .wa-panel *, .wa-panel *::before, .wa-panel *::after {
animation: none !important;
transition: none !important;
}
}
.wa-panel {
position: fixed;
z-index: 2147483641;
width: 392px;
max-width: calc(100vw - 28px);
max-height: min(720px, calc(100vh - 100px));
max-height: min(720px, calc(100dvh - 100px));
display: flex;
flex-direction: column;
background: var(--surface);
color: var(--text);
border: 1px solid var(--hairline);
border-radius: var(--radius);
box-shadow: var(--shadow);
overflow: hidden;
animation: wa-pop .2s cubic-bezier(.22,1,.36,1);
}
.wa-panel.wa-pos-bottom-right { right: 20px; bottom: 86px; }
.wa-panel.wa-pos-bottom-left  { left: 20px;  bottom: 86px; }
.wa-panel.wa-pos-top-right    { right: 20px; top: 86px; }
.wa-panel.wa-pos-top-left     { left: 20px;  top: 86px; }
@keyframes wa-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
.wa-head {
display: flex; align-items: center; gap: 10px;
padding: 14px 14px 12px;
border-bottom: 1px solid var(--hairline);
}
.wa-head-mark {
width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center;
color: var(--on-accent); background: var(--accent); flex: none;
}
.wa-head-titles { flex: 1; min-width: 0; }
.wa-head-title { font-weight: 650; font-size: 14px; color: var(--ink); letter-spacing: -.01em; }
.wa-head-sub { font-size: 11.5px; color: var(--mute); }
.wa-iconbtn {
width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center;
color: var(--mute); flex: none; transition: background .15s, color .15s;
}
.wa-iconbtn:hover { background: var(--surface-3); color: var(--ink); }
.wa-iconbtn:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.wa-search {
display: flex; align-items: center; gap: 8px;
margin: 12px 14px 4px; padding: 0 10px;
height: 38px; border-radius: 9px;
background: var(--surface-2); border: 1px solid var(--hairline);
color: var(--mute);
}
.wa-search:focus-within { border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-soft); }
.wa-search input {
flex: 1; min-width: 0; border: 0; background: none; outline: none;
font: inherit; color: var(--text); height: 100%;
}
.wa-search input::placeholder { color: var(--mute); }
.wa-eyebrow {
font-size: 10.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase;
color: var(--mute); margin: 14px 2px 8px;
}
.wa-scope { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--hairline); }
.wa-scope .wa-eyebrow { margin-top: 0; }
.wa-scope-state { margin: 0 2px 10px; font-size: 12.5px; color: var(--text); }
.wa-scope-row { display: flex; flex-wrap: wrap; gap: 8px; }
.wa-scope-hint { margin: 10px 2px 0; font-size: 11.5px; line-height: 1.45; color: var(--mute); }
.wa-intro {
margin: 0 0 12px; padding: 12px; border-radius: 10px;
background: var(--surface-2); border: 1px solid var(--hairline);
}
.wa-intro p { margin: 0 0 9px; font-size: 12.5px; line-height: 1.5; color: var(--text); }
.wa-profiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wa-profile {
display: flex; align-items: center; gap: 9px; text-align: left;
padding: 10px; border-radius: 10px;
background: var(--surface-2); border: 1px solid var(--hairline);
transition: border-color .15s, background .15s, transform .12s;
}
.wa-profile:hover { border-color: var(--hairline-strong); transform: translateY(-1px); }
.wa-profile:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.wa-profile[aria-pressed='true'] { border-color: var(--accent-text); background: var(--accent-soft); }
.wa-profile-ic { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; flex: none; color: var(--accent-text); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
.wa-profile[aria-pressed='true'] .wa-profile-ic { color: var(--on-accent); background: var(--accent); }
.wa-profile-tx { min-width: 0; }
.wa-profile-name { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.wa-profile-desc { font-size: 11px; color: var(--mute); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
.wa-cards { display: flex; flex-direction: column; gap: 8px; }
.wa-card {
border: 1px solid var(--hairline); border-radius: 11px; background: var(--surface);
transition: border-color .15s, box-shadow .15s;
}
.wa-card[data-on='true'] { border-color: color-mix(in srgb, var(--accent) 40%, var(--hairline)); box-shadow: inset 0 0 0 1px var(--accent-soft); }
.wa-card-main { display: flex; align-items: center; gap: 11px; padding: 11px 12px; }
.wa-card-ic { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex: none; color: var(--mute); background: var(--surface-2); }
.wa-card[data-on='true'] .wa-card-ic { color: var(--on-accent); background: var(--accent); }
.wa-card-tx { flex: 1; min-width: 0; }
.wa-card-name { font-size: 13px; font-weight: 600; color: var(--ink); }
.wa-card-desc { font-size: 11.5px; color: var(--mute); line-height: 1.35; }
.wa-card-gear { width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; color: var(--mute); flex: none; }
.wa-card-gear:hover { background: var(--surface-3); color: var(--ink); }
.wa-card-gear[aria-expanded='true'] { color: var(--accent-text); }
.wa-card-gear:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.wa-card-controls { padding: 2px 12px 13px; display: flex; flex-direction: column; gap: 13px; border-top: 1px dashed var(--hairline); margin-top: 1px; }
.wa-switch { position: relative; width: 40px; height: 24px; border-radius: 999px; background: var(--surface-3); border: 1px solid rgba(15, 23, 42, 0.45); flex: none; transition: background .18s; }
.wa-root[data-theme='dark'] .wa-switch, .wa-root[data-theme='glass'] .wa-switch { border-color: var(--hairline-strong); }
.wa-switch[aria-checked='true'] { background: var(--accent); border-color: transparent; }
.wa-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 999px; background: #fff; box-shadow: 0 1px 3px rgba(10,27,46,.3); transition: transform .18s cubic-bezier(.22,1,.36,1); }
.wa-switch[aria-checked='true']::after { transform: translateX(16px); }
.wa-switch:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
.wa-ctl-row { display: flex; flex-direction: column; gap: 7px; }
.wa-ctl-head { display: flex; justify-content: space-between; align-items: baseline; }
.wa-ctl-label { font-size: 11.5px; font-weight: 600; color: var(--text); }
.wa-ctl-val { font-size: 11.5px; font-weight: 600; color: var(--accent-text); font-variant-numeric: tabular-nums; }
.wa-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 999px; background: var(--surface-3); }
.wa-slider:focus { outline: none; }
.wa-slider:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 4px; border-radius: 999px; }
.wa-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 999px; background: var(--accent); border: 3px solid var(--surface); box-shadow: 0 1px 4px rgba(10,27,46,.3); cursor: grab; }
.wa-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 999px; background: var(--accent); border: 3px solid var(--surface); cursor: grab; }
.wa-slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 1px 4px rgba(10,27,46,.3), 0 0 0 3px var(--accent-soft); }
.wa-slider:focus-visible::-moz-range-thumb { box-shadow: 0 1px 4px rgba(10,27,46,.3), 0 0 0 3px var(--accent-soft); }
.wa-seg { display: flex; gap: 4px; padding: 3px; border-radius: 9px; background: var(--surface-2); border: 1px solid var(--hairline); }
.wa-seg button { flex: 1 0 auto; padding: 6px 4px; border-radius: 6px; font-size: 11.5px; font-weight: 600; color: var(--mute); transition: background .12s, color .12s; }
.wa-seg button[aria-pressed='true'] { background: var(--surface); color: var(--ink); border: 1px solid var(--accent-text); box-shadow: 0 1px 2px rgba(10,27,46,.12); }
.wa-seg button { border: 1px solid transparent; }
.wa-root[data-theme='dark'] .wa-seg button[aria-pressed='true'] { background: var(--surface-3); }
.wa-seg button:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.wa-color-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.wa-color-swatch { display: flex; align-items: center; gap: 8px; }
.wa-color-input { width: 30px; height: 26px; border-radius: 7px; border: 1px solid var(--hairline-strong); padding: 0; background: none; cursor: pointer; overflow: hidden; }
.wa-color-input::-webkit-color-swatch { border: none; border-radius: 6px; }
.wa-color-input:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
.wa-color-clear { font-size: 11px; font-weight: 600; color: var(--mute); padding: 3px 6px; border-radius: 6px; }
.wa-color-clear:hover { background: var(--surface-3); color: var(--ink); }
.wa-color-clear:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.wa-panel-block { border: 1px solid var(--hairline); border-radius: 11px; background: var(--surface-2); padding: 12px; }
.wa-tts-controls { display: flex; gap: 8px; margin-top: 10px; }
.wa-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 9px; font-size: 12.5px; font-weight: 600; transition: background .15s, border-color .15s, transform .1s; }
.wa-btn:active { transform: scale(.98); }
.wa-btn:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
.wa-btn-primary { background: var(--accent); color: var(--on-accent); flex: 1; }
.wa-btn-primary:hover { background: color-mix(in srgb, var(--accent) 88%, black); }
.wa-btn-ghost { background: var(--surface); color: var(--text); border: 1px solid var(--hairline-strong); }
.wa-btn-ghost:hover { border-color: var(--accent-text); color: var(--ink); }
.wa-btn-block { width: 100%; }
.wa-btn[disabled], .wa-btn[aria-disabled='true'] { opacity: .5; cursor: not-allowed; }
.wa-ai-key { display: flex; gap: 8px; margin-top: 10px; }
.wa-input { flex: 1; min-width: 0; height: 36px; padding: 0 11px; border-radius: 9px; background: var(--surface); border: 1px solid var(--hairline-strong); color: var(--text); font: inherit; outline: none; }
.wa-input:focus { border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-soft); }
.wa-ai-out { margin-top: 10px; padding: 10px 11px; border-radius: 9px; background: var(--surface); border: 1px solid var(--hairline); font-size: 12px; line-height: 1.5; color: var(--text); white-space: pre-wrap; max-height: 180px; overflow: auto; }
.wa-note { font-size: 11px; color: var(--mute); line-height: 1.45; margin-top: 8px; }
.wa-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 14px; border-top: 1px solid var(--hairline); background: var(--surface-2); }
.wa-foot-links { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--mute); }
.wa-foot-links a { color: var(--mute); text-decoration: none; }
.wa-foot-links a:hover { color: var(--accent-text); text-decoration: underline; }
.wa-reset { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text); padding: 7px 11px; border-radius: 8px; border: 1px solid var(--hairline-strong); }
.wa-reset:hover { border-color: var(--danger); color: var(--danger); }
.wa-undo { border-color: var(--accent-text); color: var(--accent-text); background: var(--accent-soft); }
.wa-undo:hover { border-color: var(--accent-text); color: var(--ink); }
.wa-reset:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.wa-empty { text-align: center; color: var(--mute); font-size: 12.5px; padding: 28px 12px; }
.wa-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.wa-tabwrap { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.wa-rail { display: flex; flex-direction: column; gap: 4px; padding: 10px 8px; border-right: 1px solid var(--hairline); flex: none; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.wa-railtab { width: 38px; height: 38px; flex: none; border-radius: 9px; display: grid; place-items: center; color: var(--mute); transition: background .14s, color .14s; }
.wa-railtab:hover { background: var(--surface-3); color: var(--ink); }
.wa-railtab[aria-selected='true'] { background: var(--accent); color: var(--on-accent); }
.wa-railtab:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
.wa-tabpanel { flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden; padding: 8px 14px 16px; overscroll-behavior: contain; }
.wa-tabpanel, .wa-ai-out {
scrollbar-width: thin;
scrollbar-color: color-mix(in srgb, var(--mute) 42%, transparent) transparent;
}
.wa-tabpanel::-webkit-scrollbar, .wa-ai-out::-webkit-scrollbar { width: 12px; height: 12px; }
.wa-tabpanel::-webkit-scrollbar-track, .wa-ai-out::-webkit-scrollbar-track { background: transparent; }
.wa-tabpanel::-webkit-scrollbar-thumb, .wa-ai-out::-webkit-scrollbar-thumb {
background-color: color-mix(in srgb, var(--mute) 38%, transparent);
border-radius: 999px;
border: 3.5px solid transparent;
background-clip: padding-box;
min-height: 36px;
}
.wa-tabpanel:hover::-webkit-scrollbar-thumb, .wa-ai-out:hover::-webkit-scrollbar-thumb {
background-color: color-mix(in srgb, var(--mute) 60%, transparent);
}
.wa-tabpanel::-webkit-scrollbar-thumb:hover, .wa-ai-out::-webkit-scrollbar-thumb:hover {
background-color: color-mix(in srgb, var(--mute) 85%, transparent);
}
.wa-tabpanel::-webkit-scrollbar-corner, .wa-ai-out::-webkit-scrollbar-corner { background: transparent; }
.wa-pt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wa-pt-grid .wa-btn { height: 34px; }
.wa-pt-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.wa-pt-item { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border: 1px solid var(--hairline); border-radius: 9px; background: var(--surface-2); }
.wa-pt-item .wa-switch { transform: scale(.82); flex: none; }
.wa-pt-item-tx { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wa-pt-item-name { font-size: 12px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-pt-item-sub { font-size: 10.5px; color: var(--mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-pt-stale { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--warn); background: rgba(180,83,9,.14); padding: 1px 5px; border-radius: 4px; }
.wa-pt-check { display: flex; align-items: center; gap: 8px; margin-top: 11px; font-size: 11.5px; color: var(--mute); cursor: pointer; }
.wa-pt-check input { accent-color: var(--accent); }
.wa-pt-clear { background: none; border: 0; text-align: left; cursor: pointer; padding: 4px 2px; border-radius: 6px; color: var(--mute); }
.wa-pt-clear:hover { color: var(--danger); }
.wa-pt-clear:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.wa-trap { border: 1px solid var(--hairline); border-left: 3px solid var(--warn-edge); border-radius: 9px; background: var(--surface-2); padding: 9px 11px; margin-top: 8px; }
.wa-trap-name { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 650; color: var(--ink); }
.wa-trap-detail { font-size: 11.5px; color: var(--mute); line-height: 1.45; margin-top: 3px; }
.wa-guide-mic { flex: none; width: 36px; height: 36px; border: 1px solid var(--hairline-strong); border-radius: 9px; color: var(--mute); }
.wa-guide-mic:not(:disabled):hover { color: var(--ink); border-color: var(--accent-text); }
.wa-guide-mic.wa-on { background: var(--accent); color: var(--on-accent); border-color: transparent; }
.wa-guide-mic:disabled { opacity: .45; cursor: not-allowed; }
.wa-guide-empty { font-size: 12px; color: var(--mute); line-height: 1.5; margin-top: 12px; padding: 10px 11px; border: 1px dashed var(--hairline-strong); border-radius: 10px; background: var(--surface); }
.wa-guide-chat { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; max-height: min(260px, 38vh); overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--mute) 42%, transparent) transparent; }
.wa-guide-chat::-webkit-scrollbar { width: 10px; }
.wa-guide-chat::-webkit-scrollbar-track { background: transparent; }
.wa-guide-chat::-webkit-scrollbar-thumb { background-color: color-mix(in srgb, var(--mute) 40%, transparent); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
.wa-guide-msg { font-size: 12.5px; line-height: 1.5; padding: 8px 11px; border-radius: 10px; max-width: 92%; white-space: pre-wrap; }
.wa-guide-user { align-self: flex-end; background: var(--accent); color: var(--on-accent); border-bottom-right-radius: 3px; }
.wa-guide-assistant { align-self: flex-start; background: var(--surface-2); color: var(--text); border: 1px solid var(--hairline); border-bottom-left-radius: 3px; }
.wa-guide-typing { display: inline-flex; align-items: center; gap: 5px; }
.wa-guide-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--mute); animation: wa-guide-blink 1.2s infinite ease-in-out; }
.wa-guide-dot:nth-child(2) { animation-delay: .18s; }
.wa-guide-dot:nth-child(3) { animation-delay: .36s; }
@keyframes wa-guide-blink { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
.wa-guide-stepnav { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.wa-guide-stepnav .wa-btn { flex: none; height: 32px; padding: 0 12px; }
.wa-guide-stepc { flex: 1; text-align: center; font-size: 11.5px; font-weight: 600; color: var(--mute); font-variant-numeric: tabular-nums; }
.wa-root[data-theme='glass'] .wa-panel {
-webkit-backdrop-filter: blur(22px) saturate(1.5);
backdrop-filter: blur(22px) saturate(1.5);
}
@media (prefers-reduced-transparency: reduce) {
.wa-root[data-theme='glass'] .wa-panel { -webkit-backdrop-filter: none; backdrop-filter: none; }
}
@media (max-width: 460px) {
.wa-panel {
width: calc(100vw - 20px);
right: 10px !important;
left: 10px !important;
max-height: calc(100vh - 92px);
max-height: calc(100dvh - 92px);
}
.wa-panel.wa-pos-bottom-right, .wa-panel.wa-pos-bottom-left { bottom: 80px !important; top: auto !important; }
.wa-panel.wa-pos-top-right, .wa-panel.wa-pos-top-left { top: 80px !important; bottom: auto !important; }
.wa-profiles { grid-template-columns: 1fr; }
}
@media (max-height: 560px) {
.wa-panel,
.wa-panel.wa-pos-bottom-right, .wa-panel.wa-pos-bottom-left,
.wa-panel.wa-pos-top-right, .wa-panel.wa-pos-top-left {
top: 8px !important;
right: 8px !important;
bottom: 8px !important;
left: 8px !important;
width: auto !important;
max-width: none !important;
height: auto !important;
max-height: none !important;
}
.wa-head { padding: 6px 10px; gap: 8px; }
.wa-head-sub { display: none; }
.wa-head-mark { width: 24px; height: 24px; border-radius: 7px; }
.wa-iconbtn { width: 28px; height: 28px; }
.wa-search { margin: 6px 10px 2px; height: 32px; }
.wa-rail { padding: 6px 5px; gap: 2px; }
.wa-tabpanel { padding: 4px 10px 8px; }
.wa-eyebrow { margin: 2px 2px 4px; }
.wa-intro { display: none; }
.wa-profile { padding: 6px 8px; gap: 8px; }
.wa-profile-ic { width: 24px; height: 24px; border-radius: 7px; }
.wa-profile-desc { display: none; }
.wa-card-main { padding: 8px 10px; gap: 9px; }
.wa-card-ic { width: 28px; height: 28px; }
.wa-foot { padding: 5px 10px; }
.wa-reset { padding: 5px 9px; }
}`;var ze=[{id:"profiles",label:a("tab.profiles"),icon:"grid"},{id:"guide",label:a("tab.guide"),icon:"guide"},{id:"reading",label:B.reading,icon:"reader"},{id:"color",label:B.color,icon:"contrast"},{id:"motion",label:B.motion,icon:"stopMotion"},{id:"aids",label:B.aids,icon:"lowVision"},{id:"power",label:B.power,icon:"bolt"},{id:"ai",label:a("tab.ai"),icon:"key"}];function Le({engine:t,feature:o,announce:l}){var R;let s=q(t).settings[o.id],n=!!((R=o.meta.controls)!=null&&R.length),[c,u]=w(!1),S=x=>{t.toggleFeature(o.id,x),l(x?a("announce.on",{label:o.meta.label}):a("announce.off",{label:o.meta.label})),x&&n&&u(!0)},k=(x,J)=>t.setFeature(o.id,{[x]:J,active:!0});return e("div",{class:"wa-card","data-on":s.active?"true":"false",children:[e("div",{class:"wa-card-main",children:[e("span",{class:"wa-card-ic",children:e(m,{name:o.meta.icon,size:18})}),e("div",{class:"wa-card-tx",children:[e("div",{class:"wa-card-name",children:o.meta.label}),e("div",{class:"wa-card-desc",children:o.meta.description})]}),n&&e("button",{class:"wa-card-gear","aria-expanded":c?"true":"false","aria-label":a("panel.settingsFor",{label:o.meta.label}),onClick:()=>u(x=>!x),children:e(m,{name:"settings",size:16})}),e(be,{checked:s.active,onChange:S,label:o.meta.label})]}),n&&c&&e("div",{class:"wa-card-controls",children:o.meta.controls.map(x=>e(we,{control:x,value:s[x.key],onChange:k,scope:o.id},x.key))})]})}function Ae({engine:t,announce:o}){let l=q(t).activeProfile;return e("div",{class:"wa-profiles",children:pe.map(s=>e("button",{class:"wa-profile","aria-pressed":l===s.id?"true":"false",onClick:()=>{t.applyProfile(s.id),o(l===s.id?a("announce.profileCleared"):a("announce.profileApplied",{label:s.label}))},children:[e("span",{class:"wa-profile-ic",children:e(m,{name:s.icon,size:16})}),e("span",{class:"wa-profile-tx",children:[e("span",{class:"wa-profile-name",children:s.label}),e("span",{class:"wa-profile-desc",children:s.description})]})]},s.id))})}function Ie({onDismiss:t}){return e("div",{class:"wa-intro",role:"group","aria-label":a("intro.label"),children:[e("p",{children:a("intro.lead")}),e("p",{children:a("intro.how")}),e("button",{class:"wa-btn wa-btn-ghost",onClick:t,children:a("intro.dismiss")})]})}var Pe=[{value:"bottom-right",key:"pos.bottomRight"},{value:"bottom-left",key:"pos.bottomLeft"},{value:"top-right",key:"pos.topRight"},{value:"top-left",key:"pos.topLeft"}];function Re({engine:t,announce:o}){let l=q(t).ui,s=!!l.launcherOffset;return e("div",{class:"wa-scope wa-position",children:[e("div",{class:"wa-eyebrow",role:"heading","aria-level":2,children:a("panel.positionEyebrow")}),e("div",{class:"wa-seg",role:"group","aria-label":a("panel.positionEyebrow"),children:Pe.map(n=>e("button",{type:"button","aria-pressed":!s&&l.position===n.value?"true":"false",onClick:()=>{t.setUiPref("launcherOffset",null),t.setUiPref("position",n.value),o(a("announce.moved",{where:a(n.key)}))},children:a(n.key)},n.value))}),s&&e("p",{class:"wa-scope-hint",children:a("panel.positionDragged")})]})}function Q({engine:t,items:o,announce:l}){return e("div",{class:"wa-cards",children:o.map(s=>e(Le,{engine:t,feature:s,announce:l},s.id))})}var Y=["auto","light","dark","glass"];function Me(t){let o=t.getState().ui.theme,l=Y[(Y.indexOf(o)+1)%Y.length];t.setUiPref("theme",l)}function He(t){return t==="dark"?"moon":t==="glass"?"glass":t==="light"?"sun":"contrast"}function kt({engine:t,config:o,controller:l,position:s,style:n}){var j,Z,ee;let c=A(null),u=A(null),S=A(null),[k,R]=w(""),[x,J]=w(""),[I,P]=w(!1),[X,N]=w(!1),C=A(null);T(()=>{var b;if(!I)return;(b=C.current)==null||b.focus();let r=setTimeout(()=>P(!1),1e4);return()=>clearTimeout(r)},[I]);let M=A(!1),H=q(t),E=r=>{M.current=!M.current,J(M.current?r:`${r}\u200B`)},D=G(()=>{let r=L=>{let h=L.meta.surfaces;return!h||h==="both"||h===o.surface},b=de.filter(r);return o.tools&&o.tools.length&&(b=b.filter(L=>o.tools.includes(L.id))),b},[o.tools,o.surface]),v=G(()=>ze.filter(r=>r.id==="profiles"?o.showProfiles:r.id==="guide"||r.id==="ai"?o.showAI:r.id==="power"?!0:D.some(b=>b.meta.category===r.id)),[o.showProfiles,o.showAI,D]),[i,f]=w((Z=(j=v[0])==null?void 0:j.id)!=null?Z:"reading");T(()=>{var r,b;v.some(L=>L.id===i)||f((b=(r=v[0])==null?void 0:r.id)!=null?b:"reading")},[v,i]),T(()=>{var L;(L=u.current)==null||L.focus();let r=c.current;if(!r)return;let b=h=>{if(h.key==="Escape"){if(h.stopPropagation(),t.guide.getState().pointing){t.guide.dismissPoint();return}l.close();return}if(h.key!=="Tab")return;let U=Array.from(r.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])')).filter(oe=>oe.offsetParent!==null||oe===r.ownerDocument.activeElement);if(!U.length)return;let O=U[0],te=U[U.length-1],ae=r.getRootNode().activeElement;h.shiftKey&&ae===O?(h.preventDefault(),te.focus()):!h.shiftKey&&ae===te&&(h.preventDefault(),O.focus())};return r.addEventListener("keydown",b),()=>r.removeEventListener("keydown",b)},[l,t]);let p=r=>{let b=v.map(U=>U.id),L=b.indexOf(i),h=L;if(r.key==="ArrowDown"||r.key==="ArrowRight")h=(L+1)%b.length;else if(r.key==="ArrowUp"||r.key==="ArrowLeft")h=(L-1+b.length)%b.length;else if(r.key==="Home")h=0;else if(r.key==="End")h=b.length-1;else return;r.preventDefault(),f(b[h]),requestAnimationFrame(()=>{var U,O;return(O=(U=S.current)==null?void 0:U.querySelector(`[data-tab="${b[h]}"]`))==null?void 0:O.focus()})},d=k.trim().toLowerCase(),g=G(()=>d?D.filter(r=>`${r.meta.label} ${r.meta.description} ${(r.meta.keywords||[]).join(" ")}`.toLowerCase().includes(d)):[],[d,D]),y=r=>D.filter(b=>b.meta.category===r);T(()=>{if(!d)return;let r=setTimeout(()=>{E(g.length?a("announce.results",{n:g.length,s:g.length===1?"":"s"}):a("panel.noResults",{q:k}))},400);return()=>clearTimeout(r)},[d,g.length]);function F(){if(i==="profiles")return e($,{children:[!X&&t.activeCount()===0&&!H.activeProfile&&e(Ie,{onDismiss:()=>N(!0)}),e(Ae,{engine:t,announce:E}),!o.hideLauncher&&e(Re,{engine:t,announce:E}),o.surface==="extension"&&e(he,{engine:t,announce:E})]});if(i==="guide")return e(ve,{engine:t,controller:l});if(i==="ai")return e(xe,{engine:t,announce:E});if(i==="power")return e($,{children:[e(Q,{engine:t,items:y("power"),announce:E}),e("div",{class:"wa-eyebrow",role:"heading","aria-level":2,children:a("panel.interactiveTools")}),e("div",{class:"wa-cards",children:[e(fe,{engine:t}),o.surface==="extension"&&e(ye,{engine:t,controller:l})]})]});let r=y(i);return e($,{children:[e(Q,{engine:t,items:r,announce:E}),i==="aids"&&e("div",{style:"margin-top:8px",children:e(ge,{engine:t})})]})}let V=((ee=v.find(r=>r.id===i))==null?void 0:ee.label)||"";return e("div",{ref:c,class:`wa-panel ${s}`,style:n,role:"dialog","aria-modal":"true","aria-label":a("panel.menuLabel",{brand:o.brandName}),children:[e("div",{class:"wa-head",children:[e("span",{class:"wa-head-mark",children:o.attribution&&o.brandName==="WebAble"?e(ue,{size:22}):e(m,{name:"access",size:18})}),e("div",{class:"wa-head-titles",children:[e("div",{class:"wa-head-title",role:"heading","aria-level":1,children:o.brandName}),e("div",{class:"wa-head-sub",children:a("panel.subtitle")})]}),e("button",{class:"wa-iconbtn","aria-label":a("panel.themeToggle",{theme:H.ui.theme}),onClick:()=>Me(t),children:e(m,{name:He(H.ui.theme),size:17})}),e("button",{class:"wa-iconbtn","aria-label":a("panel.close"),onClick:()=>l.close(),children:e(m,{name:"close",size:17})})]}),e("div",{class:"wa-search",children:[e(m,{name:"search",size:16}),e("input",{ref:u,type:"text",placeholder:a("panel.searchPlaceholder"),value:k,"aria-label":a("panel.searchLabel"),onInput:r=>R(r.target.value)})]}),e("div",{class:"wa-tabwrap",children:[!d&&e("div",{class:"wa-rail",role:"tablist","aria-orientation":"vertical","aria-label":a("panel.categories"),ref:S,onKeyDown:p,children:v.map(r=>e("button",{role:"tab","data-tab":r.id,id:`wa-tab-${r.id}`,"aria-selected":i===r.id?"true":"false","aria-controls":"wa-tabpanel","aria-label":r.label,title:r.label,tabIndex:i===r.id?0:-1,class:"wa-railtab",onClick:()=>f(r.id),children:e(m,{name:r.icon,size:19})},r.id))}),e("div",{id:"wa-tabpanel",class:"wa-tabpanel",role:d?void 0:"tabpanel","aria-labelledby":d?void 0:`wa-tab-${i}`,tabIndex:0,children:d?g.length?e($,{children:[e("div",{class:"wa-eyebrow",role:"heading","aria-level":2,style:"margin-top:2px",children:a("panel.results")}),e(Q,{engine:t,items:g,announce:E})]}):e("div",{class:"wa-empty",role:"status",children:a("panel.noResults",{q:k})}):e($,{children:[e("div",{class:"wa-eyebrow",role:"heading","aria-level":2,style:"margin-top:2px",children:V}),F()]})})]}),e("div",{class:"wa-foot",children:[I?e("button",{class:"wa-reset wa-undo",ref:C,onClick:()=>{t.undoReset()&&E(a("announce.resetUndone")),P(!1)},children:[e(m,{name:"reset",size:15})," ",a("panel.undoReset")]}):e("button",{class:"wa-reset",onClick:()=>{t.resetAll();let r=t.canUndoReset();P(r),E(r?a("announce.resetWithUndo"):a("announce.reset"))},children:[e(m,{name:"reset",size:15})," ",a("panel.resetAll")]}),e("div",{class:"wa-foot-links",children:[o.accessibilityUrl&&e($,{children:[e("a",{href:o.accessibilityUrl,target:"_blank",rel:"noopener",children:a("panel.statement")}),e("span",{"aria-hidden":"true",children:"\xB7"})]}),o.attribution?e("span",{children:"WebAble"}):e("span",{children:"Accessibility"})]})]}),e("div",{class:"wa-live",role:"status","aria-live":"polite",children:x})]})}export{Te as PANEL_CSS,kt as Panel};
