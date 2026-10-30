import{j,k as Z,l as ee,n as X,o as H,p as W,q as te,s as U,t as ne,u as d,v as z,w as I}from"./chunk.js";var D=`:host {
all: initial;
--wa-accent: #1e40af;
--wa-accent-2: #38bdf8;
--wa-accent-text: #1e40af;
}
.wa-root {
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
font-size: 14px;
line-height: 1.5;
font-weight: 400;
letter-spacing: normal;
text-align: left;
font-style: normal;
text-transform: none;
-webkit-font-smoothing: antialiased;
--ink: #0a1b2e;
--text: #283549;
--mute: #5b6b80;
--surface: #ffffff;
--surface-2: #f6f7f9;
--surface-3: #eef1f5;
--hairline: rgba(15, 23, 42, 0.10);
--hairline-strong: rgba(15, 23, 42, 0.16);
--accent: var(--wa-accent);
--accent-soft: color-mix(in srgb, var(--accent) 12%, transparent);
--accent-ring: color-mix(in srgb, var(--wa-accent-2) 55%, transparent);
--on-accent: #ffffff;
--accent-text: var(--wa-accent-text, var(--accent));
--danger: #dc2626;
--warn: #92400e;
--warn-edge: #b45309;
--shadow: 0 24px 60px -24px rgba(10, 27, 46, 0.40), 0 2px 8px -3px rgba(10, 27, 46, 0.16);
--radius: 12px;
color: var(--text);
}
.wa-root[data-theme='dark'] {
--ink: #f3f7fc;
--text: #d9e2ee;
--mute: #94a3b8;
--surface: #0f1722;
--surface-2: #16202e;
--surface-3: #1f2a3a;
--hairline: rgba(255, 255, 255, 0.10);
--hairline-strong: rgba(255, 255, 255, 0.18);
--accent-soft: color-mix(in srgb, var(--accent) 26%, transparent);
--accent-text: color-mix(in srgb, var(--accent) 42%, #fff);
--danger: #f87171;
--warn: #fbbf24;
--warn-edge: #f59e0b;
--shadow: 0 24px 70px -20px rgba(0, 0, 0, 0.6);
}
.wa-root[data-theme='glass'] {
--ink: #f4f8fd;
--text: #e4ecf6;
--mute: #aab8cc;
--surface: rgba(16, 23, 34, 0.86);
--surface-2: rgba(255, 255, 255, 0.07);
--surface-3: rgba(255, 255, 255, 0.13);
--hairline: rgba(255, 255, 255, 0.14);
--hairline-strong: rgba(255, 255, 255, 0.24);
--accent-soft: color-mix(in srgb, var(--accent) 30%, transparent);
--accent-text: color-mix(in srgb, var(--accent) 34%, #fff);
--danger: #fca5a5;
--warn: #fcd34d;
--warn-edge: #f59e0b;
--shadow: 0 30px 80px -24px rgba(0, 0, 0, 0.65);
--on-accent: #ffffff;
}
@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
.wa-root[data-theme='glass'] { --surface: rgba(16, 23, 34, 0.97); }
}
@media (prefers-reduced-transparency: reduce) {
.wa-root[data-theme='glass'] { --surface: rgba(16, 23, 34, 0.98); }
}
.wa-root *, .wa-root *::before, .wa-root *::after { box-sizing: border-box; }
.wa-root :where(button) { font: inherit; color: inherit; cursor: pointer; background: none; border: 0; padding: 0; }
.wa-launcher {
position: fixed;
z-index: 2147483640;
touch-action: manipulation;
-webkit-tap-highlight-color: transparent;
width: 54px;
height: 54px;
border-radius: 999px;
display: grid;
place-items: center;
color: var(--on-accent);
background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 88%, white), var(--accent));
box-shadow: 0 10px 24px -8px color-mix(in srgb, var(--accent) 60%, transparent), 0 2px 6px rgba(10,27,46,.2);
transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s;
}
.wa-launcher:hover { transform: translateY(-2px) scale(1.03); }
.wa-launcher:active { transform: translateY(0) scale(.98); }
.wa-launcher:focus-visible {
outline: 3px solid #0a1b2e;
outline-offset: 3px;
box-shadow: 0 0 0 3px #fff, 0 10px 24px -8px color-mix(in srgb, var(--accent) 60%, transparent);
}
.wa-launcher-badge {
position: absolute; top: -3px; right: -3px;
min-width: 20px; height: 20px; padding: 0 5px;
border-radius: 999px; background: var(--ink); color: #fff;
font-size: 11px; font-weight: 600; line-height: 20px; text-align: center;
box-shadow: 0 0 0 2px var(--surface);
}
.wa-pos-bottom-right { right: 20px; bottom: 20px; }
.wa-pos-bottom-left  { left: 20px;  bottom: 20px; }
.wa-pos-top-right    { right: 20px; top: 20px; }
.wa-pos-top-left     { left: 20px;  top: 20px; }
@media (prefers-reduced-motion: reduce) {
.wa-root *, .wa-root *::before, .wa-root *::after { animation: none !important; transition: none !important; }
}`;function ge({size:e}){return d("svg",{width:e,height:e,viewBox:"0 0 24 24",fill:"none","aria-hidden":"true",children:[d("circle",{cx:"12",cy:"4.2",r:"1.9",fill:"currentColor"}),d("path",{d:"M4.5 8.2c2.4.9 5 1.3 7.5 1.3s5.1-.4 7.5-1.3",stroke:"currentColor","stroke-width":"1.9","stroke-linecap":"round"}),d("path",{d:"M12 9.5v5m0 0-2.6 5.3M12 14.5l2.6 5.3",stroke:"currentColor","stroke-width":"1.9","stroke-linecap":"round","stroke-linejoin":"round"})]})}var oe=(e,t,n)=>Math.min(Math.max(e,t),Math.max(t,n));function re({engine:e,controller:t,position:n,brandName:o,branded:i,style:r}){U(e);let a=e.activeCount(),f=te(!1),l=c=>{if(c.button!==0||c.pointerType!=="mouse")return;let u=c.currentTarget,b=u.getBoundingClientRect(),L=c.clientX,v=c.clientY,E=c.clientX-b.left,A=c.clientY-b.top,g=!1,h=null;try{u.setPointerCapture(c.pointerId)}catch{}let p=x=>{if(!g&&Math.abs(x.clientX-L)<5&&Math.abs(x.clientY-v)<5)return;g=!0;let y=oe(x.clientX-E,6,window.innerWidth-b.width-6),w=oe(x.clientY-A,6,window.innerHeight-b.height-6);u.style.left=`${y}px`,u.style.top=`${w}px`,u.style.right="auto",u.style.bottom="auto",h={x:y,y:w}},m=()=>{u.removeEventListener("pointermove",p),u.removeEventListener("pointerup",m),u.removeEventListener("pointercancel",m);try{u.releasePointerCapture(c.pointerId)}catch{}g&&h&&(f.current=!0,e.setUiPref("launcherOffset",h))};u.addEventListener("pointermove",p),u.addEventListener("pointerup",m),u.addEventListener("pointercancel",m)};return d("button",{class:`wa-launcher ${n}`,style:r,"aria-label":a>0?I("launcher.openActive",{brand:o,count:a}):I("launcher.open",{brand:o}),"aria-haspopup":"dialog",title:I("launcher.title"),onPointerDown:l,onClick:()=>{if(f.current){f.current=!1;return}t.toggle()},ref:c=>t.setLauncher(c),children:[i?d(z,{size:32}):d(ge,{size:26}),a>0&&d("span",{class:"wa-launcher-badge","aria-hidden":"true",children:a})]})}var ie="#1e40af",he={black:"#000000",white:"#ffffff",red:"#ff0000",green:"#008000",blue:"#0000ff",navy:"#000080",teal:"#008080",purple:"#800080",orange:"#ffa500",gray:"#808080",grey:"#808080"};function $(e){if(!e)return null;let t=String(e).trim().toLowerCase(),n=he[t];if(n)return $(n);let o=/^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(t);if(o){let r=o[1];return(r.length===3||r.length===4)&&(r=r.slice(0,3).split("").map(a=>a+a).join("")),r=r.slice(0,6),[parseInt(r.slice(0,2),16),parseInt(r.slice(2,4),16),parseInt(r.slice(4,6),16)]}let i=/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(t);if(i){let r=[i[1],i[2],i[3]].map(a=>Math.round(Number(a)));return r.some(a=>!Number.isFinite(a)||a<0||a>255)?null:r}return null}function F([e,t,n]){let o=i=>{let r=i/255;return r<=.03928?r/12.92:Math.pow((r+.055)/1.055,2.4)};return .2126*o(e)+.7152*o(t)+.0722*o(n)}function N(e,t){let n=F(e),o=F(t);return(Math.max(n,o)+.05)/(Math.min(n,o)+.05)}var ae=[255,255,255],xe=[10,27,46];function se(e,t,n){return[Math.round(e[0]+(t[0]-e[0])*n),Math.round(e[1]+(t[1]-e[1])*n),Math.round(e[2]+(t[2]-e[2])*n)]}function we(e,t,n=4.5){if(N(e,t)>=n)return e;let o=F(t)>.5?[0,0,0]:[255,255,255],i=0,r=1;for(let a=0;a<12;a++){let f=(i+r)/2;N(se(e,o,f),t)>=n?r=f:i=f}return se(e,o,r)}var ye=([e,t,n])=>`rgb(${e},${t},${n})`;function le(e){let t=$(e),n=!!t,o=t||$(ie),i=n?String(e).trim():ie,r=N(o,ae),a=N(o,xe),f=a>r;return{color:i,onColor:f?"rgb(10,27,46)":"#ffffff",textColor:ye(we(o,ae,4.5)),ratio:f?a:r,valid:n}}function ce({engine:e,config:t,controller:n,loadPanel:o}){let i=U(e),r=ne(i.ui.theme),[a,f]=H(n.isOpen()),[l,c]=H(null),[u,b]=H(!1);W(()=>n.subscribe(f),[n]),W(()=>{!a||l||u||(b(!0),o().then(p=>c(()=>p)).catch(()=>{}).finally(()=>b(!1)))},[a,l,u,o]),W(()=>{let p=m=>{m.altKey&&m.shiftKey&&(m.key==="A"||m.key==="a")&&(m.preventDefault(),n.toggle())};return document.addEventListener("keydown",p),()=>document.removeEventListener("keydown",p)},[n]);let[,L]=H(0);W(()=>{if(typeof window=="undefined")return;let p=0,m=()=>{p||(p=requestAnimationFrame(()=>{p=0,L(x=>x+1)}))};return window.addEventListener("resize",m),()=>{window.removeEventListener("resize",m),p&&cancelAnimationFrame(p)}},[]);let v=`wa-pos-${i.ui.position}`,E,A,g=i.ui.launcherOffset;if(g&&typeof window!="undefined"&&window.innerWidth>640){let y=window.innerWidth,w=window.innerHeight,C=Math.min(Math.max(g.x,8),Math.max(8,y-54-8)),M=Math.min(Math.max(g.y,8),Math.max(8,w-54-8));E={left:`${C}px`,top:`${M}px`,right:"auto",bottom:"auto"};let _=M>w/2,P=C>y/2,V=_?Math.max(8,w-M+14):M+54+14;A={[P?"right":"left"]:`${P?Math.max(8,y-C-54):C}px`,[_?"bottom":"top"]:`${V}px`,maxHeight:`${Math.max(160,w-V-8)}px`},v=""}let h=le(i.ui.accent);return d("div",{class:"wa-root","data-theme":r,style:{"--wa-accent":h.color,"--on-accent":h.onColor,"--wa-accent-text":h.textColor},children:[!t.hideLauncher&&d(re,{engine:e,controller:n,position:v,brandName:t.brandName,branded:t.attribution&&t.brandName==="WebAble",style:E}),a&&l&&d(l,{engine:e,config:t,controller:n,position:v,style:A})]})}function ve(){if(typeof document=="undefined")return null;let e=document.activeElement;for(;e&&e.shadowRoot&&e.shadowRoot.activeElement;)e=e.shadowRoot.activeElement;return e}function ue(e){return!!e&&e.isConnected&&e!==e.ownerDocument.body&&typeof e.focus=="function"}function fe(){let e=!1,t=null,n=null,o=new Set,i=()=>o.forEach(l=>l(e)),r=()=>ue(n)?n:null,a=()=>{let l=r()||t;l&&typeof l.focus=="function"&&requestAnimationFrame(()=>{let c=ue(l)?l:t;try{c==null||c.focus()}catch{}}),n=null},f={isOpen:()=>e,open(){e||(n=ve(),e=!0,i())},close(){e&&(e=!1,i(),a())},toggle(){e?f.close():f.open()},subscribe(l){return o.add(l),()=>o.delete(l)},setLauncher(l){t=l},openedFrom:()=>r()};return f}var T="data-webable-inerted",S=null,k=null;function pe(e,t){let n=[],o=[];if(e.body&&o.push(...Array.from(e.body.children)),e.documentElement)for(let i of Array.from(e.documentElement.children))i.tagName!=="BODY"&&i.tagName!=="HEAD"&&o.push(i);for(let i of o)t&&(i===t||i.contains(t))||n.push(i);return n}function me(e,t){if(e.hasAttribute(T))return;let n=e.hasAttribute("aria-hidden"),o=e.hasAttribute("inert");n||e.setAttribute("aria-hidden","true"),o||e.setAttribute("inert",""),e.setAttribute(T,""),t.push({el:e,hadAriaHidden:n,hadInert:o})}function de(e,t){var i;if(S)return;let n=[];for(let r of pe(e,t))me(r,n);S=n;let o=((i=e.defaultView)==null?void 0:i.MutationObserver)||(typeof MutationObserver=="undefined"?void 0:MutationObserver);if(o){k=new o(()=>{if(S)for(let r of pe(e,t))me(r,S)});for(let r of[e.body,e.documentElement])r&&k.observe(r,{childList:!0})}}function J(e){k==null||k.disconnect(),k=null;let t=S;S=null;for(let{el:n,hadAriaHidden:o,hadInert:i}of t||[])o||n.removeAttribute("aria-hidden"),i||n.removeAttribute("inert"),n.removeAttribute(T);e.querySelectorAll(`[${T}]`).forEach(n=>{n.removeAttribute("aria-hidden"),n.removeAttribute("inert"),n.removeAttribute(T)})}var Y="webable-widget-root";function be(e,t,n){if(e.getElementById(t))return;let o=document.createElement("style");o.id=t,o.textContent=n,e.appendChild(o)}function K(e){var b,L,v,E,A,g,h,p,m,x,y,w,C,M,_;let t=e.doc||document,n=t.getElementById(Y)||null;if(n&&n.__webableApi)return n.__webableApi;let o=t.createElement("div");o.id=Y,o.setAttribute("data-webable","host"),o.style.cssText="all:initial;position:fixed;z-index:2147483640;inset:auto;",t.documentElement.appendChild(o);let i=o.attachShadow({mode:"open"});be(i,"wa-launcher-css",D);let r=t.createElement("div");i.appendChild(r);let a=fe(),f={brandName:((b=e.config)==null?void 0:b.brandName)||"WebAble",attribution:(v=(L=e.config)==null?void 0:L.attribution)!=null?v:!0,accessibilityUrl:(A=(E=e.config)==null?void 0:E.accessibilityUrl)!=null?A:null,showProfiles:(h=(g=e.config)==null?void 0:g.showProfiles)!=null?h:!0,showAI:(m=(p=e.config)==null?void 0:p.showAI)!=null?m:!0,hideLauncher:(y=(x=e.config)==null?void 0:x.hideLauncher)!=null?y:!1,surface:(C=(w=e.config)==null?void 0:w.surface)!=null?C:"widget",tools:(M=e.config)==null?void 0:M.tools},l=async()=>{let P=await import("./Panel.js");return be(i,"wa-panel-css",P.PANEL_CSS),P.Panel};X(d(ce,{engine:e.engine,config:f,controller:a,loadPanel:l}),r);let c=a.subscribe(P=>{P?de(t,o):J(t)});(_=e.config)!=null&&_.autoOpen&&a.open();let u={open:()=>a.open(),close:()=>a.close(),toggle:()=>a.toggle(),isOpen:()=>a.isOpen(),engine:e.engine,destroy(){J(t),c(),X(null,r),o.remove(),e.engine.destroy()}};return o.__webableApi=u,u}var s=window.WebAbleConfig||{},B={};s.position&&(B.position=s.position);s.theme&&(B.theme=s.theme);s.color&&(B.accent=s.color);var Ee=typeof s.tools=="string"?s.tools.split(",").map(e=>e.trim()).filter(Boolean):Array.isArray(s.tools)?s.tools:void 0,O=ee({uiOverrides:B,storage:s.remember===!1?j():void 0,provider:typeof s.aiProxy=="string"&&s.aiProxy?Z(s.aiProxy):void 0}),R=K({engine:O,config:{brandName:s.name||"WebAble",attribution:s.attribution!==!1,accessibilityUrl:s.accessibilityUrl||null,showProfiles:s.profiles!==!1,showAI:s.ai!=="off",hideLauncher:s.hideLauncher===!0,surface:"widget",tools:Ee,autoOpen:s.autoOpen===!0}}),Q={open:()=>R.open(),close:()=>R.close(),toggle:()=>R.toggle(),isOpen:()=>R.isOpen(),destroy:()=>R.destroy(),apply:(e,t)=>O.setFeature(e,t),set:(e,t)=>O.toggleFeature(e,t),applyProfile:e=>O.applyProfile(e),reset:()=>O.resetAll(),engine:O},G=window;G.WebAble=Q;var q=G.__WEBABLE_QUEUE__;if(q&&q.length)for(let[e,t]of q){let n=Q[e];if(typeof n=="function")try{n(...t)}catch{}}G.__WEBABLE_QUEUE__=[];try{document.dispatchEvent(new CustomEvent("webable:ready",{detail:Q}))}catch{}
