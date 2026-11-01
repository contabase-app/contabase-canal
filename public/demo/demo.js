
(function(){'use strict';
var menu=document.querySelector('[data-v2-menu-dialog]');
var trigger=document.querySelector('[data-v2-menu-trigger]');
if(menu&&trigger){trigger.addEventListener('click',function(e){e.preventDefault();if(!menu.open)menu.showModal();});menu.querySelectorAll('[data-v2-menu-close]').forEach(function(b){b.addEventListener('click',function(){menu.close();});});menu.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){if(menu.open)menu.close();});});menu.addEventListener('click',function(e){if(e.target===menu)menu.close();});}
document.querySelectorAll('[data-v2-nav-group]').forEach(function(g){var t=g.querySelector('[data-v2-nav-group-toggle]');var p=g.querySelector('[data-v2-nav-group-panel]');if(!t||!p)return;g.classList.add('is-open');p.hidden=false;t.setAttribute('aria-expanded','true');t.addEventListener('click',function(){p.hidden=!p.hidden;g.classList.toggle('is-open',!p.hidden);t.setAttribute('aria-expanded',String(!p.hidden));});});
document.querySelectorAll('form').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();});f.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.target.closest('textarea,button'))e.preventDefault();});});
document.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;if(a.hasAttribute('data-demo-disabled')||a.getAttribute('href')==='#'){e.preventDefault();}});
var sidebar=document.querySelector('[data-app-shell]');var st=document.querySelector('[data-v2-sidebar-toggle]');if(sidebar&&st){st.addEventListener('click',function(){sidebar.classList.toggle('is-sidebar-collapsed');st.setAttribute('aria-expanded',String(!sidebar.classList.contains('is-sidebar-collapsed')));});}
var current=location.pathname.split('/').pop()||'painel.html';document.querySelectorAll('[data-v2-nav-section],.cb-v2-bottom-nav a,.cb-v2-nav-sub-link').forEach(function(a){if(a.getAttribute('href')===current){a.classList.add('is-active');a.setAttribute('aria-current','page');}});
var lf=document.getElementById('demo-lancamento-container');var lastTrigger=null;
function openLancamento(trigger){if(!lf)return;lastTrigger=trigger;lf.hidden=false;document.body.classList.add('demo-sheet-open');try{if(window.parent&&window.parent!==window)window.parent.postMessage({type:'contabase-demo-form-open'},'*');}catch(e){}var amount=lf.querySelector('#valor');if(amount){setTimeout(function(){amount.focus();},80);}}
function closeLancamento(){if(!lf)return;lf.hidden=true;document.body.classList.remove('demo-sheet-open');if(lastTrigger&&typeof lastTrigger.focus==='function')lastTrigger.focus();}
document.querySelectorAll('[data-demo-new-transaction]').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();openLancamento(b);});});
if(lf){lf.querySelectorAll('[data-onclick="closeBottomSheet"],[data-demo-lancamento-backdrop]').forEach(function(el){el.addEventListener('click',function(e){e.preventDefault();closeLancamento();});});}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&lf&&!lf.hidden)closeLancamento();});
})();